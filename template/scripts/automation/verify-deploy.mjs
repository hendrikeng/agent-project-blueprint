#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const commands = [
  ['node', ['./scripts/automation/verify-full.mjs']],
  ['node', ['./scripts/automation/check-project-gates.mjs', '--profile', 'deploy', '--run']]
];

for (const [command, args] of commands) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: process.env
  });

  if (result.error) {
    console.error(`verify:deploy failed to start ${command}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log('verify:deploy passed.');
