import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const harnessRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const scriptPath = path.join(harnessRoot, 'scripts', 'automation', 'check-quality-score.mjs');

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function templatePlaceholder(name) {
  return `{${`{${name}}`}}`;
}

function qualityDoc({ owner = 'Platform', updated = todayIsoDate() } = {}) {
  return [
    '# Quality Score',
    '',
    'Status: canonical',
    `Owner: ${owner}`,
    `Last Updated: ${updated}`,
    'Source of Truth: This document.',
    '',
    '## Domain Scores',
    '',
    '- Domain correctness and invariants: 4',
    '- Critical-domain safety and auditability: 4',
    '- Authorization and boundary enforcement: 4',
    '',
    '## Platform Scores',
    '',
    '- Architecture boundary enforcement: 4',
    '- Documentation governance enforcement: 4',
    '- Test coverage for critical flows: 4'
  ].join('\n');
}

const baselineGates = [
  {
    id: 'lint',
    profile: 'fast',
    status: 'required',
    command: 'node -v',
    rationale: 'Static check command for quality-score validation.'
  },
  {
    id: 'typecheck',
    profile: 'fast',
    status: 'required',
    command: 'node -v',
    rationale: 'Type contract command for quality-score validation.'
  },
  {
    id: 'unit-tests',
    profile: 'fast',
    status: 'required',
    command: 'node -v',
    rationale: 'Unit test command for quality-score validation.'
  },
  {
    id: 'build',
    profile: 'full',
    status: 'required',
    command: 'node -v',
    rationale: 'Build command for quality-score validation.'
  }
];

async function createFixtureRoot(t, {
  quality = qualityDoc(),
  gates = baselineGates,
  agentOwner = 'Platform'
} = {}) {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'quality-score-'));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  await fs.mkdir(path.join(rootDir, 'docs', 'governance'), { recursive: true });
  await fs.writeFile(
    path.join(rootDir, 'AGENTS.md'),
    [
      '# Agents',
      '',
      `Owner: ${agentOwner}`,
      `Last Updated: ${todayIsoDate()}`,
      'Status: canonical',
      'Source of Truth: fixture'
    ].join('\n'),
    'utf8'
  );
  await fs.writeFile(path.join(rootDir, 'docs', 'QUALITY_SCORE.md'), `${quality}\n`, 'utf8');
  await fs.writeFile(
    path.join(rootDir, 'docs', 'governance', 'doc-checks.config.json'),
    `${JSON.stringify({
      metadataRules: [
        {
          path: 'AGENTS.md',
          requiredFields: ['Owner', 'Last Updated']
        },
        {
          path: 'docs/QUALITY_SCORE.md',
          requiredFields: ['Owner', 'Last Updated']
        }
      ],
      staleness: {
        maxAgeDays: 90,
        defaultStrategy: {
          type: 'metadata_field',
          field: 'Last Updated',
          format: 'iso-date'
        },
        targets: ['docs/QUALITY_SCORE.md']
      },
      unreachablePolicy: {
        scope: 'all_docs',
        level: 'warning'
      }
    }, null, 2)}\n`,
    'utf8'
  );
  await fs.writeFile(
    path.join(rootDir, 'docs', 'governance', 'project-gates.json'),
    `${JSON.stringify({
      version: 1,
      profiles: {
        fast: 'Fast quality gates.',
        full: 'Full quality gates.',
        release: 'Release quality gates.',
        deploy: 'Deploy quality gates.'
      },
      gates
    }, null, 2)}\n`,
    'utf8'
  );
  return rootDir;
}

test('quality score passes with fresh docs, concrete ownership, and baseline gates', async (t) => {
  const rootDir = await createFixtureRoot(t);
  const result = spawnSync('node', [scriptPath], { cwd: rootDir, encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /score=100/);
  assert.match(result.stdout, /passed/);
});

test('quality score fails stale docs', async (t) => {
  const rootDir = await createFixtureRoot(t, {
    quality: qualityDoc({ updated: '2000-01-01' })
  });
  const result = spawnSync('node', [scriptPath], { cwd: rootDir, encoding: 'utf8' });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /STALE_/);
});

test('quality score fails when the unit-test gate is missing', async (t) => {
  const rootDir = await createFixtureRoot(t, {
    gates: baselineGates.filter((gate) => gate.id !== 'unit-tests')
  });
  const result = spawnSync('node', [scriptPath], { cwd: rootDir, encoding: 'utf8' });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /MISSING_UNIT_TEST_GATE|MISSING_BASELINE_GATE/);
});

test('quality score requires the fixed six score labels', async (t) => {
  const rootDir = await createFixtureRoot(t, {
    quality: [
      '# Quality Score',
      '',
      'Status: canonical',
      'Owner: Platform',
      `Last Updated: ${todayIsoDate()}`,
      'Source of Truth: This document.',
      '',
      '## Domain Scores',
      '',
      '- Domain correctness and invariants: 4',
      '- Critical-domain safety and auditability: 4',
      '- Extra metric: 4',
      '',
      '## Platform Scores',
      '',
      '- Architecture boundary enforcement: 4',
      '- Documentation governance enforcement: 4',
      '- Test coverage for critical flows: 4'
    ].join('\n')
  });
  const result = spawnSync('node', [scriptPath], { cwd: rootDir, encoding: 'utf8' });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /MISSING_SCORE_RUBRIC/);
  assert.match(result.stderr, /Authorization and boundary enforcement/);
  assert.match(result.stderr, /next: Add the missing required labels under Domain Scores or Platform Scores\./);
});

test('quality score ignores explanatory bullets outside score sections', async (t) => {
  const rootDir = await createFixtureRoot(t, {
    quality: [
      qualityDoc(),
      '',
      '## Current Gaps',
      '',
      '- Documentation governance enforcement: owned by Platform with follow-up checks pending.',
      '- Authorization and boundary enforcement: review delegated admin routes before the next release.'
    ].join('\n')
  });
  const result = spawnSync('node', [scriptPath], { cwd: rootDir, encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /score=100/);
});

test('quality score fails unclear ownership in adopted repos', async (t) => {
  const rootDir = await createFixtureRoot(t, {
    quality: qualityDoc({ owner: templatePlaceholder('DOC_OWNER') }),
    agentOwner: 'Platform'
  });
  const result = spawnSync('node', [scriptPath], { cwd: rootDir, encoding: 'utf8' });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /UNCLEAR_QUALITY_OWNER|UNCLEAR_DOC_OWNER/);
});


test('quality scoring distinguishes explicit baseline exemptions from invalid skips', async (t) => {
  for (const [status, command, rationale, expected] of [
    ['deferred', '', 'Owner Platform will enable unit tests before feature delivery.', null],
    ['not-applicable', '', 'This fixture contains no executable application surface.', null],
    ['deferred', 'node -v', 'Owner Platform will enable unit tests before feature delivery.', /INVALID_GATE_EXEMPTION/],
    ['deferred', '', 'Later', /INVALID_GATE_EXEMPTION/],
    ['skip', '', 'This fixture contains no executable application surface.', /WEAK_BASELINE_GATE/]
  ]) {
    await t.test(status + ':' + command + ':' + rationale, async (t) => {
      const gates = baselineGates.map(g => g.id === 'unit-tests' ? { ...g, status, command, rationale } : g);
      const rootDir = await createFixtureRoot(t, { gates });
      const result = spawnSync('node', [scriptPath], { cwd: rootDir, encoding: 'utf8' });
      assert.equal(result.status, expected ? 1 : 0, result.stderr);
      if (expected) assert.match(result.stderr, expected);
      else assert.match(result.stdout + result.stderr, /EXEMPT_BASELINE_GATE/);
    });
  }
});
