import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const harnessRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const scriptPath = path.join(harnessRoot, 'scripts', 'automation', 'check-project-gates.mjs');

function templatePlaceholder(name) {
  return `{${`{${name}}`}}`;
}

async function createFixtureRoot(t, gates) {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'project-gates-'));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  await fs.mkdir(path.join(rootDir, 'docs', 'governance'), { recursive: true });
  await fs.writeFile(
    path.join(rootDir, 'AGENTS.md'),
    'Owner: Platform\nLast Updated: 2026-05-12\n',
    'utf8'
  );
  await fs.writeFile(
    path.join(rootDir, 'docs', 'governance', 'project-gates.json'),
    `${JSON.stringify({
      version: 1,
      profiles: {
        fast: 'Fast gate profile.',
        full: 'Full gate profile.',
        release: 'Release gate profile.',
        deploy: 'Deploy gate profile.'
      },
      gates
    }, null, 2)}\n`,
    'utf8'
  );
  return rootDir;
}

const baselineGates = [
  {
    id: 'lint',
    profile: 'fast',
    status: 'required',
    command: 'node -v',
    rationale: 'Static check command for fixture validation.'
  },
  {
    id: 'typecheck',
    profile: 'fast',
    status: 'required',
    command: 'node -v',
    rationale: 'Type contract command for fixture validation.'
  },
  {
    id: 'unit-tests',
    profile: 'fast',
    status: 'required',
    command: 'node -v',
    rationale: 'Unit test command for fixture validation.'
  },
  {
    id: 'build',
    profile: 'full',
    status: 'required',
    command: 'node -v',
    rationale: 'Build command for fixture validation.'
  }
];

test('project gates accepts real baseline commands', async (t) => {
  const rootDir = await createFixtureRoot(t, baselineGates);
  const result = spawnSync('node', [scriptPath], { cwd: rootDir, encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /verified 4 gate declaration/);
});

test('project gates rejects unresolved placeholders in adopted repos', async (t) => {
  const rootDir = await createFixtureRoot(t, [
    { ...baselineGates[0], command: templatePlaceholder('PROJECT_LINT_COMMAND') },
    ...baselineGates.slice(1)
  ]);
  const result = spawnSync('node', [scriptPath], { cwd: rootDir, encoding: 'utf8' });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /unresolved placeholder/);
});

test('project gates rejects no-op required commands', async (t) => {
  const rootDir = await createFixtureRoot(t, [
    { ...baselineGates[0], command: 'echo ok' },
    ...baselineGates.slice(1)
  ]);
  const result = spawnSync('node', [scriptPath], { cwd: rootDir, encoding: 'utf8' });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /no-op command/);
});

test('project gates rejects shell control operators in commands', async (t) => {
  const rootDir = await createFixtureRoot(t, [
    { ...baselineGates[0], command: 'node -v && echo ok' },
    ...baselineGates.slice(1)
  ]);
  const result = spawnSync('node', [scriptPath], { cwd: rootDir, encoding: 'utf8' });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /shell control operators/);
});


test('baseline exemptions are explicit and cannot hide missing or invalid declarations', async (t) => {
  for (const [name, gates, expected] of [
    ['not applicable', baselineGates.map(g => ({ ...g, status: 'not-applicable', command: '', rationale: 'This fixture has no compiled or typed application surface.' })), null],
    ['deferred', baselineGates.map(g => ({ ...g, status: 'deferred', command: '', rationale: 'Owner Platform will activate the harness before feature delivery.' })), null],
    ['missing baseline', baselineGates.slice(1), /must be declared/],
    ['wrong profile', baselineGates.map(g => g.id === 'lint' ? { ...g, profile: 'full' } : g), /must be declared/],
    ['exempt command', baselineGates.map(g => ({ ...g, status: 'deferred' })), /also declares a command/],
    ['short reason', baselineGates.map(g => ({ ...g, status: 'deferred', command: '', rationale: 'Later' })), /concrete rationale/],
    ['placeholder reason', baselineGates.map(g => ({ ...g, status: 'deferred', command: '', rationale: templatePlaceholder('PROJECT_GATE_EXEMPTION_REASON') })), /concrete rationale/],
    ['invalid status', baselineGates.map(g => ({ ...g, status: 'skip', command: '' })), /invalid status/]
  ]) {
    await t.test(name, async (t) => {
      const rootDir = await createFixtureRoot(t, gates);
      const result = spawnSync('node', [scriptPath], { cwd: rootDir, encoding: 'utf8' });
      assert.equal(result.status, expected ? 1 : 0, result.stderr);
      if (expected) assert.match(result.stderr, expected);
    });
  }
});

test('selected project profiles execute real gates and propagate the first failure', async (t) => {
  for (const profile of ['fast', 'release']) {
    await t.test(profile, async (t) => {
      const gates = baselineGates.map(g => ({ ...g }));
      const steps = [
        { id: 'first', profile, status: 'required', command: 'node first.mjs', rationale: 'Exercise the first real gate execution boundary.' },
        { id: 'failing', profile, status: 'required', command: 'node failing.mjs', rationale: 'Exercise nonzero child status propagation.' },
        { id: 'last', profile, status: 'required', command: 'node last.mjs', rationale: 'This gate must not execute after an earlier failure.' }
      ];
      const sentinel = { id: 'unselected-deploy', profile: 'deploy', status: 'required', command: 'node unselected.mjs', rationale: 'Unselected deployment gates must never run in fast or release profiles.' };
      const rootDir = await createFixtureRoot(t, [...gates, sentinel, ...steps]);
      await fs.writeFile(path.join(rootDir, 'unselected.mjs'), "console.log('UNSELECTED-EXECUTED'); process.exit(9);");
      await fs.writeFile(path.join(rootDir, 'first.mjs'), "console.log('FIRST-EXECUTED');");
      await fs.writeFile(path.join(rootDir, 'failing.mjs'), "console.log('FAILURE-EXECUTED'); process.exit(7);");
      await fs.writeFile(path.join(rootDir, 'last.mjs'), "console.log('LAST-EXECUTED');");
      const result = spawnSync('node', [scriptPath, '--profile', profile, '--run'], { cwd: rootDir, encoding: 'utf8' });
      assert.equal(result.status, 7, result.stderr);
      assert.match(result.stdout, /FIRST-EXECUTED/);
      assert.match(result.stdout, /FAILURE-EXECUTED/);
      assert.doesNotMatch(result.stdout, /UNSELECTED-EXECUTED|LAST-EXECUTED|profile '.*' passed/);
    });
  }
});

test('local gate runs take an agent-heavy slot unless CI, opt-out, or no agent-heavy on PATH', async (t) => {
  const binDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-heavy-bin-'));
  t.after(() => fs.rm(binDir, { recursive: true, force: true }));
  // The fake records its argv, then runs the wrapped command like the real pass-through.
  await fs.writeFile(path.join(binDir, 'agent-heavy'), '#!/bin/sh\necho "HEAVY:$*"\nshift\nexec "$@"\n', { mode: 0o755 });
  const basePath = [path.dirname(process.execPath), '/usr/bin', '/bin'].join(path.delimiter);
  const withHeavy = `${binDir}${path.delimiter}${basePath}`;
  const gates = [
    { ...baselineGates[0], command: 'node gate.mjs' },
    ...baselineGates.slice(1).map((gate) => ({ ...gate, status: 'not-applicable', command: '', rationale: 'Only the lint gate matters in this fixture.' }))
  ];
  for (const [name, env, wrapped] of [
    ['local with agent-heavy', { CI: '', AGENT_HEAVY: '', PATH: withHeavy }, true],
    ['CI', { CI: 'true', AGENT_HEAVY: '', PATH: withHeavy }, false],
    ['opted out', { CI: '', AGENT_HEAVY: '0', PATH: withHeavy }, false],
    ['agent-heavy missing', { CI: '', AGENT_HEAVY: '', PATH: basePath }, false]
  ]) {
    await t.test(name, async (t) => {
      const rootDir = await createFixtureRoot(t, gates);
      await fs.writeFile(path.join(rootDir, 'gate.mjs'), "console.log('GATE-EXECUTED'); process.exit(5);");
      const result = spawnSync('node', [scriptPath, '--profile', 'fast', '--run'], { cwd: rootDir, encoding: 'utf8', env: { ...process.env, ...env } });
      assert.equal(result.status, 5, result.stderr);
      assert.match(result.stdout, /GATE-EXECUTED/);
      assert.equal(result.stdout.includes('HEAVY:-- sh -c node gate.mjs'), wrapped);
    });
  }
});
