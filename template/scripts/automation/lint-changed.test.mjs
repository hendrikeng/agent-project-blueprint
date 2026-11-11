import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'lint-changed.mjs');

test('lint-changed runs ESLint on changed files in an agent-heavy slot only when local and available', async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lint-changed-'));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  const binDir = path.join(rootDir, '.bin');
  await fs.mkdir(binDir);
  // Fakes record their argv. The agent-heavy fake runs the wrapped command like the real pass-through.
  await fs.writeFile(path.join(binDir, 'agent-heavy'), '#!/bin/sh\necho "HEAVY:$*"\nshift\nexec "$@"\n', { mode: 0o755 });
  await fs.writeFile(path.join(binDir, 'npx'), '#!/bin/sh\necho "NPX:$*"\nexit 3\n', { mode: 0o755 });
  await fs.writeFile(path.join(rootDir, 'eslint.config.js'), 'export default [];\n');
  for (const args of [['init', '-q'], ['add', 'eslint.config.js'], ['-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-qm', 'seed']]) {
    assert.equal(spawnSync('git', args, { cwd: rootDir }).status, 0);
  }
  await fs.writeFile(path.join(rootDir, '.gitignore'), '.bin/\n');
  await fs.writeFile(path.join(rootDir, 'changed.js'), 'export const value = 1;\n');

  const env = { ...process.env, CI: '', AGENT_HEAVY: '', VERIFY_LINT_BASE: 'HEAD', PATH: `${binDir}${path.delimiter}${process.env.PATH}` };
  const eslintArgs = 'eslint --max-warnings 0 --no-warn-ignored changed.js';
  for (const [name, extraEnv, wrapped] of [['wrapped', {}, true], ['opted out', { AGENT_HEAVY: '0' }, false]]) {
    await t.test(name, () => {
      const result = spawnSync('node', [scriptPath], { cwd: rootDir, encoding: 'utf8', env: { ...env, ...extraEnv } });
      assert.equal(result.status, 3, result.stderr);
      assert.match(result.stdout, new RegExp(`NPX:${eslintArgs}`));
      assert.equal(result.stdout.includes(`HEAVY:-- npx ${eslintArgs}`), wrapped);
    });
  }
});
