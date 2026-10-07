import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { resolveSafeRepoPath } from '../automation/lib/repo-paths.mjs';

export function evalInputPaths(config) {
  const fixturePaths = (config.requiredFailureFixtures ?? []).map((entry) => String(entry.path));
  if (config.additionalInputPaths !== undefined &&
      (!Array.isArray(config.additionalInputPaths) || config.additionalInputPaths.some((value) => typeof value !== 'string' || !value.trim()))) {
    throw new Error('additionalInputPaths must be an array of repository-relative file paths.');
  }
  return [...new Set([
    'AGENTS.md',
    'README.md',
    'docs/README.md',
    'docs/product-specs/CURRENT-STATE.md',
    'VISION.md',
    'docs/PLANS.md',
    'docs/governance/RULES.md',
    'docs/design-docs/GIT-SAFETY.md',
    'docs/design-docs/ENGINEERING-INVARIANTS.md',
    'docs/governance/policy-manifest.json',
    'docs/agent-hardening/evals.config.json',
    'docs/agent-hardening/README.md',
    'docs/agent-hardening/AGENT_LOOP.md',
    'docs/agent-hardening/MEMORY_CONTEXT.md',
    'docs/agent-hardening/OBSERVABILITY.md',
    'docs/agent-hardening/EVALS.md',
    'docs/agent-hardening/RUN_CONTROL.md',
    'docs/agent-hardening/TOOL_POLICY.md',
    ...fixturePaths,
    ...(config.additionalInputPaths ?? [])
  ])].sort();
}

export async function computeEvalInputSha256(rootDir, config) {
  const hash = crypto.createHash('sha256');
  for (const relative of evalInputPaths(config)) {
    const input = resolveSafeRepoPath(rootDir, relative, 'Eval input path');
    hash.update(`${relative}\0`);
    hash.update(await fs.readFile(input.abs));
    hash.update('\0');
  }
  return hash.digest('hex');
}
