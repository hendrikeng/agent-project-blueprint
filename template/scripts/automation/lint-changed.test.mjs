import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'lint-changed.mjs');

async function fixture(t, files) {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lint-changed-'));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  const binDir = path.join(rootDir, 'node_modules', '.bin');
  await fs.mkdir(binDir, { recursive: true });
  await fs.mkdir(path.join(rootDir, '.venv', 'bin'), { recursive: true });
  for (const [name, content] of Object.entries(files)) await fs.writeFile(path.join(rootDir, name), content, { mode: /^(?:node_modules|\.venv)\//.test(name) ? 0o755 : 0o644 });
  await fs.writeFile(path.join(rootDir, '.gitignore'), 'node_modules/\n.heavy/\n.venv/\n');
  for (const args of [['init', '-q'], ['add', '.'], ['-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-qm', 'seed']]) {
    assert.equal(spawnSync('git', args, { cwd: rootDir }).status, 0);
  }
  await fs.writeFile(path.join(rootDir, 'changed.js'), 'export const value = 1;\n');
  await fs.writeFile(path.join(rootDir, 'changed.py'), 'VALUE = 1\n');
  return rootDir;
}

// Fakes record their argv and exit with the given status.
const fake = (name, status) => `#!/bin/sh\necho "${name}:$*"\nexit ${status}\n`;
const run = (rootDir, env = {}) => spawnSync('node', [scriptPath], {
  cwd: rootDir, encoding: 'utf8', env: { ...process.env, CI: '', AGENT_HEAVY: '0', VERIFY_LINT_BASE: 'HEAD', ...env }
});

test('lint-changed runs oxfmt and oxlint on changed files, in an agent-heavy slot only when local', async (t) => {
  const rootDir = await fixture(t, {
    'package.json': JSON.stringify({ devDependencies: { oxfmt: '0', oxlint: '1' } }),
    'node_modules/.bin/oxfmt': fake('OXFMT', 0),
    'node_modules/.bin/oxlint': fake('OXLINT', 3)
  });
  const heavyDir = path.join(rootDir, '.heavy');
  await fs.mkdir(heavyDir);
  // The agent-heavy fake runs the wrapped command like the real pass-through.
  await fs.writeFile(path.join(heavyDir, 'agent-heavy'), '#!/bin/sh\necho "HEAVY:$*"\nshift\nexec "$@"\n', { mode: 0o755 });
  for (const [name, extraEnv, wrapped] of [['wrapped', { AGENT_HEAVY: '' }, true], ['opted out', {}, false]]) {
    await t.test(name, () => {
      const result = run(rootDir, { ...extraEnv, PATH: `${heavyDir}${path.delimiter}${process.env.PATH}` });
      assert.equal(result.status, 3, result.stderr);
      assert.match(result.stdout, /OXFMT:--check changed\.js/);
      assert.match(result.stdout, /OXLINT:--deny-warnings changed\.js/);
      assert.equal(result.stdout.includes('HEAVY:-- node_modules/.bin/oxlint --deny-warnings changed.js'), wrapped);
    });
  }
});

test('lint-changed runs each configured linter, so Vue projects keep ESLint next to oxlint, and fails on a missing binary', async (t) => {
  const both = await fixture(t, {
    'eslint.config.js': 'export default [];\n', '.oxlintrc.json': '{}\n',
    'node_modules/.bin/eslint': fake('ESLINT', 0), 'node_modules/.bin/oxlint': fake('OXLINT', 0)
  });
  await fs.writeFile(path.join(both, 'Card.vue'), '<template><div /></template>\n');
  const result = run(both);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /OXLINT:--deny-warnings Card\.vue changed\.js/);
  assert.match(result.stdout, /ESLINT:--max-warnings 0 --no-warn-ignored Card\.vue changed\.js/);

  const missing = await fixture(t, { '.oxlintrc.json': '{}\n' });
  const failed = run(missing);
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /oxlint is configured, but node_modules\/\.bin\/oxlint is missing/);
});

test('lint-changed runs Ruff format and check on changed Python files only', async (t) => {
  const rootDir = await fixture(t, { 'pyproject.toml': '[tool.ruff]\nline-length = 100\n', '.venv/bin/ruff': fake('RUFF', 0) });
  const result = run(rootDir);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /RUFF:format --check changed\.py\nRUFF:check changed\.py/);
  assert.doesNotMatch(result.stdout, /changed\.js/);
});
