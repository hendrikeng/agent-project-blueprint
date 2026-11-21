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
const isAncestor = (ancestor, sha) => spawnSync('git', ['merge-base', '--is-ancestor', ancestor, sha]).status === 0;
const refExists = (ref) => spawnSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).status === 0;

// The changed-file base: the integration or default branch of the remote that receives the push.
// Not the remote branch tip: an earlier push can have skipped the checks. Without one, lint-changed checks every tracked file.
export function lintBase(remote, exists = refExists) {
  return [`${remote}/dev`, `${remote}/HEAD`, `${remote}/main`].find((ref) => exists(ref)) ?? '';
}

// The blueprint branch model: changes reach dev and main only through pull requests.
export const protectedBranches = ['dev', 'main'];
export const featureBranch = (branch) => Boolean(branch) && !['HEAD', ...protectedBranches].includes(branch) && !branch.startsWith('release/');

// Git exports these variables to hooks, also for `git -c` settings. Tests that create their own repositories must not see them.
export const hookEnv = (env) => Object.fromEntries(Object.entries(env).filter(([key]) =>
  !/^GIT_(?:DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|PREFIX|QUARANTINE_PATH|CONFIG_PARAMETERS|CONFIG_COUNT|CONFIG_KEY_\d+|CONFIG_VALUE_\d+)$/.test(key)));

export const checks = [
  ['node', './scripts/automation/lint-changed.mjs'],
  ['node', './scripts/automation/check-project-gates.mjs', '--gate', 'typecheck', '--run']
];

// Git passes one `<local ref> <local sha> <remote ref> <remote sha>` line per pushed ref on stdin.
// A deletion has an all-zero local SHA. A new remote branch has an all-zero remote SHA.
// A branch line that does not parse throws: the protected-branch checks must not skip it.
export function pushedBranches(stdin) {
  const sha = (value) => /^[0-9a-f]{40,64}$/.test(value ?? '');
  const zero = (value) => /^0+$/.test(value);
  // The remote ref names the branch: the local side can be `HEAD` or a SHA.
  return stdin.split('\n').map((line) => line.trim().split(/\s+/))
    .filter(([, , ref]) => ref?.startsWith('refs/heads/'))
    .map(([, local, ref, remote]) => {
      if (!sha(local) || !sha(remote)) throw new Error(`cannot parse the pushed ref ${ref}`);
      return { branch: ref.slice('refs/heads/'.length), sha: local, remoteSha: remote, exists: !zero(remote), deleted: zero(local) };
    });
}

// Returns an error message, or '' when the push can continue.
export function protectedPushError({ branch, sha, remoteSha, exists, deleted }, allow, isAncestor) {
  if (!protectedBranches.includes(branch) || (!exists && !deleted)) return '';
  if (deleted) return `Deleting ${branch} is not allowed.`;
  if (!allow) return `Direct pushes to ${branch} are not allowed. Open a pull request.`;
  // The escape covers only a fast-forward: it never rewrites the remote history.
  return isAncestor(remoteSha, sha) ? '' : `ALLOW_PROTECTED_PUSH allows only a fast-forward of the fetched ${branch}.`;
}

// Returns true when the push can continue.
function check(push, head, logPath, remote) {
  const { branch, sha } = push;
  if (!featureBranch(branch)) return true;
  const started = Date.now();
  let result;
  if (process.env.VERIFY_PRE_PUSH === 'skip') result = 'skipped';
  // The checks read the working tree, so they prove only the checked-out commit without local changes.
  else if (sha !== head) result = 'skipped: not checked out';
  else if (git('status', '--porcelain', '--untracked-files=no')) result = 'skipped: uncommitted changes';
  else {
    const env = { ...hookEnv(process.env), LINT_CHANGED_TRACKED_ONLY: '1' };
    const base = lintBase(remote);
    if (base) env.VERIFY_LINT_BASE = base;
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
  const remote = process.argv[2] || 'origin';
  let pushed;
  try {
    pushed = pushedBranches(fs.readFileSync(0, 'utf8'));
  } catch (error) {
    console.error(`[pre-push] ${error.message}`);
    return false;
  }
  // The first push creates the branch. ALLOW_PROTECTED_PUSH=1 is the logged escape for a gated fast-forward.
  const allow = process.env.ALLOW_PROTECTED_PUSH === '1';
  const error = pushed.map((push) => protectedPushError(push, allow, isAncestor)).find(Boolean);
  if (error) {
    console.error(`[pre-push] ${error}`);
    return false;
  }
  let ok = true;
  for (const branch of pushed.filter(({ deleted }) => !deleted)) ok = check(branch, head, logPath, remote) && ok;
  if (!ok) {
    console.error('[pre-push] Fix the findings above and push again.');
    return false;
  }
  // Log only after every ref passed, because Git rejects the whole push otherwise.
  for (const push of pushed.filter(({ branch, exists }) => exists && protectedBranches.includes(branch))) {
    fs.appendFileSync(logPath, `${new Date().toISOString()}\t${push.sha}\t${push.branch}\tallowed: ALLOW_PROTECTED_PUSH\t0.0\n`);
  }
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main() ? 0 : 1);
}
