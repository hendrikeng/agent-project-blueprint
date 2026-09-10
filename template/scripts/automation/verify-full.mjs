#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const rootDir = process.cwd();

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

function runCommand(command, dryRun) {
  if (dryRun) {
    console.log(`[verify-full] dry-run: ${command}`);
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

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const dryRun = asBoolean(options['dry-run'], false);
  // CI may skip fast only after its prerequisite Fast Gate succeeds for this run.
  const skipFast = asBoolean(options['skip-fast'], false);
  const commands = [
    ...(skipFast ? [] : ['node ./scripts/automation/verify-fast.mjs']),
    'node ./scripts/check-article-conformance.mjs',
    'node ./scripts/architecture/check-dependencies.mjs',
    'node ./scripts/automation/check-project-gates.mjs --profile full --run'
  ];

  console.log(`[verify-full] running ${commands.length} command(s).`);
  for (const command of commands) {
    const execution = runCommand(command, dryRun);
    if (execution.status !== 0) {
      process.exit(execution.status);
    }
  }

  console.log('[verify-full] passed.');
}

main().catch((error) => {
  console.error('[verify-full] failed with an unexpected error.');
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
