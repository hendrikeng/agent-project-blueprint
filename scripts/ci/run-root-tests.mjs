#!/usr/bin/env node
import { globSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// Root owns distribution/bootstrap tests; configured harness tests belong to smoke.
const testFiles = globSync(['scripts/**/*.test.mjs', 'template/scripts/*.test.mjs']).sort();
const result = spawnSync('node', ['--test', ...testFiles], {
  cwd: process.cwd(),
  stdio: 'inherit'
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
