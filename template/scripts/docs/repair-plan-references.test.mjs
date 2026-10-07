import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const harnessRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const scriptPath = path.join(harnessRoot, 'scripts', 'docs', 'repair-plan-references.mjs');

function runRepair(rootDir, args = ['--dry-run']) {
  return spawnSync('node', [scriptPath, ...args], {
    cwd: rootDir,
    encoding: 'utf8'
  });
}

test('repair-plan-references leaves existing future plan links untouched', async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'repair-plan-future-'));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  await fs.mkdir(path.join(rootDir, 'docs', 'future'), { recursive: true });
  await fs.writeFile(
    path.join(rootDir, 'docs', 'future', '2026-03-16-sample-plan.md'),
    '# Sample Plan\n\n## Metadata\n\n- Plan-ID: sample-plan\n',
    'utf8'
  );
  await fs.writeFile(
    path.join(rootDir, 'docs', 'guide.md'),
    '[Plan](docs/future/2026-03-16-sample-plan.md)\n',
    'utf8'
  );

  const result = runRepair(rootDir);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /stale plan refs found: 0/);
  assert.match(result.stdout, /unresolved stale refs: 0/);
});

test('repair-plan-references treats existing active plan paths as valid even without a parseable plan id', async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'repair-plan-existing-'));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  await fs.mkdir(path.join(rootDir, 'docs', 'exec-plans', 'active', 'topic'), { recursive: true });
  await fs.writeFile(
    path.join(rootDir, 'docs', 'exec-plans', 'active', 'topic', 'custom-plan.md'),
    '# Custom Plan\n\nNo metadata here.\n',
    'utf8'
  );
  await fs.writeFile(
    path.join(rootDir, 'README.md'),
    '[Plan](docs/exec-plans/active/topic/custom-plan.md)\n',
    'utf8'
  );

  const result = runRepair(rootDir);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /stale plan refs found: 0/);
  assert.match(result.stdout, /unresolved stale refs: 0/);
});

test('repair-plan-references check fails without mutating stale references', async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'repair-plan-check-'));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  await fs.mkdir(path.join(rootDir, 'docs', 'exec-plans', 'completed', 'topic'), { recursive: true });
  await fs.writeFile(
    path.join(rootDir, 'docs', 'exec-plans', 'completed', 'topic', '2026-03-16-sample-plan.md'),
    '# Sample Plan\n\n## Metadata\n\n- Plan-ID: sample-plan\n',
    'utf8'
  );
  const sourcePath = path.join(rootDir, 'README.md');
  const staleContent = '[Plan](docs/exec-plans/active/topic/2026-03-16-sample-plan.md)\n';
  await fs.writeFile(sourcePath, staleContent, 'utf8');

  const result = runRepair(rootDir, ['--check']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /check failed/);
  assert.equal(await fs.readFile(sourcePath, 'utf8'), staleContent);
});

test('repair-plan-references rewrites stale active plan links to completed plans with the same plan id', async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'repair-plan-completed-'));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  await fs.mkdir(path.join(rootDir, 'docs', 'exec-plans', 'completed', 'topic'), { recursive: true });
  await fs.mkdir(path.join(rootDir, 'docs', 'future'), { recursive: true });
  await fs.writeFile(
    path.join(rootDir, 'docs', 'exec-plans', 'completed', 'topic', '2026-03-16-phase-4-global-booking-infrastructure.md'),
    '# Phase 4\n\n## Metadata\n\n- Plan-ID: phase-4-global-booking-infrastructure\n',
    'utf8'
  );
  const sourcePath = path.join(rootDir, 'docs', 'future', '2026-03-17-sample.md');
  await fs.writeFile(
    sourcePath,
    '[Old parent](docs/exec-plans/active/topic/2026-03-16-phase-4-global-booking-infrastructure.md?view=compact#validation)\n`docs/exec-plans/active/topic/2026-03-16-phase-4-global-booking-infrastructure.md?view=compact#validation`\n[Receipt](docs/exec-plans/active/topic/evidence/missing.md)\n[Index](docs/exec-plans/active/topic/README.md)\n',
    'utf8'
  );

  const result = runRepair(rootDir, []);
  assert.equal(result.status, 0, result.stderr);
  const updated = await fs.readFile(sourcePath, 'utf8');
  assert.match(updated, /\?view=compact#validation/);
  assert.match(updated, /active\/topic\/evidence\/missing\.md/);
  assert.match(result.stdout, /stale plan refs found: 2/);
  assert.match(updated, /docs\/exec-plans\/completed\/topic\/2026-03-16-phase-4-global-booking-infrastructure\.md/);
});
