#!/usr/bin/env node
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { validatePrContract } from '../../template/scripts/automation/pr-contract-lib.mjs';
import { runFixtureEvals } from './run-fixture-evals.mjs';

const rootDir = process.cwd();
const templateDir = path.join(rootDir, 'template');
const placeholderPattern = /\{\{([A-Z0-9_]+)\}\}/g;

function nowIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

async function collectFiles(baseDir) {
  const entries = await fs.readdir(baseDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(baseDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(fullPath));
      continue;
    }
    if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function replacementForToken(token) {
  const today = nowIsoDate();
  const specific = {
    PRODUCT: 'Smoke Harness',
    SUMMARY: 'Smoke-test fixture repository for the harness template.',
    DOC_OWNER: 'automation-smoke',
    LAST_UPDATED_ISO_DATE: today,
    CURRENT_STATE_DATE: today,
    FRONTEND_STACK: 'not applicable',
    BACKEND_STACK: 'node',
    DATA_STACK: 'json-files',
    SHARED_CONTRACT_STRATEGY: 'versioned json contracts',
    CRITICAL_DOMAIN_SET: 'plan transitions, validation outputs, evidence records',
    SERVER_AUTHORITY_BOUNDARY_SET: 'privileged writes, lifecycle transitions, validation gating',
    MONEY_AND_NUMERIC_RULE: 'not applicable',
    CODEOWNERS_DEFAULT_TEAM: '@smoke/platform',
    CODEOWNERS_SECURITY_TEAM: '@smoke/security',
    NODE_VERSION: '24',
    CI_INSTALL_COMMAND: 'npm install --ignore-scripts',
    PACKAGE_MANAGER_CACHE: 'npm',
    PACKAGE_MANAGER_LOCKFILE: 'package-lock.json',
    PROJECT_LINT_COMMAND: 'node ./scripts/automation/check-harness-alignment.mjs',
    PROJECT_TYPECHECK_COMMAND: 'node ./scripts/automation/check-plan-metadata.mjs',
    PROJECT_UNIT_TEST_COMMAND: 'node ./scripts/automation/check-harness-alignment.mjs',
    PROJECT_BUILD_COMMAND: 'node ./scripts/docs/check-governance.mjs',
    GENERATED_AT_UTC_ISO: `${today}T00:00:00.000Z`,
    CONFORMANCE_SOURCE: 'scripts/ci/run-template-smoke.mjs',
    REPOSITORY_PROFILE_SNAKE_CASE: 'smoke_harness',
    CONFORMANCE_PURPOSE: 'template smoke verification',
    CI_WORKFLOW_PATH: '.github/workflows/ci.yml',
    EVAL_PROVIDER: 'stub',
    EVAL_MODEL_ID: 'smoke-model'
  };
  if (specific[token]) {
    return specific[token];
  }
  if (/^SCOPE\d+$/.test(token)) {
    return `smoke-scope-${token.slice(-1)}`;
  }
  if (/^(FRONTEND_ENTRYPOINT|BACKEND_ENTRYPOINT)_\d+$/.test(token)) {
    return 'src/index.js';
  }
  if (/^DOMAIN_INVARIANT_AREA_\d+$/.test(token)) {
    return `smoke invariant area ${token.slice(-1)}`;
  }
  if (/^DOMAIN_INVARIANT_\d+[A-Z]$/.test(token)) {
    return `smoke invariant ${token.toLowerCase()}`;
  }
  if (/^CRITICAL_FLOW_\d+$/.test(token)) {
    return `smoke critical flow ${token.slice(-1)}`;
  }
  if (/^SCORE_/.test(token)) {
    return '4';
  }
  if (/^QUALITY_GAP_\d+$/.test(token)) {
    return 'none';
  }
  if (/^OUT_OF_SCOPE_ITEM_\d+$/.test(token)) {
    return 'none';
  }
  return token.toLowerCase().replaceAll('_', '-');
}

async function replaceTemplatePlaceholders(repoDir) {
  const files = await collectFiles(repoDir);
  for (const filePath of files) {
    if (path.basename(filePath) === 'PLACEHOLDERS.md') {
      continue;
    }
    let raw;
    try {
      raw = await fs.readFile(filePath, 'utf8');
    } catch {
      continue;
    }
    if (!raw.includes('{{')) {
      continue;
    }
    const replaced = raw.replaceAll(placeholderPattern, (_, token) => replacementForToken(token));
    await fs.writeFile(filePath, replaced, 'utf8');
  }
}

async function writePackageJson(repoDir) {
  const fragmentPath = path.join(repoDir, 'package.scripts.fragment.json');
  const fragment = JSON.parse(await fs.readFile(fragmentPath, 'utf8'));
  const payload = {
    name: 'harness-template-smoke',
    private: true,
    version: '0.0.0-smoke',
    type: 'module',
    engines: {
      node: '>=24 <25'
    },
    scripts: {
      ...fragment.scripts
    }
  };
  await fs.writeFile(path.join(repoDir, 'package.json'), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function assertPackageJsonDriftFails(repoDir) {
  const packageJsonPath = path.join(repoDir, 'package.json');
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
  packageJson.scripts['verify:fast'] = 'node ./scripts/docs/check-governance.mjs';
  await fs.writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');

  const result = spawnSync('npm run harness:verify', {
    cwd: repoDir,
    shell: true,
    stdio: 'pipe',
    env: { ...process.env, CI: '1' }
  });
  if (result.error) {
    throw result.error;
  }
  if ((result.status ?? 1) === 0) {
    throw new Error('Expected harness:verify to fail when a required package script drifts.');
  }
}

async function assertBootstrapArtifactsRemoved(repoDir) {
  for (const relativePath of ['PLACEHOLDERS.md', 'package.scripts.fragment.json']) {
    try {
      await fs.access(path.join(repoDir, relativePath));
    } catch {
      continue;
    }
    throw new Error(`Expected bootstrap artifact to be removed: ${relativePath}`);
  }
}

async function assertPullRequestTemplatesMatchVerifier(repoDir) {
  const templates = [
    {
      path: '.github/PULL_REQUEST_TEMPLATE/slice.md',
      headRef: 'slice/smoke-contract',
      baseRef: 'dev'
    },
    {
      path: '.github/PULL_REQUEST_TEMPLATE/fix.md',
      headRef: 'fix/smoke-contract',
      baseRef: 'dev'
    },
    {
      path: '.github/PULL_REQUEST_TEMPLATE/release.md',
      headRef: 'release/2026.05.12.1',
      baseRef: 'main',
      title: 'Release 2026.05.12.1'
    }
  ];

  for (const template of templates) {
    const body = await fs.readFile(path.join(repoDir, template.path), 'utf8');
    const findings = validatePrContract({
      headRef: template.headRef,
      baseRef: template.baseRef,
      title: template.title,
      body
    });
    if (findings.length > 0) {
      throw new Error(
        `${template.path} does not satisfy pr:verify markers:\n${findings.map((finding) => `- ${finding}`).join('\n')}`
      );
    }
  }
}

function runCommand(repoDir, command, extraEnv = {}) {
  console.log(`[template-smoke] ${command}`);
  const result = spawnSync(command, {
    cwd: repoDir,
    shell: true,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv }
  });
  if (result.error) {
    throw result.error;
  }
  if ((result.status ?? 1) !== 0) {
    throw new Error(`Command failed (${result.status ?? 1}): ${command}`);
  }
}

async function main() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-template-smoke-'));
  try {
    const repoDir = path.join(tempRoot, 'repo');
    await fs.cp(templateDir, repoDir, { recursive: true });
    await replaceTemplatePlaceholders(repoDir);
    await writePackageJson(repoDir);
    await assertPullRequestTemplatesMatchVerifier(repoDir);
    await runFixtureEvals(repoDir);

    const commands = [
      'npm run harness:verify',
      'npm run plans:verify',
      'npm run context:compile',
      'npm run eval:refresh',
      'npm run verify:fast',
      'npm run bootstrap:cleanup',
      'npm run harness:verify'
    ];

    for (const command of commands) {
      runCommand(repoDir, command, { CI: '1' });
    }
    await assertBootstrapArtifactsRemoved(repoDir);
    await assertPackageJsonDriftFails(repoDir);
    const visionPath = path.join(repoDir, 'VISION.md');
    const readmePath = path.join(repoDir, 'README.md');
    const originalVision = await fs.readFile(visionPath, 'utf8');
    const originalReadme = await fs.readFile(readmePath, 'utf8');
    try {
      await fs.writeFile(visionPath, originalVision.split('\n').slice(0, 5).join('\n') +
        '\nSource of Truth: README.md#product-direction\n');
      await fs.writeFile(readmePath, originalReadme + '\n## Product Direction\n\nHelp readers organize their saved articles.\n');
      runCommand(repoDir, 'node scripts/agent-hardening/check-agent-hardening.mjs');
      await fs.writeFile(readmePath, originalReadme);
      const missingDirection = spawnSync(process.execPath, ['scripts/agent-hardening/check-agent-hardening.mjs'],
        { cwd: repoDir, encoding: 'utf8' });
      assert.equal(missingDirection.status, 1);
      assert.match(missingDirection.stderr, /MISSING_DIRECTION/);
    } finally {
      await fs.writeFile(visionPath, originalVision);
      await fs.writeFile(readmePath, originalReadme);
    }


  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
  console.log('[template-smoke] passed.');
}

main().catch((error) => {
  console.error('[template-smoke] failed.');
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
