#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { spawnHeavyShell } from './lib/agent-heavy.mjs';

const PLAN_ID_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CLOSEOUT_COMMAND = 'node ./scripts/automation/check-plan-closeout.mjs';
// Extra environment for one command. Set only by closeoutCommand().
const commandEnv = new Map();

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
    const extra = Object.entries(commandEnv.get(command) ?? {}).map(([key, value]) => `${key}=${value} `).join('');
    console.log(`[verify-fast] dry-run: ${extra}${command}`);
    return { status: 0 };
  }
  const options = { stdio: 'inherit', env: { ...process.env, ...commandEnv.get(command) } };
  // Project gates and lint take their own slots; only the harness suite is heavy at this level.
  const result = command === 'node --run harness:test'
    ? spawnHeavyShell(command, options)
    : spawnSync(command, { ...options, shell: true });
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

// Optional: validationPolicy.closeoutPredictionRef in docs/governance/policy-manifest.json, for example "origin/dev".
// Then a local run checks plan closeout against the merge base with that ref, as CI does for a PR into it.
// The same test as check-project-gates.mjs: in raw template mode, no project gate runs.
function templateMode() {
  try {
    const raw = readFileSync('AGENTS.md', 'utf8');
    const placeholder = (field) => /^\{\{[A-Z0-9_]+\}\}$/.test(raw.match(new RegExp(`^${field}:\\s+(.+)$`, 'm'))?.[1]?.trim() ?? '');
    return placeholder('Owner') && placeholder('Last Updated');
  } catch {
    return false;
  }
}

function validationPolicy() {
  try {
    return JSON.parse(readFileSync('docs/governance/policy-manifest.json', 'utf8')).validationPolicy ?? {};
  } catch {
    return {};
  }
}

function closeoutPredictionRef() {
  const ref = validationPolicy().closeoutPredictionRef;
  return typeof ref === 'string' ? ref.trim() : '';
}

// The branch part of the ref: strip refs/heads/, refs/remotes/<remote>/, or <remote>/ only when it is a
// remote-tracking ref. A local branch such as release/2026.11.01.1 keeps its full name.
function closeoutBranch(ref) {
  if (ref.startsWith('refs/remotes/')) return ref.split('/').slice(3).join('/');
  if (ref.startsWith('refs/heads/')) return ref.slice('refs/heads/'.length);
  const remoteTracking = spawnSync('git', ['show-ref', '--verify', '--quiet', `refs/remotes/${ref}`]).status === 0;
  return remoteTracking ? ref.slice(ref.indexOf('/') + 1) : ref;
}

function closeoutCommand() {
  // CI has its own verified event context. An explicit baseline wins.
  const ref = closeoutPredictionRef();
  if (!ref || process.env.GITHUB_ACTIONS === 'true' || process.env.PLAN_CLOSEOUT_BASE_REF) return CLOSEOUT_COMMAND;
  if (asBoolean(process.env.VERIFY_FAST_SKIP_CLOSEOUT, false)) {
    console.log('[verify-fast] VERIFY_FAST_SKIP_CLOSEOUT is set. Closeout runs in local iteration mode.');
    return CLOSEOUT_COMMAND;
  }
  const git = (...args) => spawnSync('git', args, { encoding: 'utf8' });
  const base = git('merge-base', 'HEAD', ref);
  if (base.status !== 0) {
    console.log(`[verify-fast] ${ref} is not available. Closeout runs in local iteration mode.`);
    return CLOSEOUT_COMMAND;
  }
  const baseSha = base.stdout.trim();
  if (baseSha === git('rev-parse', 'HEAD').stdout.trim()) {
    console.log(`[verify-fast] No commits ahead of ${ref}. Closeout runs in local iteration mode.`);
    return CLOSEOUT_COMMAND;
  }
  // The branch part of the ref, for example dev in origin/dev: the closeout check applies its protected-branch rules.
  commandEnv.set(CLOSEOUT_COMMAND, { PLAN_CLOSEOUT_BASE_REF: baseSha, PLAN_CLOSEOUT_BRANCH_NAME: closeoutBranch(ref) });
  return CLOSEOUT_COMMAND;
}

// Opt-in: with validationPolicy.ciLintGateCoversChangedFiles true, a CI run that also runs the required lint gate of the
// fast profile skips lint:changed. The project states that its lint gate checks every file, also the formatting.
// Locally, lint:changed stays, because it is the fast check.
function lintChangedCommand(scope) {
  const command = 'node ./scripts/automation/lint-changed.mjs';
  if (process.env.GITHUB_ACTIONS !== 'true' || !['broad', 'product'].includes(scope)) return [command];
  if (validationPolicy().ciLintGateCoversChangedFiles !== true || templateMode()) return [command];
  const inJobs = String(process.env.PROJECT_GATES_IN_JOBS ?? '').split(',').map((id) => id.trim());
  if (inJobs.includes('lint')) return [command];
  try {
    const gates = JSON.parse(readFileSync('docs/governance/project-gates.json', 'utf8')).gates ?? [];
    const lint = gates.find((gate) => gate.id === 'lint' && gate.profile === 'fast');
    // A placeholder command does not run (raw template mode), so it cannot replace lint:changed.
    if (lint?.status !== 'required' || !String(lint.command ?? '').trim() || /\{\{[A-Z0-9_]+\}\}/.test(lint.command)) return [command];
  } catch {
    return [command];
  }
  console.log('[verify-fast] lint:changed skipped in CI: ciLintGateCoversChangedFiles is set, and the required lint gate runs here.');
  return [];
}

function buildCommandSet(changedFiles, scope) {
  const commands = [
    'node ./scripts/automation/compile-runtime-context.mjs --check',
    ...lintChangedCommand(scope),
    'node ./scripts/automation/check-path-policy.mjs',
    'node ./scripts/docs/repair-plan-references.mjs --check',
    'node ./scripts/docs/check-governance.mjs',
    // node --run needs no package manager, so the harness works with pnpm, npm, yarn, and Bun.
    'node --run eval:integrity',
    ...(['broad', 'harness'].includes(scope) ? ['node --run harness:test'] : []),
    resolvedPlanMetadataCommand(),
    closeoutCommand(),
    'node ./scripts/automation/check-harness-alignment.mjs',
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
  // Only the pre-push hook sets PRE_PUSH_FAST. A leaked value must not drop type-aware lint rules here.
  delete process.env.PRE_PUSH_FAST;
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
      if (commandEnv.has(command)) {
        console.error(`[verify-fast] The closeout check failed against the merge base with ${closeoutPredictionRef()}. Read its error above.`);
        console.error('[verify-fast] If a plan is not closed out, close it in the same PR: move it to docs/exec-plans/completed/ with its evidence index.');
        console.error('[verify-fast] For mid-iteration work only, run again with VERIFY_FAST_SKIP_CLOSEOUT=1.');
      }
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
