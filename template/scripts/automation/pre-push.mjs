#!/usr/bin/env node
// Blocks a feature-branch push when format, lint, or typecheck fails. Target: less than 9 seconds.
// It runs oxfmt and oxlint on the changed files (lint-changed.mjs) and the typecheck gate from project-gates.json.
// It never runs AI reviews. The log is local and untracked: <git dir>/pre-push.log, one tab-separated line per push.
// VERIFY_PRE_PUSH=skip skips the checks and logs the skip.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

export const featureBranch = (branch) => Boolean(branch) && !['HEAD', 'dev', 'main'].includes(branch) && !branch.startsWith('release/');

export const checks = [
  ['node', './scripts/automation/lint-changed.mjs'],
  ['node', './scripts/automation/check-project-gates.mjs', '--gate', 'typecheck', '--run']
];

// Git passes one `<local ref> <local sha> <remote ref> <remote sha>` line per pushed ref on stdin.
export function pushedBranches(stdin) {
  // The remote ref names the branch: the local side can be `HEAD` or a SHA.
  return stdin.split('\n').map((line) => line.trim().split(/\s+/))
    .filter(([, sha, ref]) => ref?.startsWith('refs/heads/') && /^[0-9a-f]{40,64}$/.test(sha ?? '') && !/^0+$/.test(sha))
    .map(([, sha, ref]) => ({ branch: ref.slice('refs/heads/'.length), sha }));
}

// Returns true when the push can continue.
function check({ branch, sha }, head, logPath) {
  if (!featureBranch(branch)) return true;
  const started = Date.now();
  let result;
  if (process.env.VERIFY_PRE_PUSH === 'skip') result = 'skipped';
  // The checks read the working tree, so they prove only the checked-out commit without local changes.
  else if (sha !== head) result = 'skipped: not checked out';
  else if (git('status', '--porcelain', '--untracked-files=no')) result = 'skipped: uncommitted changes';
  else {
    // Git exports GIT_DIR and similar variables to hooks. Tests that create their own repositories must not see them.
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_(?:DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|PREFIX|QUARANTINE_PATH)$/.test(key)));
    const failed = checks.find(([command, ...args]) => {
      console.error(`[pre-push] ${command} ${args.join(' ')}`);
      return spawnSync(command, args, { env, stdio: ['ignore', 'inherit', 'inherit'] }).status !== 0;
    });
    result = failed ? `fail: ${failed[1]}` : 'pass';
  }
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.error(`[pre-push] ${branch}: ${result} in ${seconds} s`);
  fs.appendFileSync(logPath, `${new Date().toISOString()}\t${sha}\t${branch}\t${result}\t${seconds}\n`);
  return !result.startsWith('fail');
}

function main() {
  const logPath = path.resolve(git('rev-parse', '--git-dir'), 'pre-push.log');
  const head = git('rev-parse', 'HEAD');
  let ok = true;
  for (const pushed of pushedBranches(fs.readFileSync(0, 'utf8'))) ok = check(pushed, head, logPath) && ok;
  if (!ok) console.error('[pre-push] Fix the findings above and push again.');
  return ok;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main() ? 0 : 1);
}
