import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { createTemplateRepo, runNode } from './test-helpers.mjs';

test('verify-fast dry-run lists the flat queue safety checks', async () => {
  const rootDir = await createTemplateRepo();
  const result = runNode(path.join(rootDir, 'scripts', 'automation', 'verify-fast.mjs'), ['--dry-run'], rootDir);

  assert.equal(result.status, 0, String(result.stderr));
  const stdout = String(result.stdout);
  assert.match(stdout, /compile-runtime-context/);
  assert.match(stdout, /check-plan-metadata/);
  assert.match(stdout, /check-harness-alignment/);
  assert.doesNotMatch(stdout, /check-performance-budgets/);
});

test('verify-fast scopes product and docs without weakening strict eval verification', async () => {
  const rootDir = await createTemplateRepo();
  const script = path.join(rootDir, 'scripts/automation/verify-fast.mjs');
  for (const scope of ['product', 'docs', 'harness', 'broad']) {
    const result = runNode(script, ['--dry-run', '--scope', scope], rootDir);
    assert.equal(result.status, 0, String(result.stderr));
    const output = String(result.stdout);
    for (const check of ['check-evals', 'check-governance', 'check-plan-closeout', 'check-quality-score', 'check-harness-alignment']) assert.ok(output.includes(check), check);
    assert.equal(output.includes('npm run harness:test'), ['harness', 'broad'].includes(scope));
    assert.equal(output.includes('--profile fast --run'), ['product', 'broad'].includes(scope));
    assert.equal(output.includes('check-agent-hardening'), ['harness', 'broad'].includes(scope));
  }
  assert.equal(runNode(script, ['--scope', 'metadata'], rootDir).status, 1);
});

test('verify-fast adds architecture verification when architecture files changed', async () => {
  const rootDir = await createTemplateRepo();
  const result = runNode(
    path.join(rootDir, 'scripts', 'automation', 'verify-fast.mjs'),
    ['--dry-run'],
    rootDir,
    { VERIFY_FAST_FILES: 'ARCHITECTURE.md' }
  );

  assert.equal(result.status, 0, String(result.stderr));
  assert.match(String(result.stdout), /check-dependencies/);
});

test('verify-fast can scope plan metadata verification to one plan', async () => {
  const rootDir = await createTemplateRepo();
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

test('verify-fast checks plan references without mutation in every environment', async () => {
  const rootDir = await createTemplateRepo();
  const result = runNode(
    path.join(rootDir, 'scripts', 'automation', 'verify-fast.mjs'),
    ['--dry-run'],
    rootDir,
    { CI: '1' }
  );

  assert.equal(result.status, 0, String(result.stderr));
  assert.match(String(result.stdout), /repair-plan-references\.mjs --check/);
});
