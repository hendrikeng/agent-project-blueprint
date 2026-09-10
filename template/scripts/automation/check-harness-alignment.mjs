#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const findings = [];

const requiredScripts = new Map([
  ['context:compile', 'node ./scripts/automation/compile-runtime-context.mjs'],
  ['docs:verify', 'node ./scripts/docs/check-governance.mjs'],
  ['conformance:verify', 'node ./scripts/check-article-conformance.mjs'],
  ['architecture:verify', 'node ./scripts/architecture/check-dependencies.mjs'],
  ['agent:verify', 'node ./scripts/agent-hardening/check-agent-hardening.mjs'],
  ['eval:refresh', 'node ./scripts/agent-hardening/refresh-evals-report.mjs'],
  ['eval:verify', 'node ./scripts/agent-hardening/check-evals.mjs'],
  ['quality:score', 'node ./scripts/automation/check-quality-score.mjs'],
  ['project:gates:verify', 'node ./scripts/automation/check-project-gates.mjs'],
  ['project:gates:fast', 'node ./scripts/automation/check-project-gates.mjs --profile fast --run'],
  ['project:gates:full', 'node ./scripts/automation/check-project-gates.mjs --profile full --run'],
  ['harness:test', 'node --test scripts/agent-hardening/*.test.mjs scripts/architecture/*.test.mjs scripts/automation/*.test.mjs scripts/automation/lib/*.test.mjs scripts/automation/lib/contracts/*.test.mjs scripts/ci/*.test.mjs scripts/docs/*.test.mjs scripts/docs/lib/*.test.mjs'],
  ['harness:verify', 'node ./scripts/automation/check-harness-alignment.mjs'],
  ['plans:repair', 'node ./scripts/docs/repair-plan-references.mjs'],
  ['plans:verify', 'node ./scripts/automation/check-plan-metadata.mjs'],
  ['pr:verify', 'node ./scripts/automation/check-pr-contract.mjs'],
  ['plans:verify:closeout', 'node ./scripts/automation/check-plan-closeout.mjs'],
  ['release:verify', 'node ./scripts/automation/release-verify.mjs'],
  ['verify:fast', 'node ./scripts/automation/verify-fast.mjs'],
  ['verify:full', 'node ./scripts/automation/verify-full.mjs']
]);

const optionalBlueprintScripts = new Map([
  ['bootstrap:verify', 'bash ./scripts/bootstrap-verify.sh'],
  ['bootstrap:cleanup', 'node ./scripts/cleanup-bootstrap-artifacts.mjs'],
  ['path-policy:verify', 'node ./scripts/automation/check-path-policy.mjs'],
  ['lint:changed', 'node ./scripts/automation/lint-changed.mjs'],
  ['release:notes', 'node ./scripts/automation/release-notes.mjs'],
  ['verify:deploy', 'node ./scripts/automation/verify-deploy.mjs']
]);

const canonicalDocs = [
  '.github/workflows/ci.yml',
  '.github/workflows/release-tag.yml',
  'README.md',
  'AGENTS.md',
  'docs/README.md',
  'docs/PLANS.md',
  'docs/QUALITY_SCORE.md',
  'docs/FRONTEND.md',
  'docs/BACKEND.md',
  'docs/SECURITY.md',
  'docs/RELIABILITY.md',
  'docs/future/README.md',
  'docs/exec-plans/README.md',
  'docs/ops/automation/README.md',
  'docs/ops/api/README.md',
  'docs/ops/releases/README.md',
  'docs/ops/releases/release-mapping.md',
  'docs/ops/automation/LITE_QUICKSTART.md',
  'docs/governance/RULES.md',
  'docs/governance/policy-manifest.json',
  'docs/agent-hardening/RUN_CONTROL.md',
  'docs/governance/project-gates.json'
];

const requiredDocSnippets = [
  ['README.md', 'docs/future/ -> docs/exec-plans/active/ -> docs/exec-plans/completed/'],
  ['AGENTS.md', 'Every non-trivial code change should be reviewable as production engineering'],
  ['docs/QUALITY_SCORE.md', 'A slice is high quality only when it clears all applicable gates'],
  ['docs/ops/automation/README.md', 'Quality Review'],
  ['docs/FRONTEND.md', 'Frontend Quality Bar'],
  ['docs/BACKEND.md', 'Backend Quality Bar'],
  ['docs/SECURITY.md', 'Security Review Checklist'],
  ['docs/RELIABILITY.md', 'Reliability Anti-Patterns'],
  ['docs/agent-hardening/RUN_CONTROL.md', 'Runtime-native execution machinery is optional'],
  ['docs/governance/RULES.md', 'Policy Surface Model'],
  ['docs/governance/project-gates.json', '"id": "lint"'],
  ['docs/ops/api/README.md', 'API Contract'],
  ['docs/ops/releases/README.md', 'Release Contract']
];

function addFinding(code, message, filePath) {
  findings.push({ code, message, filePath });
}

async function pathExists(relativePath) {
  try {
    await fs.access(path.join(rootDir, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(rootDir, relativePath), 'utf8'));
}

async function readText(relativePath) {
  return fs.readFile(path.join(rootDir, relativePath), 'utf8');
}

function validateScripts(scriptMap, filePath) {
  for (const [scriptName, expected] of requiredScripts) {
    const actual = String(scriptMap?.[scriptName] ?? '').trim();
    if (actual !== expected) {
      addFinding('SCRIPT_MISMATCH', `Script '${scriptName}' must be '${expected}'.`, filePath);
    }
  }
  for (const [scriptName, expected] of optionalBlueprintScripts) {
    if (!Object.prototype.hasOwnProperty.call(scriptMap ?? {}, scriptName)) {
      continue;
    }
    const actual = String(scriptMap?.[scriptName] ?? '').trim();
    if (actual !== expected) {
      addFinding('SCRIPT_MISMATCH', `Script '${scriptName}' must be '${expected}'.`, filePath);
    }
  }
}

async function main() {
  const packagePayload = await readJson('package.json');
  validateScripts(packagePayload.scripts ?? {}, 'package.json');

  if (await pathExists('package.scripts.fragment.json')) {
    const fragment = await readJson('package.scripts.fragment.json');
    validateScripts(fragment.scripts ?? {}, 'package.scripts.fragment.json');
  }

  for (const relativePath of canonicalDocs) {
    if (!(await pathExists(relativePath))) {
      addFinding('MISSING_CANONICAL_DOC', `Missing required canonical doc '${relativePath}'.`, relativePath);
      continue;
    }
  }

  for (const [relativePath, snippet] of requiredDocSnippets) {
    const content = await readText(relativePath).catch(() => '');
    if (!content.includes(snippet)) {
      addFinding('MISSING_QUALITY_GUIDANCE', `Expected '${snippet}' in ${relativePath}.`, relativePath);
    }
  }

  const policy = await readJson('docs/governance/policy-manifest.json');
  if (policy?.executionModel?.mode !== 'repo-local-engineering-system') {
    addFinding('INVALID_EXECUTION_MODEL', 'policy-manifest executionModel.mode must be repo-local-engineering-system.', 'docs/governance/policy-manifest.json');
  }

  if (findings.length > 0) {
    console.error(`[harness:verify] failed with ${findings.length} issue(s).`);
    for (const finding of findings) {
      console.error(`- [${finding.code}] ${finding.message} (${finding.filePath})`);
    }
    process.exit(1);
  }

  console.log('[harness:verify] ok.');
}

main().catch((error) => {
  console.error('[harness:verify] failed with an unexpected error.');
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
