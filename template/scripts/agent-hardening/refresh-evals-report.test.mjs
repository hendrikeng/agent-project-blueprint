import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { evalInputPaths } from './eval-input-hash.mjs';

const harnessRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const scriptPath = path.join(harnessRoot, 'scripts', 'agent-hardening', 'refresh-evals-report.mjs');

test('eval refresh rejects report paths outside the repository', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eval-refresh-path-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'docs', 'agent-hardening'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'docs', 'agent-hardening', 'evals.config.json'),
    JSON.stringify({ reportPath: '../outside.json', requiredFailureFixtures: [] })
  );
  const result = spawnSync('node', [scriptPath], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /escapes repository root/);
});

test('eval refresh rejects symlinked reports and parent directories without external writes', async (t) => {
  for (const parent of [false, true]) {
    await t.test(parent ? 'parent directory' : 'report file', async (t) => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eval-refresh-link-'));
      t.after(() => fs.rm(root, { recursive: true, force: true }));
      const external = await fs.mkdtemp(path.join(os.tmpdir(), 'eval-refresh-external-'));
      t.after(() => fs.rm(external, { recursive: true, force: true }));
      const original = JSON.stringify({ inputSha256: 'old' });
      await fs.writeFile(path.join(external, 'report.json'), original);
      const config = { reportPath: 'reports/report.json', requiredFailureFixtures: [], runtime: {} };
      for (const relative of evalInputPaths(config)) {
        await fs.mkdir(path.dirname(path.join(root, relative)), { recursive: true });
        await fs.writeFile(path.join(root, relative), relative);
      }
      await fs.writeFile(path.join(root, 'docs/agent-hardening/evals.config.json'), JSON.stringify(config));
      if (parent) {
        await fs.symlink(external, path.join(root, 'reports'));
      } else {
        await fs.mkdir(path.join(root, 'reports'));
        await fs.symlink(path.join(external, 'report.json'), path.join(root, 'reports/report.json'));
      }
      const result = spawnSync('node', [scriptPath], { cwd: root, encoding: 'utf8' });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /contains a symlink/);
      assert.equal(await fs.readFile(path.join(external, 'report.json'), 'utf8'), original);
    });
  }
});
