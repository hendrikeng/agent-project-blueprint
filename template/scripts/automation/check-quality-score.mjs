#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { runGovernanceAnalysis } from '../docs/lib/governance-core.mjs';

const rootDir = process.cwd();
const qualityDocRel = 'docs/QUALITY_SCORE.md';
const docConfigRel = 'docs/governance/doc-checks.config.json';
const gatesConfigRel = 'docs/governance/project-gates.json';
const placeholderPattern = /\{\{[A-Z0-9_]+\}\}/;
const acceptedWeakOwners = new Set(['', 'owner', 'tbd', 'todo', 'unknown', 'n/a', 'none']);
const baselineRequiredGates = new Map([
  ['fast:lint', 'lint'],
  ['fast:typecheck', 'typecheck'],
  ['fast:unit-tests', 'unit-tests'],
  ['full:build', 'build']
]);
const requiredQualityScoreLabels = [
  'Domain correctness and invariants',
  'Critical-domain safety and auditability',
  'Authorization and boundary enforcement',
  'Architecture boundary enforcement',
  'Documentation governance enforcement',
  'Test coverage for critical flows'
];
const findingHints = new Map([
  ['MISSING_QUALITY_SCORE_DOC', 'Create docs/QUALITY_SCORE.md from the harness template and fill the owner, date, and six rubric rows.'],
  ['UNCLEAR_QUALITY_OWNER', 'Set Owner to the accountable team or person; avoid generic placeholders such as owner, TBD, or DOC_OWNER.'],
  ['MISSING_QUALITY_TIMESTAMP', 'Add Last Updated in YYYY-MM-DD format.'],
  ['INVALID_QUALITY_TIMESTAMP', 'Use an ISO date such as 2026-05-12.'],
  ['FUTURE_QUALITY_TIMESTAMP', 'Set Last Updated to today or the last real review date.'],
  ['STALE_QUALITY_SCORE', 'Review the rubric, update scores only where evidence changed, and refresh Last Updated.'],
  ['DUPLICATE_QUALITY_SCORE', 'Keep one score row for each required label inside Domain Scores or Platform Scores.'],
  ['MISSING_SCORE_RUBRIC', 'Add the missing required labels under Domain Scores or Platform Scores.'],
  ['INVALID_QUALITY_SCORE', 'Use an integer 1-5, or leave the template placeholder only before adoption.'],
  ['LOW_QUALITY_SCORE', 'Keep the score if accurate, but bias toward smaller slices and stronger validation evidence.'],
  ['MISSING_DOC_GOVERNANCE_CONFIG', 'Add docs/governance/doc-checks.config.json from the harness template.'],
  ['UNCLEAR_DOC_OWNER', 'Set Owner metadata on the canonical doc to a concrete owner.'],
  ['MISSING_PROJECT_GATES', 'Add docs/governance/project-gates.json and wire real project commands.'],
  ['MISSING_BASELINE_GATE', 'Declare fast lint, fast typecheck, fast unit-tests, and full build gates.'],
  ['WEAK_BASELINE_GATE', 'Use required with a real command, or deferred/not-applicable with an empty command and a concrete rationale.'],
  ['INVALID_GATE_EXEMPTION', 'Use an empty command and a concrete rationale of at least 24 characters.'],
  ['EXEMPT_BASELINE_GATE', 'This exemption records missing or inapplicable validation, not a successful check.'],
  ['MISSING_GATE_COMMAND', 'Set the gate command to the real project toolchain command.'],
  ['PLACEHOLDER_GATE_COMMAND', 'Replace placeholder commands with real project commands before adoption is complete.'],
  ['DEFERRED_QUALITY_GATE', 'Keep the deferral truthful with owner, rationale, and activation path; wire the real command when the surface exists.']
]);

function finding(severity, code, message, file = null) {
  return { severity, code, message, file };
}

function formatFinding(entry) {
  const file = entry.file ? ` (${entry.file})` : '';
  const hint = findingHints.get(entry.code);
  const next = hint ? `\n  next: ${hint}` : '';
  return `- [${entry.code}] ${entry.message}${file}${next}`;
}

async function exists(relPath) {
  try {
    await fs.access(path.join(rootDir, relPath));
    return true;
  } catch {
    return false;
  }
}

async function readText(relPath) {
  return fs.readFile(path.join(rootDir, relPath), 'utf8');
}

async function readJson(relPath) {
  return JSON.parse(await readText(relPath));
}

function metadataValue(content, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return content.match(new RegExp(`^${escaped}:\\s+(.+)$`, 'm'))?.[1]?.trim() ?? '';
}

function isTemplatePlaceholder(value) {
  return placeholderPattern.test(String(value ?? '').trim());
}

async function isTemplateMode() {
  if (!(await exists('AGENTS.md'))) {
    return false;
  }
  const agents = await readText('AGENTS.md');
  return isTemplatePlaceholder(metadataValue(agents, 'Owner')) &&
    isTemplatePlaceholder(metadataValue(agents, 'Last Updated'));
}

function parseIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? '').trim())) {
    return null;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function daysBetween(a, b) {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function qualityScoreLines(content) {
  const entries = [];
  let inScoreSection = false;

  for (const line of content.split(/\r?\n/)) {
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      inScoreSection = heading[1].trim() === 'Domain Scores' || heading[1].trim() === 'Platform Scores';
      continue;
    }
    if (!inScoreSection) {
      continue;
    }
    const score = line.match(/^-\s+([^:]+):\s+(.+)$/);
    if (score) {
      entries.push({ label: score[1].trim(), value: score[2].trim() });
    }
  }

  return entries;
}

function inspectQualityDoc(content, { templateMode, now }) {
  const findings = [];
  const owner = metadataValue(content, 'Owner');
  const updated = metadataValue(content, 'Last Updated');

  if (!owner || (!templateMode && isTemplatePlaceholder(owner)) || acceptedWeakOwners.has(owner.toLowerCase())) {
    findings.push(finding('error', 'UNCLEAR_QUALITY_OWNER', 'Quality score doc must name a concrete owner.', qualityDocRel));
  }
  if (!updated || (!templateMode && isTemplatePlaceholder(updated))) {
    findings.push(finding('error', 'MISSING_QUALITY_TIMESTAMP', 'Quality score doc must have a concrete Last Updated date.', qualityDocRel));
  } else if (!templateMode || !isTemplatePlaceholder(updated)) {
    const parsed = parseIsoDate(updated);
    if (!parsed) {
      findings.push(finding('error', 'INVALID_QUALITY_TIMESTAMP', 'Quality score Last Updated must be YYYY-MM-DD.', qualityDocRel));
    } else {
      const age = daysBetween(parsed, now);
      if (age < 0) {
        findings.push(finding('error', 'FUTURE_QUALITY_TIMESTAMP', 'Quality score Last Updated is in the future.', qualityDocRel));
      } else if (age > 90) {
        findings.push(finding('error', 'STALE_QUALITY_SCORE', `Quality score is stale (${age} days, max 90).`, qualityDocRel));
      }
    }
  }

  const scoreEntries = qualityScoreLines(content);
  const scoresByLabel = new Map();
  for (const entry of scoreEntries) {
    if (!requiredQualityScoreLabels.includes(entry.label)) {
      continue;
    }
    if (scoresByLabel.has(entry.label)) {
      findings.push(finding('error', 'DUPLICATE_QUALITY_SCORE', `Quality score '${entry.label}' is listed more than once.`, qualityDocRel));
      continue;
    }
    scoresByLabel.set(entry.label, entry);
  }

  const missingLabels = requiredQualityScoreLabels.filter((label) => !scoresByLabel.has(label));
  if (missingLabels.length > 0) {
    findings.push(
      finding(
        'error',
        'MISSING_SCORE_RUBRIC',
        `Quality score doc must include all six domain/platform scores; missing: ${missingLabels.join(', ')}.`,
        qualityDocRel
      )
    );
  }

  for (const score of scoresByLabel.values()) {
    if (templateMode && isTemplatePlaceholder(score.value)) {
      continue;
    }
    const numeric = Number(score.value);
    if (!Number.isInteger(numeric) || numeric < 1 || numeric > 5) {
      findings.push(finding('error', 'INVALID_QUALITY_SCORE', `Score '${score.label}' must be an integer from 1 to 5.`, qualityDocRel));
    } else if (numeric < 4) {
      findings.push(finding('warning', 'LOW_QUALITY_SCORE', `Score '${score.label}' is ${numeric}; bias toward smaller slices and stronger evidence.`, qualityDocRel));
    }
  }

  return findings;
}

function inspectProjectGates(config, { templateMode }) {
  const findings = [];
  const gates = Array.isArray(config.gates) ? config.gates : [];
  const byProfileAndId = new Map(gates.map((gate) => [`${gate.profile}:${gate.id}`, gate]));

  for (const [key, id] of baselineRequiredGates) {
    const gate = byProfileAndId.get(key);
    if (!gate) {
      findings.push(finding('error', 'MISSING_BASELINE_GATE', `Missing baseline quality gate '${id}'.`, gatesConfigRel));
      continue;
    }
    const command = String(gate.command ?? '').trim();
    if (gate.status === 'deferred' || gate.status === 'not-applicable') {
      const rationale = String(gate.rationale ?? '').trim();
      if (command || rationale.length < 24 || placeholderPattern.test(rationale)) {
        findings.push(finding('error', 'INVALID_GATE_EXEMPTION', `Exempt gate '${id}' needs an empty command and a concrete rationale.`, gatesConfigRel));
      } else {
        findings.push(finding('warning', 'EXEMPT_BASELINE_GATE', `Baseline gate '${id}' is ${gate.status}: ${rationale}`, gatesConfigRel));
      }
      continue;
    }
    if (gate.status !== 'required') {
      findings.push(finding('error', 'WEAK_BASELINE_GATE', `Baseline gate '${id}' has an invalid status.`, gatesConfigRel));
    }
    if (!command) {
      findings.push(finding('error', 'MISSING_GATE_COMMAND', `Required gate '${id}' has no command.`, gatesConfigRel));
    } else if (!templateMode && placeholderPattern.test(command)) {
      findings.push(finding('error', 'PLACEHOLDER_GATE_COMMAND', `Required gate '${id}' still uses a placeholder command.`, gatesConfigRel));
    }
  }

  for (const gate of gates) {
    if (gate.status !== 'deferred') {
      continue;
    }
    if (gate.id === 'integration-tests' || gate.id === 'security-audit' || gate.id === 'deploy-verify') {
      findings.push(
        finding(
          'warning',
          'DEFERRED_QUALITY_GATE',
          `Gate '${gate.id}' is deferred; keep a concrete owner and activation path.`,
          gatesConfigRel
        )
      );
    }
  }

  return findings;
}

async function inspectOwnership(config, { templateMode }) {
  const findings = [];
  for (const rule of config.metadataRules ?? []) {
    if (!Array.isArray(rule.requiredFields) || !rule.requiredFields.includes('Owner')) {
      continue;
    }
    if (!(await exists(rule.path))) {
      continue;
    }
    const content = await readText(rule.path);
    const owner = metadataValue(content, 'Owner');
    if (!owner || acceptedWeakOwners.has(owner.toLowerCase()) || (!templateMode && isTemplatePlaceholder(owner))) {
      findings.push(finding('error', 'UNCLEAR_DOC_OWNER', 'Canonical doc must name a concrete owner.', rule.path));
    }
  }
  return findings;
}

function scoreFromFindings(findings) {
  const errorCount = findings.filter((entry) => entry.severity === 'error').length;
  const warningCount = findings.filter((entry) => entry.severity === 'warning').length;
  return Math.max(0, 100 - errorCount * 15 - warningCount * 3);
}

async function main() {
  const now = new Date();
  const templateMode = await isTemplateMode();
  const findings = [];

  if (!(await exists(qualityDocRel))) {
    findings.push(finding('error', 'MISSING_QUALITY_SCORE_DOC', 'Missing quality score rubric.', qualityDocRel));
  } else {
    findings.push(...inspectQualityDoc(await readText(qualityDocRel), { templateMode, now }));
  }

  if (!(await exists(docConfigRel))) {
    findings.push(finding('error', 'MISSING_DOC_GOVERNANCE_CONFIG', 'Missing doc governance config.', docConfigRel));
  } else {
    const docConfig = await readJson(docConfigRel);
    findings.push(...await inspectOwnership(docConfig, { templateMode }));
    const governance = await runGovernanceAnalysis({
      rootDir,
      configPath: path.join(rootDir, docConfigRel),
      now
    });
    for (const entry of governance.errors) {
      if (['STALE_DOC', 'FUTURE_DOC_TIMESTAMP', 'MISSING_STALENESS_TIMESTAMP'].includes(entry.code)) {
        findings.push(finding('error', entry.code, entry.message, entry.file));
      }
    }
  }

  if (!(await exists(gatesConfigRel))) {
    findings.push(finding('error', 'MISSING_PROJECT_GATES', 'Missing project gates config.', gatesConfigRel));
  } else {
    findings.push(...inspectProjectGates(await readJson(gatesConfigRel), { templateMode }));
  }

  const score = scoreFromFindings(findings);
  const errors = findings.filter((entry) => entry.severity === 'error');
  const warnings = findings.filter((entry) => entry.severity === 'warning');

  console.log(`[quality-score] score=${score} errors=${errors.length} warnings=${warnings.length}`);
  if (warnings.length > 0) {
    console.log('\nWarnings:');
    for (const warning of warnings) {
      console.log(formatFinding(warning));
    }
  }
  if (errors.length > 0) {
    console.error('\nErrors:');
    for (const error of errors) {
      console.error(formatFinding(error));
    }
    process.exit(1);
  }

  console.log('[quality-score] passed.');
}

main().catch((error) => {
  console.error('[quality-score] failed with an unexpected error.');
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
