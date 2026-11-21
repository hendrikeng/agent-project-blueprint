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
  for (const [name, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(rootDir, name)), { recursive: true });
    await fs.writeFile(path.join(rootDir, name), content, { mode: /^(?:node_modules|\.venv)\//.test(name) ? 0o755 : 0o644 });
  }
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
// A Node package whose bin records its argv. Node runs it directly, without node_modules/.bin.
const pkg = (name, label, status) => ({
  [`node_modules/${name}/package.json`]: JSON.stringify({ name, bin: { [name]: 'cli.js' } }),
  [`node_modules/${name}/cli.js`]: `console.log('${label}:' + process.argv.slice(2).join(' ')); process.exit(${status});\n`
});
const run = (rootDir, env = {}) => spawnSync('node', [scriptPath], {
  cwd: rootDir, encoding: 'utf8', env: { ...process.env, CI: '', AGENT_HEAVY: '0', VERIFY_LINT_BASE: 'HEAD', ...env }
});

test('lint-changed runs oxfmt and oxlint on changed files, in an agent-heavy slot only when local', async (t) => {
  const rootDir = await fixture(t, {
    'package.json': JSON.stringify({ devDependencies: { oxfmt: '0', oxlint: '1' } }),
    ...pkg('oxfmt', 'OXFMT', 0),
    ...pkg('oxlint', 'OXLINT', 3)
  });
  const heavyDir = path.join(rootDir, '.heavy');
  await fs.mkdir(heavyDir);
  // The agent-heavy fake runs the wrapped command like the real pass-through.
  await fs.writeFile(path.join(heavyDir, 'agent-heavy'), '#!/bin/sh\necho "HEAVY:$*"\nshift\nexec "$@"\n', { mode: 0o755 });
  for (const [name, extraEnv, wrapped] of [['wrapped', { AGENT_HEAVY: '' }, true], ['opted out', {}, false]]) {
    await t.test(name, () => {
      const result = run(rootDir, { ...extraEnv, PATH: `${heavyDir}${path.delimiter}${process.env.PATH}` });
      assert.equal(result.status, 3, result.stderr);
      // A change to ignored files only must pass, so both tools accept an empty file selection.
      assert.match(result.stdout, /OXFMT:--check --no-error-on-unmatched-pattern -- changed\.js/);
      assert.match(result.stdout, /OXLINT:--deny-warnings --no-error-on-unmatched-pattern -- changed\.js/);
      assert.equal(result.stdout.includes(`HEAVY:-- ${process.execPath} node_modules/oxlint/cli.js --deny-warnings --no-error-on-unmatched-pattern -- changed.js`), wrapped);
    });
  }
});

test('lint-changed runs each configured linter, so Vue projects keep ESLint next to oxlint, and fails on a missing binary', async (t) => {
  const both = await fixture(t, {
    'eslint.config.js': 'export default [];\n', '.oxlintrc.json': '{}\n',
    ...pkg('eslint', 'ESLINT', 0), ...pkg('oxlint', 'OXLINT', 0)
  });
  await fs.writeFile(path.join(both, 'Card.vue'), '<template><div /></template>\n');
  const result = run(both);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /OXLINT:--deny-warnings --no-error-on-unmatched-pattern -- Card\.vue changed\.js/);
  assert.match(result.stdout, /ESLINT:--max-warnings 0 --no-warn-ignored -- Card\.vue changed\.js/);

  const missing = await fixture(t, { '.oxlintrc.json': '{}\n' });
  const failed = run(missing);
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /oxlint is configured, but node_modules\/oxlint is missing/);
});

test('lint-changed runs Ruff format and check on changed Python files only', async (t) => {
  const rootDir = await fixture(t, { 'pyproject.toml': '[tool.ruff]\nline-length = 100\n', '.venv/bin/ruff': fake('RUFF', 0) });
  const result = run(rootDir);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /RUFF:format --check -- changed\.py\nRUFF:check -- changed\.py/);
  assert.doesNotMatch(result.stdout, /changed\.js/);
});

test('lint-changed observes configured tools, can skip untracked files, and runs Yarn under Plug and Play', async (t) => {
  const rootDir = await fixture(t, {
    'pyproject.toml': '[tool.ruff]\n', '.venv/bin/ruff': fake('RUFF', 1),
    'package.json': JSON.stringify({ devDependencies: { oxlint: '1' } }), '.pnp.cjs': '\n'
  });
  await fs.mkdir(path.join(rootDir, 'docs/governance'), { recursive: true });
  await fs.writeFile(path.join(rootDir, 'docs/governance/policy-manifest.json'), JSON.stringify({ validationPolicy: { changedFileObserve: ['ruff-format'] } }));
  const yarnDir = path.join(rootDir, '.heavy');
  await fs.mkdir(yarnDir);
  await fs.writeFile(path.join(yarnDir, 'yarn'), fake('YARN', 0), { mode: 0o755 });
  const env = { PATH: `${yarnDir}${path.delimiter}${process.env.PATH}` };

  const result = run(rootDir, env);
  assert.equal(result.status, 1, 'ruff check still blocks');
  assert.match(result.stdout, /ruff-format found problems\. Observe mode: the check does not fail\./);
  assert.doesNotMatch(result.stdout, /ruff-check found problems/);
  assert.match(result.stdout, /YARN:oxlint --deny-warnings --no-error-on-unmatched-pattern -- changed\.js/);
  // changed.js and changed.py are untracked, so the tracked-only run has nothing to check.
  const tracked = run(rootDir, { ...env, LINT_CHANGED_TRACKED_ONLY: '1' });
  assert.equal(tracked.status, 0, tracked.stderr);
  assert.match(tracked.stdout, /found no lintable files/);
  // Observe mode accepts only findings (exit code 1), not a crash or a configuration error.
  await fs.writeFile(path.join(rootDir, '.venv/bin/ruff'), fake('RUFF', 2), { mode: 0o755 });
  assert.equal(run(rootDir, env).status, 2);
  // From the hook, a Git failure fails instead of passing without a check.
  await fs.rename(path.join(rootDir, '.git'), path.join(rootDir, 'git-moved'));
  const noGit = run(rootDir, { ...env, LINT_CHANGED_TRACKED_ONLY: '1', GIT_CEILING_DIRECTORIES: path.dirname(rootDir) });
  assert.equal(noGit.status, 1);
  assert.match(noGit.stderr, /Git failed in this repository/);
});

test('lint-changed from the hook checks every tracked file without a comparison base, not only the last commit', async (t) => {
  const rootDir = await fixture(t, { '.oxlintrc.json': '{}\n', ...pkg('oxlint', 'OXLINT', 0) });
  for (const args of [['add', 'changed.js'], ['-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-qm', 'change']]) {
    assert.equal(spawnSync('git', args, { cwd: rootDir }).status, 0);
  }
  const result = run(rootDir, { VERIFY_LINT_BASE: '', GITHUB_BASE_REF: '', LINT_CHANGED_TRACKED_ONLY: '1' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /OXLINT:--deny-warnings --no-error-on-unmatched-pattern -- changed\.js/);
  assert.equal(run(rootDir, { VERIFY_LINT_BASE: '', GITHUB_BASE_REF: '' }).status, 0, 'outside the hook HEAD^ stays the fallback');
  assert.equal(run(rootDir, { VERIFY_LINT_BASE: 'HEAD^', GITHUB_BASE_REF: '', LINT_CHANGED_TRACKED_ONLY: '1' }).status, 0, 'an explicit HEAD^ is accepted');
});

test('observe mode still fails when oxlint or oxfmt reports a broken configuration with exit code 1', async (t) => {
  const rootDir = await fixture(t, {
    '.oxlintrc.json': '{bad\n',
    [`node_modules/oxlint/package.json`]: JSON.stringify({ name: 'oxlint', bin: { oxlint: 'cli.js' } }),
    [`node_modules/oxlint/cli.js`]: "console.error('Failed to parse oxlint configuration file.'); process.exit(1);\n"
  });
  await fs.mkdir(path.join(rootDir, 'docs/governance'), { recursive: true });
  await fs.writeFile(path.join(rootDir, 'docs/governance/policy-manifest.json'), JSON.stringify({ validationPolicy: { changedFileObserve: ['oxlint'] } }));
  const result = run(rootDir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Failed to parse oxlint configuration file\./);
  assert.match(result.stderr, /oxlint did not run: configuration error/);
  // Findings alone keep the observe mode.
  await fs.writeFile(path.join(rootDir, 'node_modules/oxlint/cli.js'), "console.log('x no-unused-vars'); process.exit(1);\n");
  const findings = run(rootDir);
  assert.equal(findings.status, 0, findings.stderr);
  assert.match(findings.stdout, /oxlint found problems\. Observe mode/);
});

test('lint-changed passes file names after `--`, so a name like an option stays a file', async (t) => {
  const rootDir = await fixture(t, { 'pyproject.toml': '[tool.ruff]\n', '.venv/bin/ruff': fake('RUFF', 0) });
  await fs.writeFile(path.join(rootDir, '--exit-zero.py'), 'VALUE = 1\n');
  const result = run(rootDir);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /RUFF:check -- --exit-zero\.py changed\.py/);
});
