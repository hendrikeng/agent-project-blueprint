import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

import { createScriptsRepo, runNode } from './test-helpers.mjs';

test('verify-fast dry-run lists the flat queue safety checks', async (t) => {
  const rootDir = await createScriptsRepo(t);
  const result = runNode(path.join(rootDir, 'scripts', 'automation', 'verify-fast.mjs'), ['--dry-run'], rootDir, { CI: '1' });

  assert.equal(result.status, 0, String(result.stderr));
  const stdout = String(result.stdout);
  assert.match(stdout, /compile-runtime-context/);
  assert.match(stdout, /repair-plan-references\.mjs --check/);
  assert.match(stdout, /check-plan-metadata/);
  assert.match(stdout, /check-harness-alignment/);
  assert.doesNotMatch(stdout, /check-performance-budgets/);
});

test('verify-fast scopes product and docs while distinguishing eval integrity from activation', async (t) => {
  const rootDir = await createScriptsRepo(t);
  const script = path.join(rootDir, 'scripts/automation/verify-fast.mjs');
  for (const scope of ['product', 'docs', 'harness', 'broad']) {
    const result = runNode(script, ['--dry-run', '--scope', scope], rootDir);
    assert.equal(result.status, 0, String(result.stderr));
    const output = String(result.stdout);
    for (const check of ['eval:integrity', 'compile-runtime-context.mjs --check', 'check-governance', 'check-plan-closeout', 'check-harness-alignment']) assert.ok(output.includes(check), check);
    assert.equal(output.includes('npm run eval:verify'), false);
    assert.equal(output.includes('check-quality-score'), false);
    assert.equal(output.includes('node --run harness:test'), ['harness', 'broad'].includes(scope));
    assert.equal(output.includes('--profile fast --run'), ['product', 'broad'].includes(scope));
    assert.equal(output.includes('check-agent-hardening'), ['harness', 'broad'].includes(scope));
  }
  assert.equal(runNode(script, ['--scope', 'metadata'], rootDir).status, 1);
});

test('verify-fast adds architecture verification when architecture files changed', async (t) => {
  const rootDir = await createScriptsRepo(t);
  const result = runNode(
    path.join(rootDir, 'scripts', 'automation', 'verify-fast.mjs'),
    ['--dry-run'],
    rootDir,
    { VERIFY_FAST_FILES: 'ARCHITECTURE.md' }
  );

  assert.equal(result.status, 0, String(result.stderr));
  assert.match(String(result.stdout), /check-dependencies/);
});

test('verify-fast can scope plan metadata verification to one plan', async (t) => {
  const rootDir = await createScriptsRepo(t);
  const result = runNode(
    path.join(rootDir, 'scripts', 'automation', 'verify-fast.mjs'),
    ['--dry-run'],
    rootDir,
    { CI: '', VERIFY_PLAN_ID: 'red-inbox' }
  );

  assert.equal(result.status, 0, String(result.stderr));
  assert.match(String(result.stdout), /repair-plan-references\.mjs --check/);
  assert.match(String(result.stdout), /check-plan-metadata\.mjs --plan-id red-inbox/);
});

test('verify-fast predicts plan closeout against the configured integration ref only when the project opts in', async (t) => {
  const rootDir = await createScriptsRepo(t);
  const script = path.join(rootDir, 'scripts/automation/verify-fast.mjs');
  const git = (...args) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: rootDir, encoding: 'utf8' }).stdout.trim();
  git('init', '-q', '-b', 'main');
  git('commit', '-q', '--allow-empty', '-m', 'base');
  const base = git('rev-parse', 'HEAD');
  git('update-ref', 'refs/remotes/origin/main', base);
  git('checkout', '-q', '-b', 'slice/x');
  git('commit', '-q', '--allow-empty', '-m', 'change');
  const closeout = (env = {}) => String(runNode(script, ['--dry-run', '--scope', 'docs'], rootDir, { GITHUB_ACTIONS: '', PLAN_CLOSEOUT_BASE_REF: '', VERIFY_FAST_SKIP_CLOSEOUT: '', ...env }).stdout)
    .split('\n').find((line) => line.includes('check-plan-closeout.mjs'));
  const plain = '[verify-fast] dry-run: node ./scripts/automation/check-plan-closeout.mjs';

  assert.equal(closeout(), plain, 'without configuration the local run keeps the iteration mode');
  await fs.mkdir(path.join(rootDir, 'docs/governance'), { recursive: true });
  await fs.writeFile(path.join(rootDir, 'docs/governance/policy-manifest.json'), JSON.stringify({ validationPolicy: { closeoutPredictionRef: 'origin/main' } }));
  assert.equal(closeout(), `[verify-fast] dry-run: PLAN_CLOSEOUT_BASE_REF=${base} PLAN_CLOSEOUT_BRANCH_NAME=main node ./scripts/automation/check-plan-closeout.mjs`);
  await fs.writeFile(path.join(rootDir, 'docs/governance/policy-manifest.json'), JSON.stringify({ validationPolicy: { closeoutPredictionRef: 'refs/remotes/origin/main' } }));
  assert.match(closeout(), /PLAN_CLOSEOUT_BRANCH_NAME=main node/);
  // A local release branch keeps its full name: release/ is not a remote.
  git('branch', 'release/2026.11.01.1', base);
  await fs.writeFile(path.join(rootDir, 'docs/governance/policy-manifest.json'), JSON.stringify({ validationPolicy: { closeoutPredictionRef: 'release/2026.11.01.1' } }));
  assert.match(closeout(), /PLAN_CLOSEOUT_BRANCH_NAME=release\/2026\.11\.01\.1 node/);
  git('remote', 'add', 'origin', 'https://example.invalid/repo.git');
  git('update-ref', 'refs/remotes/origin/main', base);
  await fs.writeFile(path.join(rootDir, 'docs/governance/policy-manifest.json'), JSON.stringify({ validationPolicy: { closeoutPredictionRef: 'origin/main' } }));
  assert.match(closeout(), /PLAN_CLOSEOUT_BRANCH_NAME=main node/);
  assert.equal(closeout({ VERIFY_FAST_SKIP_CLOSEOUT: '1' }), plain);
  assert.equal(closeout({ GITHUB_ACTIONS: 'true' }), plain);
  git('checkout', '-q', 'main');
  assert.equal(closeout(), plain, 'no commits ahead of the ref');
  git('update-ref', '-d', 'refs/remotes/origin/main');
  assert.equal(closeout(), plain, 'a missing ref keeps the iteration mode');
});
