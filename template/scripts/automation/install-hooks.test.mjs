import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { createScriptsRepo } from './test-helpers.mjs';

test('install-hooks sets the hooks path only when no other hooks are active', async (t) => {
  const root = await createScriptsRepo(t);
  // A global or system hooks path on the test machine must not change the result.
  const env = { ...process.env, CI: '', GIT_CONFIG_GLOBAL: path.join(root, 'no-global-config'), GIT_CONFIG_NOSYSTEM: '1' };
  const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8', env }).stdout.trim();
  const install = (cwd = root, extraEnv = {}) => spawnSync('node', [path.join(root, 'scripts/automation/install-hooks.mjs')], { cwd, encoding: 'utf8', env: { ...env, ...extraEnv } });
  git('init', '-q');
  await fs.rm(path.join(root, '.git/hooks'), { recursive: true, force: true });

  assert.equal(install().status, 0);
  assert.equal(git('config', 'core.hooksPath'), '', 'no .githooks directory');
  await fs.mkdir(path.join(root, '.githooks'));
  await fs.mkdir(path.join(root, '.git/hooks'));
  await fs.writeFile(path.join(root, '.git/hooks/pre-commit'), '#!/bin/sh\n');
  assert.equal(install().status, 0);
  assert.equal(git('config', 'core.hooksPath'), '', 'an active .git/hooks hook stays in use');
  await fs.rename(path.join(root, '.git/hooks/pre-commit'), path.join(root, '.git/hooks/pre-commit.sample'));
  git('config', 'core.hooksPath', '.husky');
  assert.equal(install().status, 0);
  assert.equal(git('config', 'core.hooksPath'), '.husky', 'an existing hooks path stays');
  git('config', '--unset', 'core.hooksPath');
  await fs.mkdir(path.join(root, 'apps'));
  assert.equal(install(path.join(root, 'apps')).status, 0);
  assert.equal(git('config', 'core.hooksPath'), '', 'a package below the repository root changes nothing');
  assert.equal(install(root, { CI: 'true' }).status, 0);
  assert.equal(git('config', 'core.hooksPath'), '', 'CI keeps its hooks, so a bot push does not run the local hook');
  assert.equal(install().status, 0);
  assert.equal(git('config', 'core.hooksPath'), '.githooks');
});
