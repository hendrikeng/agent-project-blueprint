#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveSafeRepoPath } from '../automation/lib/repo-paths.mjs';
import { computeEvalInputSha256, evalInputPaths } from './eval-input-hash.mjs';

const rootDir = process.cwd();
const configPath = path.join(rootDir, 'docs', 'agent-hardening', 'evals.config.json');
const failureClasses = new Set([
  'hallucination',
  'policy_violation',
  'tool_misuse',
  'delegation_misuse',
  'workflow_incomplete',
  'context_loss',
  'unsafe_write',
  'verification_gap',
  'regression_escape'
]);
const severities = new Set(['critical', 'high', 'medium', 'low']);
const templatePlaceholderPattern = /\{\{[A-Z0-9_]+\}\}/;
const exactTemplatePlaceholderPattern = /^\{\{[A-Z0-9_]+\}\}$/;

function fail(message) {
  console.error(`[eval-verify] ${message}`);
  process.exit(1);
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isTemplatePlaceholder(value) {
  return exactTemplatePlaceholderPattern.test(String(value ?? '').trim());
}

function containsTemplatePlaceholder(value) {
  return templatePlaceholderPattern.test(String(value ?? ''));
}

function toIsoDate(value) {
  const parsed = Date.parse(String(value ?? ''));
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return new Date(parsed);
}

function daysBetween(a, b) {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function normalizePath(value) {
  return String(value).split(path.sep).join('/');
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isWithinRoot(absPath) {
  const relative = path.relative(rootDir, absPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function isTemplateMode() {
  const agentsPath = path.join(rootDir, 'AGENTS.md');
  if (!(await exists(agentsPath))) {
    return false;
  }
  const raw = await fs.readFile(agentsPath, 'utf8');
  const owner = raw.match(/^Owner:\s+(.+)$/m)?.[1]?.trim() ?? '';
  const updated = raw.match(/^Last Updated:\s+(.+)$/m)?.[1]?.trim() ?? '';
  return isTemplatePlaceholder(owner) && isTemplatePlaceholder(updated);
}

function parseJson(raw, filePath) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail(`Invalid JSON in ${filePath}: ${message}`);
  }
}

function suiteRequirementEntry(raw) {
  if (typeof raw === 'string') {
    return { id: raw, status: 'pass' };
  }
  if (isObject(raw) && typeof raw.id === 'string') {
    return {
      id: raw.id,
      status: String(raw.status ?? 'pass').trim().toLowerCase() || 'pass'
    };
  }
  fail('Each requiredSuites entry must be a string or object with an id.');
}

function fixtureRequirementEntry(raw) {
  if (!isObject(raw)) {
    fail('Each requiredFailureFixtures entry must be an object.');
  }
  const id = String(raw.id ?? '').trim();
  const failureClass = String(raw.failureClass ?? '').trim();
  const suiteId = String(raw.suiteId ?? '').trim();
  const fixturePath = String(raw.path ?? '').trim();
  if (!id || !failureClass || !suiteId || !fixturePath) {
    fail('Each requiredFailureFixtures entry must include id, failureClass, suiteId, and path.');
  }
  if (!failureClasses.has(failureClass)) {
    fail(`Required failure fixture '${id}' uses unknown failureClass '${failureClass}'.`);
  }
  return { id, failureClass, suiteId, path: fixturePath };
}

function assertNonEmptyStringArray(value, fieldName, fixtureId) {
  if (!Array.isArray(value) || value.length === 0) {
    fail(`Failure fixture '${fixtureId}' field '${fieldName}' must be a non-empty array.`);
  }
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.trim().length === 0) {
      fail(`Failure fixture '${fixtureId}' field '${fieldName}' must contain only non-empty strings.`);
    }
  }
}

function assertNoPlaceholder(value, fieldPath) {
  if (typeof value === 'string') {
    if (containsTemplatePlaceholder(value)) {
      fail(`Failure fixture field '${fieldPath}' contains unresolved placeholder: ${value}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoPlaceholder(entry, `${fieldPath}[${index}]`));
    return;
  }
  if (isObject(value)) {
    for (const [key, entry] of Object.entries(value)) {
      assertNoPlaceholder(entry, `${fieldPath}.${key}`);
    }
  }
}

async function verifyFailureFixture(requirement, suitesById) {
  const observedSuite = suitesById.get(requirement.suiteId);
  if (!observedSuite) {
    fail(`Failure fixture '${requirement.id}' references missing required suite '${requirement.suiteId}'.`);
  }

  let fixturePath;
  try {
    fixturePath = resolveSafeRepoPath(rootDir, requirement.path, 'Failure fixture path');
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  if (!(await exists(fixturePath.abs))) {
    fail(`Missing required failure fixture '${requirement.id}': ${requirement.path}`);
  }

  const fixture = parseJson(await fs.readFile(fixturePath.abs, 'utf8'), fixturePath.abs);
  if (!isObject(fixture)) {
    fail(`Failure fixture '${requirement.id}' must be a JSON object.`);
  }
  assertNoPlaceholder(fixture, requirement.id);

  const id = String(fixture.id ?? '').trim();
  const suiteId = String(fixture.suiteId ?? '').trim();
  const failureClass = String(fixture.failureClass ?? '').trim();
  const severity = String(fixture.severity ?? '').trim();
  if (id !== requirement.id) {
    fail(`Failure fixture id mismatch: expected '${requirement.id}', found '${id}'.`);
  }
  if (suiteId !== requirement.suiteId) {
    fail(`Failure fixture '${requirement.id}' suiteId mismatch: expected '${requirement.suiteId}', found '${suiteId}'.`);
  }
  if (failureClass !== requirement.failureClass) {
    fail(
      `Failure fixture '${requirement.id}' failureClass mismatch: expected '${requirement.failureClass}', found '${failureClass}'.`
    );
  }
  if (!severities.has(severity)) {
    fail(`Failure fixture '${requirement.id}' uses invalid severity '${severity}'.`);
  }
  if (fixture.deterministic !== true) {
    fail(`Failure fixture '${requirement.id}' must set deterministic=true.`);
  }
  for (const fieldName of ['prompt', 'badOutcome']) {
    if (typeof fixture[fieldName] !== 'string' || fixture[fieldName].trim().length === 0) {
      fail(`Failure fixture '${requirement.id}' field '${fieldName}' must be a non-empty string.`);
    }
  }
  assertNonEmptyStringArray(fixture.expectedDetection, 'expectedDetection', requirement.id);
  assertNonEmptyStringArray(fixture.requiredEvidence, 'requiredEvidence', requirement.id);
}

async function main() {
  const integrityOnly = process.argv.includes('--integrity-only');
  const templateMode = await isTemplateMode();
  if (!(await exists(configPath))) {
    fail(`Missing config file: ${normalizePath(path.relative(rootDir, configPath))}`);
  }

  const config = parseJson(await fs.readFile(configPath, 'utf8'), configPath);
  if (!isObject(config)) {
    fail('Eval config must be a JSON object.');
  }

  const reportRel = String(config.reportPath ?? '').trim();
  if (!reportRel) {
    fail("Config field 'reportPath' is required.");
  }

  let reportPath;
  try {
    reportPath = resolveSafeRepoPath(rootDir, reportRel, 'Eval report path');
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  if (!(await exists(reportPath.abs))) {
    fail(`Missing eval report file: ${reportRel}`);
  }

  const report = parseJson(await fs.readFile(reportPath.abs, 'utf8'), reportPath.abs);
  if (!isObject(report)) {
    fail('Eval report must be a JSON object.');
  }

  if (!templateMode && report.status !== 'pass' && !(integrityOnly && report.status === 'not-run')) {
    fail('Eval report is not a completed passing run. Run the required suites and record execution evidence; eval:refresh does not run evaluations.');
  }

  const generatedAtRaw = report.generatedAtUtc;
  if (typeof generatedAtRaw !== 'string' || generatedAtRaw.trim().length === 0) {
    fail("Report field 'generatedAtUtc' is required.");
  }
  if (templateMode && isTemplatePlaceholder(generatedAtRaw)) {
    console.log('[eval-verify] skipped in template mode (unresolved eval report placeholders).');
    return;
  }
  const generatedAt = toIsoDate(generatedAtRaw);
  if (!generatedAt) {
    fail(`Report generatedAtUtc is invalid: ${String(generatedAtRaw)}`);
  }

  for (const field of ['provider', 'model', 'runtimeVersion', 'promptVersion', 'toolConfigVersion']) {
    const expected = config.runtime?.[field];
    if (typeof expected !== 'string' || !expected.trim() || containsTemplatePlaceholder(expected)) {
      fail(`Eval config runtime.${field} must name the current evaluated system.`);
    }
    if (report.runtime?.[field] !== expected) {
      fail(`Eval report runtime.${field} does not match the configured system; rerun evaluations.`);
    }
  }

  const ageDays = daysBetween(generatedAt, new Date());
  if (ageDays < 0) {
    fail(`Eval report generatedAtUtc is in the future: ${generatedAtRaw}`);
  }
  const freshnessMode = String(config.freshnessMode ?? 'time-bound');
  if (freshnessMode === 'content-addressed') {
    const expectedInputSha256 = await computeEvalInputSha256(rootDir, config);
    if (report.inputSha256 !== expectedInputSha256) {
      fail('Eval report inputSha256 does not match current policy and fixture inputs; rerun the required suites and record evidence for the current inputs.');
    }
  } else if (freshnessMode === 'time-bound') {
    const maxAgeDays = Number(config.maxAgeDays ?? 0);
    if (!Number.isInteger(maxAgeDays) || maxAgeDays <= 0) {
      fail("Config field 'maxAgeDays' must be a positive integer.");
    }
    if (ageDays > maxAgeDays) {
      fail(`Eval report is stale (${ageDays} days old, max ${maxAgeDays}).`);
    }
  } else {
    fail(`Unsupported eval freshnessMode: ${freshnessMode}`);
  }

  // A passing claim always takes the strict evidence path, even in integrity mode.
  if (integrityOnly && report.status === 'not-run') {
    if (report.inputSha256 !== await computeEvalInputSha256(rootDir, config)) {
      fail('Eval report inputSha256 does not match current policy and fixture inputs; refresh the unrun report.');
    }
    const requiredSuites = (config.requiredSuites ?? []).map(suiteRequirementEntry);
    const suitesById = new Map(requiredSuites.map(suite => [suite.id, suite]));
    for (const fixture of config.requiredFailureFixtures ?? []) {
      await verifyFailureFixture(fixtureRequirementEntry(fixture), suitesById);
    }
    if (!report.summary || report.summary.total !== 0 || report.summary.passed !== 0 || report.summary.failed !== 0 || report.summary.passRate !== 0 ||
        !Array.isArray(report.suites) || report.suites.length !== requiredSuites.length ||
        new Set(report.suites.map(suite => suite.id)).size !== requiredSuites.length ||
        report.suites.some(suite => !suitesById.has(suite.id) || suite.status !== 'not-run' || suite.total !== 0 || suite.passed !== 0 || suite.failed !== 0 || suite.execution) ||
        !Array.isArray(report.evidence) || report.evidence.length !== 0) {
      fail('Unrun eval report must contain zero results and no execution evidence.');
    }
    console.log('[eval-integrity] current inputs; agent behavior NOT evaluated. Run eval:verify before agent activation.');
    return;
  }

  const summary = report.summary;
  if (!isObject(summary)) {
    fail("Report field 'summary' must be an object.");
  }

  const total = Number(summary.total);
  const passed = Number(summary.passed);
  const failed = Number(summary.failed);
  const passRate = Number(summary.passRate);
  if (!Number.isInteger(total) || !Number.isInteger(passed) || !Number.isInteger(failed) || !Number.isFinite(passRate)) {
    fail('Report summary fields total/passed/failed/passRate must be numeric.');
  }
  if (total <= 0) {
    fail('Eval report summary.total must be greater than zero.');
  }
  if (passed < 0 || failed < 0) {
    fail('Eval report summary passed/failed values must be non-negative.');
  }
  if (passed + failed !== total) {
    fail('Eval report summary is inconsistent: passed + failed must equal total.');
  }
  if (passRate < 0 || passRate > 1) {
    fail('Eval report summary.passRate must be within [0,1].');
  }
  const derivedPassRate = passed / total;
  if (Math.abs(derivedPassRate - passRate) > 0.001) {
    fail(
      `Eval report summary.passRate (${passRate}) does not match passed/total (${derivedPassRate.toFixed(3)}).`
    );
  }

  const minimumPassRate = Number(config.minimumPassRate ?? 0);
  if (!Number.isFinite(minimumPassRate) || minimumPassRate < 0 || minimumPassRate > 1) {
    fail("Config field 'minimumPassRate' must be within [0,1].");
  }
  if (passRate < minimumPassRate) {
    fail(`Eval passRate ${passRate.toFixed(3)} is below minimum ${minimumPassRate.toFixed(3)}.`);
  }

  const regressions = report.regressions;
  if (!isObject(regressions)) {
    fail("Report field 'regressions' must be an object.");
  }
  const criticalOpen = Number(regressions.criticalOpen ?? 0);
  const highOpen = Number(regressions.highOpen ?? 0);
  if (!Number.isFinite(criticalOpen) || !Number.isFinite(highOpen) || criticalOpen < 0 || highOpen < 0) {
    fail('Report regressions criticalOpen/highOpen must be non-negative numeric values.');
  }

  const maxCriticalRegressions = Number(config.maxCriticalRegressions ?? 0);
  const maxHighRegressions = Number(config.maxHighRegressions ?? 0);
  if (!Number.isFinite(maxCriticalRegressions) || !Number.isFinite(maxHighRegressions)) {
    fail("Config fields 'maxCriticalRegressions' and 'maxHighRegressions' must be numeric.");
  }
  if (criticalOpen > maxCriticalRegressions) {
    fail(`Open critical regressions (${criticalOpen}) exceed allowed max (${maxCriticalRegressions}).`);
  }
  if (highOpen > maxHighRegressions) {
    fail(`Open high regressions (${highOpen}) exceed allowed max (${maxHighRegressions}).`);
  }

  if (!Array.isArray(report.suites) || report.suites.length === 0) {
    fail("Report field 'suites' must be a non-empty array.");
  }
  const suitesById = new Map();
  const suiteCounts = { total: 0, passed: 0, failed: 0 };
  const currentInputSha256 = await computeEvalInputSha256(rootDir, config);
  const inputPaths = new Set(evalInputPaths(config));
  for (const suite of report.suites) {
    if (!isObject(suite)) {
      fail('Each report suite entry must be an object.');
    }
    const id = String(suite.id ?? '').trim();
    const status = String(suite.status ?? '').trim().toLowerCase();
    if (!id) {
      fail('Each report suite must include a non-empty id.');
    }
    if (!['pass', 'fail'].includes(status)) {
      fail(`Suite '${id}' must record a completed pass or fail status.`);
    }
    if (suitesById.has(id)) {
      fail(`Duplicate suite id in report: '${id}'.`);
    }

    const suiteTotal = Number(suite.total ?? 0);
    const suitePassed = Number(suite.passed ?? 0);
    const suiteFailed = Number(suite.failed ?? 0);
    if (!Number.isInteger(suiteTotal) || suiteTotal <= 0) {
      fail(`Suite '${id}' has invalid total value.`);
    }
    if (!Number.isInteger(suitePassed) || suitePassed < 0 || !Number.isInteger(suiteFailed) || suiteFailed < 0) {
      fail(`Suite '${id}' has invalid passed/failed values.`);
    }
    if (suitePassed + suiteFailed !== suiteTotal || (status === 'pass') !== (suiteFailed === 0)) {
      fail(`Suite '${id}' counts do not match its status or total.`);
    }
    const execution = suite.execution;
    if (!isObject(execution) || typeof execution.runner !== 'string' || !execution.runner.trim()) {
      fail(`Suite '${id}' needs execution evidence with a named runner or manual reviewer.`);
    }
    assertNoPlaceholder(execution, `suites.${id}.execution`);
    const executedAt = toIsoDate(execution.executedAtUtc);
    if (!executedAt || executedAt > generatedAt || executedAt > new Date()) {
      fail(`Suite '${id}' has an invalid execution timestamp.`);
    }
    if (execution.inputSha256 !== currentInputSha256) {
      fail(`Suite '${id}' execution evidence is stale; rerun it against current inputs.`);
    }
    const requiredFixtures = (config.requiredFailureFixtures ?? []).filter((fixture) => fixture.suiteId === id);
    if (!Array.isArray(execution.fixtureIds) || requiredFixtures.some((fixture) => !execution.fixtureIds.includes(fixture.id))) {
      fail(`Suite '${id}' execution evidence must cover its required failure fixtures.`);
    }
    if (typeof execution.evidence !== 'string' || path.isAbsolute(execution.evidence)) {
      fail(`Suite '${id}' needs a relative execution evidence path; absolute paths can escape repository root.`);
    }
    const evidence = resolveSafeRepoPath(rootDir, execution.evidence, 'Execution evidence path');
    const evidenceReal = await fs.realpath(evidence.abs);
    const realRoot = await fs.realpath(rootDir);
    const relativeReal = path.relative(realRoot, evidenceReal);
    if (relativeReal === '..' || relativeReal.startsWith(`..${path.sep}`) || path.isAbsolute(relativeReal)) {
      fail(`Suite '${id}' execution evidence escapes repository root.`);
    }
    const forbiddenPaths = [reportRel, ...inputPaths];
    for (const forbidden of forbiddenPaths) {
      if (evidenceReal === await fs.realpath(path.resolve(rootDir, forbidden))) {
        fail(`Suite '${id}' needs execution output, not its report, policy, or input fixture.`);
      }
    }
    if (!(await fs.readFile(evidenceReal, 'utf8')).trim()) {
      fail(`Suite '${id}' execution evidence is empty.`);
    }
    suiteCounts.total += suiteTotal;
    suiteCounts.passed += suitePassed;
    suiteCounts.failed += suiteFailed;
    suitesById.set(id, { id, status });
  }

  if (suiteCounts.total !== total || suiteCounts.passed !== passed || suiteCounts.failed !== failed) {
    fail('Eval report summary must equal the suite totals.');
  }

  const requiredSuites = Array.isArray(config.requiredSuites) ? config.requiredSuites : [];
  for (const rawRequirement of requiredSuites) {
    const requirement = suiteRequirementEntry(rawRequirement);
    const observed = suitesById.get(requirement.id);
    if (!observed) {
      fail(`Required eval suite is missing from report: '${requirement.id}'.`);
    }
    if (observed.status !== requirement.status) {
      fail(
        `Suite '${requirement.id}' status '${observed.status}' does not satisfy required status '${requirement.status}'.`
      );
    }
  }

  const requiredFailureFixtures = Array.isArray(config.requiredFailureFixtures)
    ? config.requiredFailureFixtures
    : [];
  const seenFixtureIds = new Set();
  for (const rawRequirement of requiredFailureFixtures) {
    const requirement = fixtureRequirementEntry(rawRequirement);
    if (seenFixtureIds.has(requirement.id)) {
      fail(`Duplicate required failure fixture id: '${requirement.id}'.`);
    }
    seenFixtureIds.add(requirement.id);
    await verifyFailureFixture(requirement, suitesById);
  }

  const requireEvidencePaths = config.requireEvidencePaths !== false;
  if (requireEvidencePaths) {
    if (!Array.isArray(report.evidence) || report.evidence.length === 0) {
      fail("Report field 'evidence' must be a non-empty array when requireEvidencePaths=true.");
    }
    for (const evidencePath of report.evidence) {
      const evidenceRel = String(evidencePath ?? '').trim();
      if (!evidenceRel) {
        fail('Eval evidence entries must be non-empty strings.');
      }
      if (containsTemplatePlaceholder(evidenceRel)) {
        fail(`Eval evidence path contains unresolved placeholder: ${evidenceRel}`);
      }
      const evidenceAbs = path.resolve(rootDir, evidenceRel);
      if (!isWithinRoot(evidenceAbs)) {
        fail(`Eval evidence path escapes repository root: ${evidenceRel}`);
      }
      if (!(await exists(evidenceAbs))) {
        fail(`Eval evidence path does not exist: ${evidenceRel}`);
      }
    }
  }

  console.log(
    `[eval-verify] passed (age=${ageDays}d passRate=${passRate.toFixed(3)} suites=${report.suites.length} criticalOpen=${criticalOpen} highOpen=${highOpen}).`
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack : String(error);
  fail(message);
});
