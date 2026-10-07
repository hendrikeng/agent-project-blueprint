#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { inferPlanId, listMarkdownFiles, parseMetadata, parsePlanId, validatePlanRecord } from './lib/plan-metadata.mjs';

const rootDir = process.cwd();
function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      options[key] = true;
      continue;
    }
    options[key] = next;
    index += 1;
  }
  return options;
}

function normalizeScope(value) {
  const normalized = String(value ?? 'future-active').trim().toLowerCase();
  return normalized === 'all' ? 'all' : 'future-active';
}

function rel(filePath) {
  return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function shouldSkipPlanFile(filePath) {
  const relative = rel(filePath);
  if (relative.includes('/evidence/')) {
    return true;
  }
  return false;
}

async function loadPlans() {
  const directories = {
    future: path.join(rootDir, 'docs', 'future'),
    active: path.join(rootDir, 'docs', 'exec-plans', 'active'),
    completed: path.join(rootDir, 'docs', 'exec-plans', 'completed')
  };
  const plans = [];

  for (const [phase, directoryPath] of Object.entries(directories)) {
    const files = await listMarkdownFiles(directoryPath);
    for (const filePath of files) {
      if (path.basename(filePath) === 'README.md' || shouldSkipPlanFile(filePath)) {
        continue;
      }
      const content = await fs.readFile(filePath, 'utf8');
      plans.push({
        phase,
        filePath,
        rel: rel(filePath),
        content,
        metadata: parseMetadata(content),
        planId: inferPlanId(content, filePath)
      });
    }
  }

  return plans;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const filterPlanId = parsePlanId(options['plan-id'] ?? options.planId, null);
  const scope = normalizeScope(options.scope);
  const findings = [];
  const allLoadedPlans = await loadPlans();
  const plans = allLoadedPlans.filter((plan) => scope === 'all' || plan.phase !== 'completed');
  const seenPlanIds = new Set();
  const allPlanIds = new Set(allLoadedPlans.map((plan) => plan.planId).filter(Boolean));

  for (const plan of plans) {
    if (filterPlanId && plan.planId !== filterPlanId) {
      continue;
    }
    findings.push(...validatePlanRecord(plan, { knownPlanIds: allPlanIds, seenPlanIds }));
  }

  if (findings.length > 0) {
    console.error(`[plans:verify] failed with ${findings.length} issue(s).`);
    for (const finding of findings) {
      console.error(`- [${finding.code}] ${finding.message} (${finding.filePath})`);
    }
    process.exit(1);
  }

  console.log(`[plans:verify] ok (${filterPlanId ? `plan=${filterPlanId}` : `${plans.length} plan(s)`} scope=${scope}).`);
}

main().catch((error) => {
  console.error('[plans:verify] failed with an unexpected error.');
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
