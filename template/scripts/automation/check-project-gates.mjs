#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const rootDir = process.cwd();
const configRel = 'docs/governance/project-gates.json';
const configPath = path.join(rootDir, configRel);
const VALID_PROFILES = new Set(['fast', 'full', 'release', 'deploy']);
const VALID_STATUSES = new Set(['required', 'deferred', 'not-applicable']);
const PLACEHOLDER_REGEX = /\{\{[A-Z0-9_]+\}\}/;
const FORBIDDEN_AGGREGATE_COMMANDS = [
  /npm\s+run\s+verify:fast\b/,
  /npm\s+run\s+verify:full\b/,
  /npm\s+run\s+project:gates:/,
  /npm\s+run\s+harness:verify\b/,
  /node\s+\S*check-project-gates\.mjs\b/
];
const NO_OP_COMMANDS = [
  /^true$/,
  /^:$/,
  /^echo\b/i,
  /^printf\b/i,
  /^node\s+-e\s+["']?process\.exit\(0\)/i
];
const SHELL_CONTROL_PATTERN = /(?:&&|\|\||;|`|\$\(|\||>|<)/;

function fail(message) {
  console.error(`[project-gates] ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const options = { profile: 'all', run: false, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--run') {
      options.run = true;
    } else if (token === '--dry-run') {
      options.dryRun = true;
    } else if (token === '--profile') {
      options.profile = argv[index + 1] ?? '';
      index += 1;
    } else if (token.startsWith('--profile=')) {
      options.profile = token.slice('--profile='.length);
    } else if (token === '--help' || token === '-h') {
      options.help = true;
    } else {
      fail(`Unknown argument: ${token}`);
    }
  }
  if (options.profile !== 'all' && !VALID_PROFILES.has(options.profile)) {
    fail(`Invalid profile '${options.profile}'. Expected one of: all, ${[...VALID_PROFILES].join(', ')}.`);
  }
  return options;
}

function usage() {
  return [
    'Usage: node ./scripts/automation/check-project-gates.mjs [--profile all|fast|full|release|deploy] [--run] [--dry-run]',
    '',
    'Validates docs/governance/project-gates.json and optionally runs required gates for the selected profile.'
  ].join('\n');
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isTemplatePlaceholder(value) {
  return /^\{\{[A-Z0-9_]+\}\}$/.test(String(value ?? '').trim());
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

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateCommand(gate, findings, templateMode) {
  const command = String(gate.command ?? '').trim();

  if (gate.status === 'required') {
    if (!command) {
      findings.push(`Gate '${gate.id}' is required but has no command.`);
      return;
    }
    if (PLACEHOLDER_REGEX.test(command)) {
      if (!templateMode) {
        findings.push(`Gate '${gate.id}' still contains an unresolved placeholder command.`);
      }
      return;
    }
    if (NO_OP_COMMANDS.some((pattern) => pattern.test(command))) {
      findings.push(`Gate '${gate.id}' uses a no-op command: ${command}`);
    }
    if (SHELL_CONTROL_PATTERN.test(command)) {
      findings.push(`Gate '${gate.id}' must be a single project command without shell control operators: ${command}`);
    }
    if (FORBIDDEN_AGGREGATE_COMMANDS.some((pattern) => pattern.test(command))) {
      findings.push(`Gate '${gate.id}' must call a real project check, not a recursive aggregate command: ${command}`);
    }
    return;
  }

  if (command) {
    findings.push(`Gate '${gate.id}' has status '${gate.status}' but also declares a command. Use status 'required' for runnable gates.`);
  }
  const rationale = String(gate.rationale ?? '').trim();
  if (rationale.length < 24 || PLACEHOLDER_REGEX.test(rationale)) {
    findings.push(`Gate '${gate.id}' with status '${gate.status}' needs a concrete rationale.`);
  }
}

function validateConfig(config, templateMode) {
  const findings = [];
  if (!isObject(config)) {
    return ['Config must be a JSON object.'];
  }
  if (!Number.isInteger(config.version) || config.version < 1) {
    findings.push('Config field version must be a positive integer.');
  }
  if (!isObject(config.profiles)) {
    findings.push('Config field profiles must be an object.');
  } else {
    for (const profile of VALID_PROFILES) {
      if (typeof config.profiles[profile] !== 'string' || config.profiles[profile].trim().length < 8) {
        findings.push(`Config profiles.${profile} must be documented.`);
      }
    }
  }
  if (!Array.isArray(config.gates) || config.gates.length === 0) {
    findings.push('Config field gates must be a non-empty array.');
    return findings;
  }

  const ids = new Set();
  const seenProfiles = new Set();
  for (const [index, gate] of config.gates.entries()) {
    if (!isObject(gate)) {
      findings.push(`Gate at index ${index} must be an object.`);
      continue;
    }
    const id = String(gate.id ?? '').trim();
    const profile = String(gate.profile ?? '').trim();
    const status = String(gate.status ?? '').trim();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
      findings.push(`Gate at index ${index} has invalid id '${id}'.`);
    } else if (ids.has(id)) {
      findings.push(`Duplicate gate id '${id}'.`);
    } else {
      ids.add(id);
    }
    if (!VALID_PROFILES.has(profile)) {
      findings.push(`Gate '${id || index}' has invalid profile '${profile}'.`);
    }
    if (!VALID_STATUSES.has(status)) {
      findings.push(`Gate '${id || index}' has invalid status '${status}'.`);
    }
    if (typeof gate.rationale !== 'string' || gate.rationale.trim().length < 16) {
      findings.push(`Gate '${id || index}' needs a rationale of at least 16 characters.`);
    }
    validateCommand(gate, findings, templateMode);
    if (profile === 'fast' || profile === 'full') {
      seenProfiles.add(`${profile}:${id}`);
    }
  }

  const requiredBaseline = [
    ['fast', 'lint'],
    ['fast', 'typecheck'],
    ['fast', 'unit-tests'],
    ['full', 'build']
  ];
  for (const [profile, id] of requiredBaseline) {
    if (!seenProfiles.has(`${profile}:${id}`)) {
      findings.push(`Baseline gate '${id}' must be declared in profile '${profile}', with a real command or explicit exemption rationale.`);
    }
  }

  return findings;
}

function gatesForProfile(config, profile) {
  if (profile === 'all') {
    return config.gates;
  }
  return config.gates.filter((gate) => gate.profile === profile);
}

function runGate(gate, { dryRun }) {
  const command = String(gate.command ?? '').trim();
  if (dryRun) {
    console.log(`[project-gates] dry-run ${gate.id}: ${command}`);
    return 0;
  }
  console.log(`[project-gates] run ${gate.id}: ${command}`);
  const result = spawnSync(command, {
    shell: true,
    stdio: 'inherit',
    env: process.env
  });
  if (result.error) {
    throw result.error;
  }
  return result.status ?? 1;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  if (!(await exists(configPath))) {
    fail(`Missing config: ${configRel}`);
  }
  const templateMode = await isTemplateMode();
  const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
  const findings = validateConfig(config, templateMode);
  if (findings.length > 0) {
    console.error(`[project-gates] failed with ${findings.length} issue(s):`);
    for (const finding of findings) {
      console.error(`- ${finding}`);
    }
    process.exit(1);
  }

  const selected = gatesForProfile(config, options.profile);
  const required = selected.filter((gate) => gate.status === 'required');
  const skipped = selected.filter((gate) => gate.status !== 'required');
  console.log(`[project-gates] verified ${config.gates.length} gate declaration(s); selected ${selected.length} for profile '${options.profile}'.`);

  if (skipped.length > 0) {
    for (const gate of skipped) {
      console.log(`[project-gates] ${gate.status} ${gate.id}: ${gate.rationale}`);
    }
  }

  if (!options.run) {
    return;
  }
  if (templateMode) {
    console.log('[project-gates] skipped running project gates in raw template mode.');
    return;
  }
  for (const gate of required) {
    const status = runGate(gate, { dryRun: options.dryRun });
    if (status !== 0) {
      process.exit(status);
    }
  }
  console.log(`[project-gates] profile '${options.profile}' passed.`);
}

main().catch((error) => {
  console.error('[project-gates] failed with an unexpected error.');
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
