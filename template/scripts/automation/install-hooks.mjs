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
let reason = '';
if (!top || !fs.existsSync(path.join(top, '.githooks'))) reason = 'no .githooks directory at the repository root';
else if (git('config', 'core.hooksPath')) reason = `core.hooksPath is already ${git('config', 'core.hooksPath')}`;
else if (fs.existsSync(hooksDir) && fs.readdirSync(hooksDir).some((name) => !name.endsWith('.sample'))) reason = `${hooksDir} has active hooks`;
if (reason) console.log(`[install-hooks] kept the current Git hooks: ${reason}. Call scripts/automation/pre-push.mjs from your pre-push hook.`);
else {
  git('config', 'core.hooksPath', '.githooks');
  console.log('[install-hooks] core.hooksPath set to .githooks.');
}
