#!/usr/bin/env node
// Observe mode: runs the scoped fast gate before a feature-branch push, logs the result, and never blocks.
// The log is local and untracked: <git dir>/verify-fast-pre-push.log, one tab-separated line per push.
// VERIFY_PRE_PUSH=skip skips the gate and logs the skip.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

// Returns the verify:fast scope, or null for branches that are not feature branches.
export function prePushScope(branch, entries, classifyChanges) {
  if (!branch || ['HEAD', 'dev', 'main'].includes(branch) || branch.startsWith('release/')) return null;
  const scope = classifyChanges(entries);
  return ['product', 'docs', 'harness'].includes(scope) ? scope : 'broad';
}

function changedEntries(base) {
  const fields = execFileSync('git', ['diff', '--name-status', '-z', '--no-renames', `${base}...HEAD`], { encoding: 'utf8' }).split('\0');
  const entries = [];
  for (let index = 0; index + 1 < fields.length; index += 2) entries.push({ status: fields[index], path: fields[index + 1] });
  return entries;
}

async function main() {
  const started = Date.now();
  let branch = '';
  let sha = '';
  let logPath = '';
  let scope = '';
  let result;
  try {
    branch = git('rev-parse', '--abbrev-ref', 'HEAD');
    sha = git('rev-parse', 'HEAD');
    logPath = path.resolve(git('rev-parse', '--git-dir'), 'verify-fast-pre-push.log');
    const { classifyChanges } = await import('../ci/classify-change.mjs');
    scope = prePushScope(branch, changedEntries(git('merge-base', 'HEAD', 'origin/dev')), classifyChanges);
    if (!scope) return;
    if (process.env.VERIFY_PRE_PUSH === 'skip') result = 'skipped';
    else {
      console.error(`[pre-push] observe mode: npm run verify:fast -- --scope ${scope} (never blocks the push)`);
      const run = spawnSync('npm', ['run', 'verify:fast', '--', '--scope', scope], { stdio: ['ignore', 'inherit', 'inherit'], shell: process.platform === 'win32' });
      result = run.status === 0 ? 'pass' : 'fail';
    }
  } catch (error) {
    result = `error: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`;
  }
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.error(`[pre-push] verify:fast ${result} in ${seconds} s`);
  if (logPath) fs.appendFileSync(logPath, `${new Date().toISOString()}\t${sha}\t${branch}\t${scope}\t${result}\t${seconds}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Observe mode always exits 0, also after an unexpected error.
  main().catch(() => {}).finally(() => process.exit(0));
}
