import { spawnSync } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import path from 'node:path';

// Local agents share one machine. `agent-heavy` gives each heavy gate a slot in a machine-wide semaphore.
function shouldWrap() {
  if (process.env.CI || process.env.AGENT_HEAVY === '0') return false;
  return (process.env.PATH ?? '').split(path.delimiter).some((dir) => {
    try {
      accessSync(path.join(dir || '.', 'agent-heavy'), constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

export function spawnHeavy(file, args, options) {
  return shouldWrap()
    ? spawnSync('agent-heavy', ['--', file, ...args], options)
    : spawnSync(file, args, options);
}

export function spawnHeavyShell(command, options) {
  return shouldWrap()
    ? spawnSync('agent-heavy', ['--', 'sh', '-c', command], options)
    : spawnSync(command, { ...options, shell: true });
}
