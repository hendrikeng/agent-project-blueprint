import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';

import { createTemplateRepo, runNode } from './test-helpers.mjs';

test('verify-full dry-run expands to fast plus merge-level checks', async () => {
  const rootDir = await createTemplateRepo();
  const result = runNode(path.join(rootDir, 'scripts', 'automation', 'verify-full.mjs'), ['--dry-run'], rootDir);

  assert.equal(result.status, 0, String(result.stderr));
  const stdout = String(result.stdout);
  assert.match(stdout, /verify-fast/);
  assert.match(stdout, /check-article-conformance/);
  assert.match(stdout, /check-dependencies/);
  // Fast verification owns strict eval and agent checks; full must not repeat them.
  assert.doesNotMatch(stdout, /check-agent-hardening|check-evals/);
  assert.match(stdout, /check-project-gates\.mjs --profile full --run/);

  const commands = stdout.split('\n').filter((line) => line.includes('dry-run:'));
  for (const [args, expected] of [
    [['--skip-fast'], commands.slice(1)],
    [['--skip-fast', 'true'], commands.slice(1)],
    [['--skip-fast', 'false'], commands],
    [['--skip-fast', 'invalid'], commands]
  ]) {
    const variant = runNode(path.join(rootDir, 'scripts/automation/verify-full.mjs'), ['--dry-run', ...args], rootDir);
    assert.equal(variant.status, 0, String(variant.stderr));
    assert.deepEqual(String(variant.stdout).split('\n').filter((line) => line.includes('dry-run:')), expected);
  }
});

test('verify-full runs every remaining check and propagates child failures', async () => {
  const rootDir = await createTemplateRepo();
  const checks = [
    'scripts/automation/verify-fast.mjs',
    'scripts/check-article-conformance.mjs',
    'scripts/architecture/check-dependencies.mjs',
    'scripts/automation/check-project-gates.mjs'
  ];
  for (const check of checks) {
    await fs.writeFile(path.join(rootDir, check), `
      console.log('CHECK ' + ${JSON.stringify(check)} + ' ' + process.argv.slice(2).join(' '));
      if (process.env.FAIL_CHECK === ${JSON.stringify(check)}) process.exit(7);
    `);
  }
  const script = path.join(rootDir, 'scripts/automation/verify-full.mjs');
  for (const skipFast of [false, true]) {
    const args = skipFast ? ['--skip-fast'] : [];
    const expected = skipFast ? checks.slice(1) : checks;
    const result = runNode(script, args, rootDir, { FAIL_CHECK: '' });
    assert.equal(result.status, 0, String(result.stderr));
    assert.deepEqual(String(result.stdout).split('\n').filter((line) => line.startsWith('CHECK ')),
      expected.map((check) => `CHECK ${check} ${check === checks.at(-1) ? '--profile full --run' : ''}`));
    const failed = runNode(script, args, rootDir, { FAIL_CHECK: expected[0] });
    assert.equal(failed.status, 7, String(failed.stderr));
    assert.doesNotMatch(String(failed.stdout), /CHECK scripts\/architecture\/check-dependencies/);
    assert.doesNotMatch(String(failed.stdout), /\[verify-full\] passed/);
    const projectFailure = runNode(script, args, rootDir, { FAIL_CHECK: checks.at(-1) });
    assert.equal(projectFailure.status, 7, String(projectFailure.stderr));
    assert.doesNotMatch(String(projectFailure.stdout), /\[verify-full\] passed/);
  }
});
