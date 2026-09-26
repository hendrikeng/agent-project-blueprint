import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { createTemplateRepo, runNode } from './test-helpers.mjs';

test('harness:verify rejects unsupported verification profiles', async () => {
  const rootDir = await createTemplateRepo();
  const packageJsonPath = path.join(rootDir, 'package.json');
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
  packageJson.scripts['verify:legacy'] = packageJson.scripts['verify:fast'];
  await fs.writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');

  const result = runNode(
    path.join(rootDir, 'scripts', 'automation', 'check-harness-alignment.mjs'),
    [],
    rootDir
  );

  assert.equal(result.status, 1);
  assert.match(String(result.stderr), /UNSUPPORTED_SCRIPT/);
  assert.match(String(result.stderr), /verify:legacy/);
});

test('harness:verify fails when a CI-invoked package script is missing', async () => {
  const rootDir = await createTemplateRepo();
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

test('harness:verify fails when plan closeout verification is missing', async () => {
  const rootDir = await createTemplateRepo();
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

test('harness:verify fails when release verification is missing', async () => {
  const rootDir = await createTemplateRepo();
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

test('harness:verify fails when required quality guidance is missing', async () => {
  const rootDir = await createTemplateRepo();
  const qualityPath = path.join(rootDir, 'docs', 'QUALITY_SCORE.md');
  const qualityDoc = await fs.readFile(qualityPath, 'utf8');
  await fs.writeFile(
    qualityPath,
    qualityDoc.replace('A slice is high quality only when it clears all applicable gates', 'A slice is high quality when evidence is strong'),
    'utf8'
  );

  const result = runNode(
    path.join(rootDir, 'scripts', 'automation', 'check-harness-alignment.mjs'),
    [],
    rootDir
  );

  assert.equal(result.status, 1);
  assert.match(String(result.stderr), /MISSING_QUALITY_GUIDANCE/);
  assert.match(String(result.stderr), /docs\/QUALITY_SCORE\.md/);
});

test('harness:verify fails when policy execution mode drifts', async () => {
  const rootDir = await createTemplateRepo();
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
