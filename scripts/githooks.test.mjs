import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const shim = fileURLToPath(new URL('../template/.githooks/pre-push', import.meta.url));

test('the starter pre-push shim stops with a clear message when node is not on PATH', (t) => {
  const empty = mkdtempSync(path.join(tmpdir(), 'no-node-'));
  t.after(() => rmSync(empty, { recursive: true, force: true }));
  const result = spawnSync('/bin/sh', [shim, 'origin'], { encoding: 'utf8', input: '', env: { PATH: empty } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /node is not on PATH/);
});
