import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { walkTsFiles } from './check-dependencies.mjs';

test('architecture checks report unwired boundaries and reject retired Nx checks', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'architecture-config-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'docs/governance'), { recursive: true });
  const script = fileURLToPath(new URL('./check-dependencies.mjs', import.meta.url));
  for (const [config, status, expected] of [
    [{ checks: [], rationale: 'No module boundaries in this single-file app.' }, 0, /not enforced:/],
    [{ checks: [] }, 1, /No architecture checks configured/],
    [{ checks: [{ type: 'nx_dep_constraints' }] }, 1, /ARCH_UNKNOWN_CHECK_TYPE/],
    [{ checks: [{ type: 'required_project_tags' }] }, 1, /ARCH_UNKNOWN_CHECK_TYPE/],
    [{ checks: [{ type: 'command_hook', command: ['$NODE', '-e', 'process.exit(0)'] }] }, 0, /passed/],
    [{ checks: [{ type: 'command_hook', command: ['$NODE', '-e', 'process.exit(1)'] }] }, 1, /ARCH_COMMAND_HOOK_FAILED/]
  ]) {
    await fs.writeFile(path.join(root, 'docs/governance/architecture-rules.json'), JSON.stringify(config));
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, status, result.stdout + result.stderr);
    assert.match(result.stdout + result.stderr, expected);
  }
});

test('walkTsFiles includes tsx sources and excludes test files', async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'check-dependencies-'));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  await fs.mkdir(path.join(rootDir, 'src'), { recursive: true });
  await fs.writeFile(path.join(rootDir, 'src', 'view.tsx'), 'export const View = () => null;\n', 'utf8');
  await fs.writeFile(path.join(rootDir, 'src', 'logic.ts'), 'export const logic = 1;\n', 'utf8');
  await fs.writeFile(path.join(rootDir, 'src', 'logic.test.tsx'), 'test("x", () => {});\n', 'utf8');

  const files = (await walkTsFiles(rootDir)).map((filePath) => path.basename(filePath)).sort();
  assert.deepEqual(files, ['logic.ts', 'view.tsx']);
});
