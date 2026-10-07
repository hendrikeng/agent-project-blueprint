import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { createTemplateRepo, runNode } from './test-helpers.mjs';

test('harness:verify preserves project verification scripts but validates blueprint-owned commands', async (t) => {
  const rootDir = await createTemplateRepo(t);
  const packageJsonPath = path.join(rootDir, 'package.json');
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
  packageJson.scripts['verify:contracts'] = 'node ./scripts/check-contracts.mjs';
  packageJson.scripts['verify:licenses'] = 'node ./scripts/check-licenses.mjs';
  await fs.writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');

  const result = runNode(
    path.join(rootDir, 'scripts', 'automation', 'check-harness-alignment.mjs'),
    [],
    rootDir
  );

  assert.equal(result.status, 0, String(result.stderr));
  assert.deepEqual(JSON.parse(await fs.readFile(packageJsonPath, 'utf8')), packageJson);
  packageJson.scripts['verify:fast'] = 'node ./scripts/check-contracts.mjs';
  await fs.writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
  const drift = runNode(path.join(rootDir, 'scripts/automation/check-harness-alignment.mjs'), [], rootDir);
  assert.equal(drift.status, 1);
  assert.match(String(drift.stderr), /SCRIPT_MISMATCH.*verify:fast/);
});

test('harness:verify fails when a CI-invoked package script is missing', async (t) => {
  const rootDir = await createTemplateRepo(t);
  const packageJsonPath = path.join(rootDir, 'package.json');
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
  delete packageJson.scripts['pr:verify'];
  await fs.writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');

  const result = runNode(
    path.join(rootDir, 'scripts', 'automation', 'check-harness-alignment.mjs'),
    [],
    rootDir
  );

  assert.equal(result.status, 1);
  assert.match(String(result.stderr), /SCRIPT_MISMATCH/);
  assert.match(String(result.stderr), /pr:verify/);
});

test('harness:verify fails when plan closeout verification is missing', async (t) => {
  const rootDir = await createTemplateRepo(t);
  const packageJsonPath = path.join(rootDir, 'package.json');
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
  delete packageJson.scripts['plans:verify:closeout'];
  await fs.writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');

  const result = runNode(
    path.join(rootDir, 'scripts', 'automation', 'check-harness-alignment.mjs'),
    [],
    rootDir
  );

  assert.equal(result.status, 1);
  assert.match(String(result.stderr), /SCRIPT_MISMATCH/);
  assert.match(String(result.stderr), /plans:verify:closeout/);
});

test('harness:verify fails when release verification is missing', async (t) => {
  const rootDir = await createTemplateRepo(t);
  const packageJsonPath = path.join(rootDir, 'package.json');
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
  delete packageJson.scripts['release:verify'];
  await fs.writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');

  const result = runNode(
    path.join(rootDir, 'scripts', 'automation', 'check-harness-alignment.mjs'),
    [],
    rootDir
  );

  assert.equal(result.status, 1);
  assert.match(String(result.stderr), /SCRIPT_MISMATCH/);
  assert.match(String(result.stderr), /release:verify/);
});

test('harness:verify fails when required domain section is missing', async (t) => {
  const rootDir = await createTemplateRepo(t);
  const qualityPath = path.join(rootDir, 'docs', 'SECURITY.md');
  const qualityDoc = await fs.readFile(qualityPath, 'utf8');
  await fs.writeFile(
    qualityPath,
    qualityDoc.replace('## Security Review Checklist', '## Notes'),
    'utf8'
  );

  const result = runNode(
    path.join(rootDir, 'scripts', 'automation', 'check-harness-alignment.mjs'),
    [],
    rootDir
  );

  assert.equal(result.status, 1);
  assert.match(String(result.stderr), /MISSING_QUALITY_GUIDANCE/);
  assert.match(String(result.stderr), /docs\/SECURITY\.md/);
});

test('harness:verify fails when policy execution mode drifts', async (t) => {
  const rootDir = await createTemplateRepo(t);
  const policyPath = path.join(rootDir, 'docs', 'governance', 'policy-manifest.json');
  const policy = JSON.parse(await fs.readFile(policyPath, 'utf8'));
  policy.executionModel.mode = 'custom-local-process';
  await fs.writeFile(policyPath, `${JSON.stringify(policy, null, 2)}\n`, 'utf8');

  const result = runNode(
    path.join(rootDir, 'scripts', 'automation', 'check-harness-alignment.mjs'),
    [],
    rootDir
  );

  assert.equal(result.status, 1);
  assert.match(String(result.stderr), /INVALID_EXECUTION_MODEL/);
});
