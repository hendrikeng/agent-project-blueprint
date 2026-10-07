import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { computeEvalInputSha256, evalInputPaths } from './eval-input-hash.mjs';

test('eval hash covers governed inputs and rejects invalid additional paths', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eval-input-hash-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const config = {
    requiredFailureFixtures: [{ path: 'docs/agent-hardening/eval-fixtures/failure.json' }],
    additionalInputPaths: ['runtime.json']
  };
  for (const relative of evalInputPaths(config)) {
    await fs.mkdir(path.dirname(path.join(root, relative)), { recursive: true });
    await fs.writeFile(path.join(root, relative), relative);
  }
  await fs.writeFile(path.join(root, 'VISION.md'), 'Source of Truth: README.md#product-direction\n');
  await fs.writeFile(path.join(root, 'README.md'), '## Product Direction\n\nServe individual readers.\n');
  const beforeDirection = await computeEvalInputSha256(root, config);
  await fs.writeFile(path.join(root, 'README.md'), '## Product Direction\n\nServe reading teams.\n');
  assert.notEqual(await computeEvalInputSha256(root, config), beforeDirection,
    'README-owned direction must invalidate evaluations while the VISION pointer remains unchanged');
  const state = path.join(root, 'docs/product-specs/CURRENT-STATE.md');
  await fs.mkdir(path.dirname(state), { recursive: true });
  await fs.writeFile(state, 'Current feature: draft.\n');
  const beforeState = await computeEvalInputSha256(root, config);
  await fs.writeFile(state, 'Current feature: shipped.\n');
  assert.notEqual(await computeEvalInputSha256(root, config), beforeState, 'required startup context must invalidate prior evaluation identity');
  const taskMap = path.join(root, 'docs/README.md');
  await fs.writeFile(taskMap, 'Task map: read the security contract.\n');
  const beforeTaskMap = await computeEvalInputSha256(root, config);
  await fs.writeFile(taskMap, 'Task map: read the security and reliability contracts.\n');
  assert.notEqual(await computeEvalInputSha256(root, config), beforeTaskMap,
    'the required task map must invalidate evaluation identity');
  for (const relative of evalInputPaths(config)) {
    const before = await computeEvalInputSha256(root, config);
    await fs.appendFile(path.join(root, relative), '\nchanged');
    assert.notEqual(await computeEvalInputSha256(root, config), before, relative);
  }
  for (const invalid of [
    { requiredFailureFixtures: [{ path: '../outside.json' }] },
    { additionalInputPaths: ['../outside.json'] },
    { additionalInputPaths: 'runtime.json' },
    { additionalInputPaths: [null] }
  ]) {
    await assert.rejects(computeEvalInputSha256(root, invalid), /escapes repository root|additionalInputPaths/);
  }
});
