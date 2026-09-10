#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const rootDir = process.cwd();
const PLAN_ID_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      options[key] = true;
      continue;
    }
    options[key] = next;
    index += 1;
  }
  return options;
}

function asBoolean(value, fallback = false) {
  if (value == null) return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return fallback;
}

function toPosix(value) {
  return String(value ?? '').replace(/\\/g, '/');
}

function runCommand(command, dryRun) {
  if (dryRun) {
    console.log(`[verify-fast] dry-run: ${command}`);
    return { status: 0 };
  }
  const result = spawnSync(command, {
    shell: true,
    stdio: 'inherit',
    env: process.env
  });
  if (result.error) {
    throw result.error;
  }
  return { status: result.status ?? 1 };
}

function detectChangedFiles() {
  const provided = String(process.env.VERIFY_FAST_FILES ?? '').trim();
  if (provided) {
    return [...new Set(
      provided
        .split(',')
        .map((entry) => toPosix(entry.trim()))
        .filter(Boolean)
    )];
  }
  return [];
}

function resolvedPlanMetadataCommand() {
  const planId = String(process.env.VERIFY_PLAN_ID ?? '').trim().toLowerCase();
  if (!planId || !PLAN_ID_REGEX.test(planId)) {
    return 'node ./scripts/automation/check-plan-metadata.mjs';
  }
  return `node ./scripts/automation/check-plan-metadata.mjs --plan-id ${planId}`;
}

function buildCommandSet(changedFiles, scope) {
  const commands = [
    'node ./scripts/automation/compile-runtime-context.mjs',
    'node ./scripts/automation/lint-changed.mjs',
    'node ./scripts/automation/check-path-policy.mjs',
    'node ./scripts/docs/repair-plan-references.mjs --check',
    'node ./scripts/docs/check-governance.mjs',
    'node ./scripts/agent-hardening/check-evals.mjs',
    ...(['broad', 'harness'].includes(scope) ? ['npm run harness:test'] : []),
    resolvedPlanMetadataCommand(),
    'node ./scripts/automation/check-plan-closeout.mjs',
    'node ./scripts/automation/check-harness-alignment.mjs',
    'node ./scripts/automation/check-quality-score.mjs',
    `node ./scripts/automation/check-project-gates.mjs --profile fast${['broad', 'product'].includes(scope) ? ' --run' : ''}`,
    ...(['broad', 'harness'].includes(scope) ? ['node ./scripts/agent-hardening/check-agent-hardening.mjs'] : [])
  ];

  const needsArchitecture = changedFiles.some((file) => (
    file === 'ARCHITECTURE.md' ||
    file.startsWith('docs/architecture/') ||
    file.startsWith('scripts/architecture/')
  ));
  if (needsArchitecture) {
    commands.push('node ./scripts/architecture/check-dependencies.mjs');
  }

  return commands;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const dryRun = asBoolean(options['dry-run'], false);
  const scope = options.scope ?? 'broad';
  if (!['broad', 'product', 'docs', 'harness'].includes(scope)) throw new Error(`Unknown fast scope: ${scope}`);
  const changedFiles = detectChangedFiles();
  const commands = buildCommandSet(changedFiles, scope);

  console.log(`[verify-fast] running ${commands.length} command(s).`);
  for (const command of commands) {
    const execution = runCommand(command, dryRun);
    if (execution.status !== 0) {
      process.exit(execution.status);
    }
  }

  console.log('[verify-fast] passed.');
}

main().catch((error) => {
  console.error('[verify-fast] failed with an unexpected error.');
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
