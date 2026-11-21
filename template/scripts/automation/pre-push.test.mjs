import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { hookEnv, protectedPushError, pushedBranches } from './pre-push.mjs';
import { createScriptsRepo } from './test-helpers.mjs';

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
  ].join('\n')), [
    { branch: 'slice/x', sha, remoteSha: zero, exists: false, deleted: false },
    { branch: 'fix/y', sha, remoteSha: zero, exists: false, deleted: false },
    { branch: 'old', sha: zero, remoteSha: sha, exists: true, deleted: true },
    { branch: 'gone', sha: zero, remoteSha: sha, exists: true, deleted: true }
  ]);
});

test('pre-push blocks a failed check on the checked-out feature branch and logs each push', async (t) => {
  const root = await createScriptsRepo(t);
  const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  // Stub checks: lint-changed fails while FAIL_LINT is set. The typecheck gate prints GIT_DIR.
  await fs.writeFile(path.join(root, 'scripts/automation/lint-changed.mjs'), "console.log('LINT', process.env.LINT_CHANGED_TRACKED_ONLY, process.env.VERIFY_LINT_BASE); process.exitCode = process.env.FAIL_LINT ? 3 : 0;\n");
  await fs.writeFile(path.join(root, 'scripts/automation/check-project-gates.mjs'), "console.log('TYPECHECK', process.argv.slice(2).join(' '), 'GIT_DIR=' + process.env.GIT_DIR);\n");
  git('init', '-q', '-b', 'dev');
  git('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '--allow-empty', '-m', 'base');
  const baseSha = git('rev-parse', 'HEAD').stdout.trim();
  git('update-ref', 'refs/remotes/origin/dev', baseSha);
  git('checkout', '-q', '-b', 'slice/x');
  await fs.mkdir(path.join(root, 'src'));
  await fs.writeFile(path.join(root, 'src/card.ts'), 'export {};\n');
  git('add', 'src/card.ts');
  git('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'card');
  const sha = git('rev-parse', 'HEAD').stdout.trim();
  const logPath = path.join(root, '.git/pre-push.log');

  const hook = (input, extraEnv = {}) => spawnSync('node', ['scripts/automation/pre-push.mjs'], {
    cwd: root, encoding: 'utf8', input, env: { ...process.env, VERIFY_PRE_PUSH: '', FAIL_LINT: '', ...extraEnv }
  });
  const pushSlice = `refs/heads/slice/x ${sha} refs/heads/slice/x ${'0'.repeat(40)}\n`;

  const passed = hook(pushSlice, { GIT_DIR: path.join(root, '.git') });
  assert.equal(passed.status, 0, passed.stderr);
  // A new branch is checked against the integration branch.
  assert.match(passed.stdout, /LINT 1 origin\/dev\nTYPECHECK --gate typecheck --run GIT_DIR=undefined/);
  // An existing remote branch is checked from its tip: earlier commits passed their own push.
  const update = hook(`refs/heads/slice/x ${sha} refs/heads/slice/x ${baseSha}\n`);
  assert.match(update.stdout, new RegExp(`LINT 1 ${baseSha}`));
  const failed = hook(pushSlice, { FAIL_LINT: '1' });
  assert.equal(failed.status, 1);
  assert.doesNotMatch(failed.stdout, /TYPECHECK/, 'the first failure stops the checks');
  assert.equal(hook(pushSlice, { VERIFY_PRE_PUSH: 'skip', FAIL_LINT: '1' }).status, 0);
  await fs.writeFile(path.join(root, 'src/card.ts'), 'export const dirty = 1;\n');
  assert.equal(hook(pushSlice, { FAIL_LINT: '1' }).status, 0, 'the checks read the working tree, not the pushed commit');
  git('checkout', '-q', '--', 'src/card.ts');
  git('checkout', '-q', 'dev');
  assert.equal(hook(pushSlice, { FAIL_LINT: '1' }).status, 0, 'the checks read the working tree, not the pushed commit');
  const devSha = git('rev-parse', 'HEAD').stdout.trim();
  // The first push creates dev. A push to an existing dev is refused unless the logged escape is set.
  assert.equal(hook(`refs/heads/dev ${devSha} refs/heads/dev ${'0'.repeat(40)}\n`).status, 0);
  // The remote dev is the same commit, so the escape sees a fast-forward.
  const existing = `refs/heads/dev ${devSha} refs/heads/dev ${devSha}\n`;
  const direct = hook(existing);
  assert.equal(direct.status, 1);
  assert.match(direct.stderr, /Direct pushes to dev are not allowed/);
  assert.equal(hook(existing, { ALLOW_PROTECTED_PUSH: '1' }).status, 0);
  const lines = (await fs.readFile(logPath, 'utf8')).trim().split('\n').map((line) => line.split('\t'));
  assert.deepEqual(lines.map((fields) => fields.slice(1, 4)), [
    [sha, 'slice/x', 'pass'],
    [sha, 'slice/x', 'pass'],
    [sha, 'slice/x', 'fail: ./scripts/automation/lint-changed.mjs'],
    [sha, 'slice/x', 'skipped'],
    [sha, 'slice/x', 'skipped: uncommitted changes'],
    [sha, 'slice/x', 'skipped: not checked out'],
    [devSha, 'dev', 'allowed: ALLOW_PROTECTED_PUSH']
  ], 'dev pushes run no checks, and only the escape writes a line');
});

test('pre-push checks do not inherit Git variables of the hook, also not git -c settings', () => {
  const env = hookEnv({ PATH: '/bin', GIT_DIR: '.git', GIT_CONFIG_PARAMETERS: "'core.hooksPath'='x'", GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'user.name', GIT_CONFIG_VALUE_0: 't', GIT_AUTHOR_NAME: 'kept' });
  assert.deepEqual(env, { PATH: '/bin', GIT_AUTHOR_NAME: 'kept' });
});

test('pre-push protects dev and main from direct pushes, deletions, and non-fast-forward escapes', () => {
  const [local, remote, zero] = ['a'.repeat(40), 'b'.repeat(40), '0'.repeat(40)];
  const push = (branch, fields) => ({ branch, sha: local, remoteSha: remote, exists: true, deleted: false, ...fields });
  const forward = () => true;
  const rewrite = () => false;
  assert.equal(protectedPushError(push('slice/x'), false, forward), '');
  assert.equal(protectedPushError(push('main', { remoteSha: zero, exists: false }), false, forward), '', 'the first push creates main');
  assert.match(protectedPushError(push('main'), false, forward), /Direct pushes to main are not allowed/);
  assert.equal(protectedPushError(push('main'), true, forward), '');
  assert.match(protectedPushError(push('main'), true, rewrite), /only a fast-forward/);
  assert.match(protectedPushError(push('dev', { sha: zero, deleted: true }), true, forward), /Deleting dev is not allowed/);
});
