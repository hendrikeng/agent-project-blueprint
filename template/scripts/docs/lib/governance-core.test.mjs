import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { runGovernanceAnalysis } from './governance-core.mjs';

test('runGovernanceAnalysis rejects future freshness timestamps', async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'governance-core-'));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  await fs.mkdir(path.join(rootDir, 'docs', 'governance'), { recursive: true });
  await fs.writeFile(
    path.join(rootDir, 'docs', 'README.md'),
    '# Docs\n\nLast Updated: 2026-03-17\n',
    'utf8'
  );
  const configPath = path.join(rootDir, 'docs', 'governance', 'doc-checks.config.json');
  await fs.writeFile(
    configPath,
    `${JSON.stringify({
      canonicalDocs: [],
      requiredDirs: [],
      requiredIndexEntries: [],
      requiredLinks: {},
      requiredHeadings: {},
      metadataRules: [],
      generatedArtifacts: [],
      staleness: {
        maxAgeDays: 7,
        defaultStrategy: {
          type: 'metadata_field',
          field: 'Last Updated',
          format: 'iso-date'
        },
        targets: ['docs/README.md']
      }
    }, null, 2)}\n`,
    'utf8'
  );

  const result = await runGovernanceAnalysis({
    rootDir,
    configPath,
    now: new Date('2026-03-16T12:00:00Z')
  });

  assert.equal(result.errors.some((entry) => entry.code === 'FUTURE_DOC_TIMESTAMP'), true);
});

test('runGovernanceAnalysis validates configured governance JSON schemas', async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'governance-schema-'));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  await fs.mkdir(path.join(rootDir, 'docs', 'governance'), { recursive: true });
  await fs.writeFile(
    path.join(rootDir, 'docs', 'governance', 'policy.json'),
    `${JSON.stringify({ version: '1' }, null, 2)}\n`,
    'utf8'
  );
  await fs.writeFile(
    path.join(rootDir, 'docs', 'governance', 'policy.schema.json'),
    `${JSON.stringify({
      type: 'object',
      required: ['version'],
      properties: {
        version: {
          type: 'integer',
          minimum: 1
        }
      },
      additionalProperties: false
    }, null, 2)}\n`,
    'utf8'
  );

  const configPath = path.join(rootDir, 'docs', 'governance', 'doc-checks.config.json');
  await fs.writeFile(
    configPath,
    `${JSON.stringify({
      canonicalDocs: [],
      requiredDirs: [],
      requiredIndexEntries: [],
      requiredLinks: {},
      requiredHeadings: {},
      metadataRules: [],
      generatedArtifacts: [],
      jsonSchemaValidation: [
        {
          dataPath: 'docs/governance/policy.json',
          schemaPath: 'docs/governance/policy.schema.json'
        }
      ]
    }, null, 2)}\n`,
    'utf8'
  );

  const result = await runGovernanceAnalysis({
    rootDir,
    configPath,
    now: new Date('2026-03-16T12:00:00Z')
  });

  assert.equal(result.errors.some((entry) => entry.code === 'JSON_SCHEMA_VALIDATION_FAILED'), true);
});

test('runGovernanceAnalysis rejects schema validation paths outside the repository', async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'governance-schema-path-'));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  await fs.mkdir(path.join(rootDir, 'docs', 'governance'), { recursive: true });

  const configPath = path.join(rootDir, 'docs', 'governance', 'doc-checks.config.json');
  await fs.writeFile(
    configPath,
    `${JSON.stringify({
      canonicalDocs: [],
      requiredDirs: [],
      requiredIndexEntries: [],
      requiredLinks: {},
      requiredHeadings: {},
      metadataRules: [],
      generatedArtifacts: [],
      jsonSchemaValidation: [
        {
          dataPath: '../policy.json',
          schemaPath: 'docs/governance/policy.schema.json'
        }
      ]
    }, null, 2)}\n`,
    'utf8'
  );

  const result = await runGovernanceAnalysis({
    rootDir,
    configPath,
    now: new Date('2026-03-16T12:00:00Z')
  });

  assert.equal(result.errors.some((entry) => entry.code === 'OUT_OF_REPO_SCHEMA_VALIDATION_DATA'), true);
});

test('governance bounds live UTF-8 context, preserves history, and flags finished queue work', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'governance-context-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const directory of ['governance', 'product-specs', 'exec-plans/active/payments/evidence', 'exec-plans/completed']) {
    await fs.mkdir(path.join(root, 'docs', directory), { recursive: true });
  }
  const state = 'Last Updated: 2026-03-16\nCurrent State Date: 2026-01-01\n' + '🧠'.repeat(40);
  await fs.writeFile(path.join(root, 'docs/product-specs/CURRENT-STATE.md'), state);
  await fs.writeFile(path.join(root, 'docs/exec-plans/completed/history.md'), state.repeat(10));
  await fs.writeFile(path.join(root, 'docs/exec-plans/active/done.md'), '## Must-Land Checklist\n- [x] `ml-done` Shipped.\n');
  await fs.writeFile(path.join(root, 'docs/exec-plans/active/payments/evidence/receipt.md'), '## Must-Land Checklist\n- [x] `ml-receipt` Recorded.\n');
  const configPath = path.join(root, 'docs/governance/doc-checks.config.json');
  await fs.writeFile(configPath, JSON.stringify({
    canonicalDocs: [], requiredDirs: [], requiredIndexEntries: [], requiredLinks: {}, requiredHeadings: {}, metadataRules: [], generatedArtifacts: [],
    sizeBudgets: { defaultMaxBytes: 120, excludePrefixes: ['docs/exec-plans/completed/'] },
    staleness: { maxAgeDays: 30, level: 'warning', targets: ['docs/product-specs/CURRENT-STATE.md'], defaultStrategy: { type: 'metadata_field', field: 'Current State Date', format: 'iso-date' } }
  }));
  const result = await runGovernanceAnalysis({ rootDir: root, configPath, now: new Date('2026-03-16T12:00:00Z') });
  const oversized = result.errors.filter(entry => entry.code === 'DOC_SIZE_BUDGET');
  assert.equal(oversized.length, 1);
  assert.match(JSON.stringify(oversized), /CURRENT-STATE/);
  assert.deepEqual(result.errors.filter(entry => entry.code === 'FINISHED_PLAN_IN_QUEUE').map(entry => entry.file), ['docs/exec-plans/active/done.md']);
  assert.equal(result.errors.some(entry => entry.code === 'STALE_DOC'), false);
  assert.equal(result.warnings.some(entry => entry.code === 'STALE_DOC'), true);
  for (const status of ['validation', 'in-review']) {
    await fs.writeFile(path.join(root, 'docs/exec-plans/active/done.md'),
      `## Metadata\n- Status: ${status}\n\n## Must-Land Checklist\n- [x] \x60ml-done\x60 Shipped.\n`);
    const awaiting = await runGovernanceAnalysis({ rootDir: root, configPath, now: new Date('2026-03-16T12:00:00Z') });
    assert.equal(awaiting.errors.some(entry => entry.code === 'FINISHED_PLAN_IN_QUEUE'), false, status);
  }
});

test('governance checks nested completed structure without imposing new metadata on history', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'governance-history-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'docs/exec-plans/completed/topic/evidence'), { recursive: true });
  await fs.mkdir(path.join(root, 'docs/governance'), { recursive: true });
  await fs.writeFile(path.join(root, 'docs/MANIFEST.md'), '# Historical document index\n');
  const completed = path.join(root, 'docs/exec-plans/completed/topic/history.md');
  const historical = 'Status: completed\n## Closure\nShipped.\n## Validation Evidence\nHistorical check passed.\n';
  await fs.writeFile(completed, historical);
  await fs.writeFile(path.join(root, 'docs/exec-plans/completed/topic/evidence/receipt.md'), 'Receipt without plan metadata or closure.\n');
  const configPath = path.join(root, 'docs/governance/doc-checks.config.json');
  await fs.writeFile(configPath, JSON.stringify({ canonicalDocs: [], requiredDirs: [], requiredLinks: {}, requiredHeadings: {}, metadataRules: [], generatedArtifacts: [],
    completedPlans: { directory: 'docs/exec-plans/completed', requiredPatterns: [
      { regex: '^## Closure', message: 'Closure' },
      { regex: '^## Validation Evidence', message: 'Validation Evidence' },
      { regex: '^Status: completed', message: 'Completed status' }
    ] }
  }));
  const analyze = () => runGovernanceAnalysis({ rootDir: root, configPath });
  assert.deepEqual((await analyze()).errors, []);
  await fs.writeFile(completed, historical.replace('## Closure\nShipped.\n', ''));
  const errors = (await analyze()).errors;
  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, 'MISSING_COMPLETED_PLAN_FIELD');
  assert.equal(errors[0].file, 'docs/exec-plans/completed/topic/history.md');
});
