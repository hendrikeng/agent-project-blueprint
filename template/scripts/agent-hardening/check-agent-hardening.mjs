#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();

const requiredMarkdownFiles = [
  'VISION.md',
  'AGENTS.md',
  'docs/agent-hardening/AGENT_LOOP.md',
  'docs/agent-hardening/README.md',
  'docs/agent-hardening/EVALS.md',
  'docs/agent-hardening/OBSERVABILITY.md',
  'docs/agent-hardening/RUN_CONTROL.md',
  'docs/agent-hardening/TOOL_POLICY.md',
  'docs/agent-hardening/MEMORY_CONTEXT.md'
];
const requiredJsonFiles = [
  'docs/agent-hardening/evals.config.json',
  'docs/generated/evals-report.json'
];

const requiredMetadataFields = ['Status', 'Owner', 'Last Updated', 'Source of Truth'];

const requiredHeadings = {
  'VISION.md': [
    'Purpose',
    'Users And Outcomes',
    'Strategic Boundaries',
    'Canonical Product References'
  ],
  'AGENTS.md': ['Operating Model', 'Agent Handout', 'Core Map'],
  'docs/agent-hardening/AGENT_LOOP.md': [
    'Loop Contract',
    'Loop Inputs',
    'Checks That Can Say No',
    'Evidence And Closeout',
    'Stop Rules'
  ],
  'docs/agent-hardening/README.md': ['Why This Exists', 'Canonical Documents', 'Enforcement'],
  'docs/agent-hardening/EVALS.md': [
    'Eval Lifecycle',
    'Failure Taxonomy',
    'Failure Fixture Contract',
    'Release Gates',
    'Generated Artifact Contract'
  ],
  'docs/agent-hardening/OBSERVABILITY.md': ['Required Run Trace Fields', 'Error Classification', 'Retention and Redaction'],
  'docs/agent-hardening/RUN_CONTROL.md': [
    'Goal-Driven Run Control',
    'Delegation and Handoffs',
    'Runtime Execution Contract',
    'Completion Audits'
  ],
  'docs/agent-hardening/TOOL_POLICY.md': ['Risk Tiers', 'Approval Requirements', 'Execution Safety Rules'],
  'docs/agent-hardening/MEMORY_CONTEXT.md': [
    'Context Budget Rules',
    'Persistence Rules',
    'Provenance and Redaction'
  ]
};

const findings = [];

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function checkMetadata(content, filePath) {
  for (const field of requiredMetadataFields) {
    const regex = new RegExp(`^${escapeRegex(field)}:\\s+.+$`, 'm');
    if (!regex.test(content)) {
      findings.push(`[MISSING_METADATA] ${filePath} missing metadata field "${field}:"`);
    }
  }
}

function checkHeadings(content, filePath) {
  for (const heading of requiredHeadings[filePath] ?? []) {
    const regex = new RegExp(`^##\\s+${escapeRegex(heading)}\\s*$`, 'm');
    if (!regex.test(content)) {
      findings.push(`[MISSING_HEADING] ${filePath} missing heading "## ${heading}"`);
    }
  }
}

for (const relPath of requiredMarkdownFiles) {
  const absPath = path.join(rootDir, relPath);
  if (!(await fileExists(absPath))) {
    findings.push(`[MISSING_FILE] ${relPath}`);
    continue;
  }

  const content = await fs.readFile(absPath, 'utf8');
  checkMetadata(content, relPath);
  if (relPath === 'VISION.md' && /^Source of Truth:\s+README\.md#product-direction\s*$/m.test(content)) {
    const readme = await fs.readFile(path.join(rootDir, 'README.md'), 'utf8').catch(() => '');
    const direction = readme.match(/^## Product Direction\r?\n([\s\S]*?)(?=^#{1,2}\s|(?![\s\S]))/m)?.[1].trim();
    if (!direction) findings.push('[MISSING_DIRECTION] README.md needs a nonempty Product Direction section for the VISION pointer.');
  } else {
    checkHeadings(content, relPath);
  }
}

for (const relPath of requiredJsonFiles) {
  const absPath = path.join(rootDir, relPath);
  if (!(await fileExists(absPath))) {
    findings.push(`[MISSING_FILE] ${relPath}`);
    continue;
  }

  try {
    JSON.parse(await fs.readFile(absPath, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    findings.push(`[INVALID_JSON] ${relPath} ${message}`);
  }
}

if (findings.length > 0) {
  console.error(`[agent-verify] failed with ${findings.length} issue(s):`);
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log(
  `[agent-verify] passed (${requiredMarkdownFiles.length + requiredJsonFiles.length} required files).`
);
