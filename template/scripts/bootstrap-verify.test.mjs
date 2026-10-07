import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const syncScriptPath = path.join(repoRoot, 'scripts', 'harness-sync.mjs');

test('bootstrap-verify resolves repo root when invoked from a nested directory', async (t) => {
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bootstrap-verify-'));
  t.after(() => fs.rm(targetDir, { recursive: true, force: true }));
  const install = spawnSync('node', [syncScriptPath, 'install', '--target', targetDir], {
    cwd: repoRoot,
    encoding: 'utf8'
  });
  assert.equal(install.status, 0);

  const result = spawnSync('bash', ['../scripts/bootstrap-verify.sh'], {
    cwd: path.join(targetDir, 'docs'),
    encoding: 'utf8'
  });

  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stderr, /No such file or directory/);
  assert.match(`${result.stdout}${result.stderr}`, /\[placeholder-check\]/);
});

test('bootstrap runs full verification once and stops before cleanup after a failure', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bootstrap-order-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'scripts'));
  await fs.mkdir(path.join(root, 'docs'));
  await fs.copyFile(new URL('./bootstrap-verify.sh', import.meta.url), path.join(root, 'scripts/bootstrap-verify.sh'));
  await fs.writeFile(path.join(root, 'scripts/check-template-placeholders.sh'), '#!/usr/bin/env bash\necho PLACEHOLDERS\n', { mode: 0o755 });
  const expected = ['run context:compile', 'run eval:refresh', 'run verify:full', 'run bootstrap:cleanup'];
  for (const failure of ['', ...expected]) {
    const result = spawnSync('bash', ['-c', 'npm() { printf "NPM %s\\n" "$*"; [[ "$*" != "$FAIL_COMMAND" ]] || return 7; }; source "$1"', 'fixture', '../scripts/bootstrap-verify.sh'], {
      cwd: path.join(root, 'docs'), encoding: 'utf8', env: { ...process.env, FAIL_COMMAND: failure }
    });
    assert.equal(result.status, failure ? 7 : 0, result.stderr);
    assert.deepEqual(result.stdout.split('\n').filter(line => line.startsWith('NPM ')).map(line => line.slice(4)),
      failure ? expected.slice(0, expected.indexOf(failure) + 1) : expected);
    assert.equal(result.stdout.includes('[bootstrap-verify] passed'), !failure);
  }
});
