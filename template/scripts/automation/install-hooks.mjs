#!/usr/bin/env node
// Package `prepare` step: points Git at the versioned .githooks directory without disabling other hooks.
// It changes nothing if another hooks path is set, if .git/hooks has active hooks, or outside a repository root.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const git = (...args) => {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : '';
};

const top = git('rev-parse', '--show-toplevel');
const hooksDir = top && path.resolve(top, git('rev-parse', '--git-path', 'hooks'));
const hooksPath = git('config', 'core.hooksPath');
let reason = '';
// CI checkouts keep their Git hooks: a later bot push must not run or refuse through the local hook.
if (process.env.CI && !['false', '0'].includes(process.env.CI)) reason = 'CI';
// The hook runs ./scripts/automation/pre-push.mjs from the repository root, so the package must be that root.
else if (!top || fs.realpathSync(top) !== fs.realpathSync(process.cwd())) reason = 'the package is not at the repository root';
else if (!fs.existsSync(path.join(top, '.githooks'))) reason = 'no .githooks directory';
else if (hooksPath === '.githooks') reason = 'already installed';
else if (hooksPath) reason = `core.hooksPath is already ${hooksPath}`;
else if (fs.existsSync(hooksDir) && fs.readdirSync(hooksDir).some((name) => !name.endsWith('.sample'))) reason = `${hooksDir} has active hooks`;
if (reason === 'CI') console.log('[install-hooks] CI is set: the Git hooks stay unchanged.');
else if (reason === 'already installed') console.log('[install-hooks] core.hooksPath is already .githooks.');
else if (reason) console.log(`[install-hooks] kept the current Git hooks: ${reason}. Call scripts/automation/pre-push.mjs from your pre-push hook.`);
else {
  git('config', 'core.hooksPath', '.githooks');
  console.log('[install-hooks] core.hooksPath set to .githooks.');
}
