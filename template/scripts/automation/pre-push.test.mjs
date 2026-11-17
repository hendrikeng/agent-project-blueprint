import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { classifyChanges } from '../ci/classify-change.mjs';
import { prePushScope } from './pre-push.mjs';
import { createScriptsRepo } from './test-helpers.mjs';

const change = (filePath) => ({ status: 'M', path: filePath });

test('pre-push selects the local classifier scope only on feature branches', () => {
  for (const branch of ['', 'HEAD', 'dev', 'main', 'release/2026.01.01.1']) {
    assert.equal(prePushScope(branch, [change('src/card.ts')], classifyChanges), null, branch);
  }
  assert.equal(prePushScope('slice/x', [change('src/card.ts')], classifyChanges), 'product');
  assert.equal(prePushScope('slice/x', [change('docs/product-specs/cards.md')], classifyChanges), 'docs');
  assert.equal(prePushScope('fix/x', [change('.github/workflows/ci.yml')], () => 'full'), 'broad');
  assert.equal(prePushScope('fix/x', [], () => 'unexpected'), 'broad');
});

test('pre-push logs a failed fast gate and still lets the push continue', async (t) => {
  const root = await createScriptsRepo(t);
  const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({
    scripts: { 'verify:fast': 'node -e "console.log(process.argv.slice(1).join(\' \')); process.exit(3)"' }
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

  const failed = spawnSync('node', ['scripts/automation/pre-push.mjs'], { cwd: root, encoding: 'utf8', env: { ...process.env, VERIFY_PRE_PUSH: '' } });
  assert.equal(failed.status, 0, failed.stderr);
  assert.match(failed.stdout, /--scope product/);
  const skipped = spawnSync('node', ['scripts/automation/pre-push.mjs'], { cwd: root, encoding: 'utf8', env: { ...process.env, VERIFY_PRE_PUSH: 'skip' } });
  assert.equal(skipped.status, 0, skipped.stderr);
  const lines = (await fs.readFile(logPath, 'utf8')).trim().split('\n').map((line) => line.split('\t'));
  assert.deepEqual(lines.map((fields) => fields.slice(1, 5)), [[sha, 'slice/x', 'product', 'fail'], [sha, 'slice/x', 'product', 'skipped']]);

  git('checkout', '-q', 'dev');
  assert.equal(spawnSync('node', ['scripts/automation/pre-push.mjs'], { cwd: root }).status, 0);
  assert.equal((await fs.readFile(logPath, 'utf8')).trim().split('\n').length, 2, 'dev pushes run no gate');
});
