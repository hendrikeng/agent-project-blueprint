import test from 'node:test';
import assert from 'node:assert/strict';
import { globSync, readFileSync } from 'node:fs';
import { resolveCloseoutBranch } from '../template/scripts/automation/plan-closeout-lib.mjs';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('root and smoke own separate suites without losing bootstrap or harness tests', () => {
  assert.ok(read('scripts/ci/run-root-tests.mjs').includes("globSync(['scripts/**/*.test.mjs', 'template/scripts/*.test.mjs'])"));
  assert.match(read('scripts/ci/run-template-smoke.mjs'), /'npm run verify:fast'/);
  const { scripts } = JSON.parse(read('template/package.scripts.fragment.json'));
  const patterns = scripts['harness:test'].replace('node --test ', '').split(' ');
  const cwd = new URL('../template/', import.meta.url);
  assert.deepEqual(
    [...globSync(patterns, { cwd }), ...globSync('scripts/*.test.mjs', { cwd })].sort(),
    globSync('scripts/**/*.test.mjs', { cwd }).sort(),
  );
  assert.ok(patterns.includes('scripts/ci/*.test.mjs'));
  assert.ok(read('template/scripts/automation/check-harness-alignment.mjs').includes(scripts['harness:test']));
  const source = read('scripts/ci/run-golden-adopted-repo.mjs');
  assert.ok(source.includes("env: { ...process.env, ...extraEnv, GITHUB_ACTIONS: 'false' }"));
  const parentEnv = { GITHUB_ACTIONS: 'true', GITHUB_SHA: 'a'.repeat(40) };
  const branch = 'release/2026.05.12.1';
  assert.throws(() => resolveCloseoutBranch(branch, 'b'.repeat(40), parentEnv));
  assert.equal(resolveCloseoutBranch(branch, 'b'.repeat(40), { ...parentEnv, GITHUB_ACTIONS: 'false' }), branch);
  const golden = source.split('  const commands = [')[1].split('  ];')[0];
  assert.ok(golden.includes("'npm run verify:full'"));
  assert.ok(!golden.includes("'npm run verify:fast'"));
});
