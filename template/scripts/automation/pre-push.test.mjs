import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { prePushScope, pushedBranches } from './pre-push.mjs';
import { createScriptsRepo } from './test-helpers.mjs';

const change = (filePath) => ({ status: 'M', path: filePath });

// The classifier is project-owned, so these tests use stubs instead of its categories.
test('pre-push selects the local classifier scope only on feature branches', () => {
  const entries = [{ status: 'M', path: 'src/card.ts' }];
  for (const branch of ['', 'HEAD', 'dev', 'main', 'release/2026.01.01.1']) {
    assert.equal(prePushScope(branch, entries, () => 'product'), null, branch);
  }
  for (const scope of ['product', 'docs', 'harness']) assert.equal(prePushScope('slice/x', entries, () => scope), scope);
  assert.equal(prePushScope('fix/x', entries, () => 'full'), 'broad');
  assert.equal(prePushScope('fix/x', [], () => 'unexpected'), 'broad');
});

test('pre-push reads pushed branches from Git and ignores deletions and tags', () => {
  const sha = 'a'.repeat(40);
  const zero = '0'.repeat(40);
  assert.deepEqual(pushedBranches([
    `refs/heads/slice/x ${sha} refs/heads/slice/x ${zero}`,
    `HEAD ${sha} refs/heads/fix/y ${zero}`,
    `(delete) ${zero} refs/heads/old ${sha}`,
    `refs/heads/gone ${zero} refs/heads/gone ${sha}`,
    `refs/tags/v1 ${sha} refs/tags/v1 ${zero}`,
    ''
  ].join('\n')), [{ branch: 'slice/x', sha }, { branch: 'fix/y', sha }]);
});

test('pre-push logs a failed fast gate and still lets the push continue', async (t) => {
  const root = await createScriptsRepo(t);
  const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  await fs.writeFile(path.join(root, 'scripts/ci/classify-change.mjs'), "export const classifyChanges = (entries) => entries.some(({ path }) => path === 'src/card.ts') ? 'product' : 'broad';\n");
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({
    scripts: { 'verify:fast': 'node -e "console.log(process.argv.slice(1).join(\' \'), \'GIT_DIR=\' + process.env.GIT_DIR); process.exitCode = 3" --' }
  }));
  git('init', '-q', '-b', 'dev');
  git('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '--allow-empty', '-m', 'base');
  git('update-ref', 'refs/remotes/origin/dev', 'HEAD');
  git('checkout', '-q', '-b', 'slice/x');
  await fs.mkdir(path.join(root, 'src'));
  await fs.writeFile(path.join(root, 'src/card.ts'), 'export {};\n');
  git('add', 'src/card.ts');
  git('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'card');
  const sha = git('rev-parse', 'HEAD').stdout.trim();
  const logPath = path.join(root, '.git/verify-fast-pre-push.log');

  const hook = (input, extraEnv = {}) => spawnSync('node', ['scripts/automation/pre-push.mjs'], {
    cwd: root, encoding: 'utf8', input, env: { ...process.env, VERIFY_PRE_PUSH: '', ...extraEnv }
  });
  const pushSlice = `refs/heads/slice/x ${sha} refs/heads/slice/x ${'0'.repeat(40)}\n`;

  const failed = hook(pushSlice, { GIT_DIR: path.join(root, '.git') });
  assert.equal(failed.status, 0, failed.stderr);
  assert.match(failed.stdout, /--scope product GIT_DIR=undefined/);
  assert.equal(hook(pushSlice, { VERIFY_PRE_PUSH: 'skip' }).status, 0);
  await fs.writeFile(path.join(root, 'src/card.ts'), 'export const dirty = 1;\n');
  assert.doesNotMatch(hook(pushSlice).stdout, /--scope/, 'the gate checks the working tree, not the pushed commit');
  git('checkout', '-q', '--', 'src/card.ts');
  git('checkout', '-q', 'dev');
  const elsewhere = hook(pushSlice);
  assert.equal(elsewhere.status, 0, elsewhere.stderr);
  assert.doesNotMatch(elsewhere.stdout, /--scope/, 'the gate checks the working tree, not the pushed commit');
  // A protected branch writes nothing, even without an origin/dev ref.
  git('update-ref', '-d', 'refs/remotes/origin/dev');
  const devSha = git('rev-parse', 'HEAD').stdout.trim();
  assert.equal(hook(`refs/heads/dev ${devSha} refs/heads/dev ${'0'.repeat(40)}\n`).status, 0);
  const lines = (await fs.readFile(logPath, 'utf8')).trim().split('\n').map((line) => line.split('\t'));
  assert.deepEqual(lines.map((fields) => fields.slice(1, 5)), [
    [sha, 'slice/x', 'product', 'fail'],
    [sha, 'slice/x', '', 'skipped'],
    [sha, 'slice/x', '', 'skipped: uncommitted changes'],
    [sha, 'slice/x', '', 'skipped: not checked out']
  ], 'dev pushes run no gate and write no line');
});
