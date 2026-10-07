#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { resolveSafeRepoPath, assertNoRepoSymlinks } from './lib/repo-paths.mjs';
import { parseMetadata, metadataValue, parseMustLandChecklist, ACTIVE_STATUSES, FUTURE_STATUSES } from './lib/plan-metadata.mjs';

const root = process.cwd();
const args = process.argv.slice(2);
const outputIndex = args.indexOf('--output');
const output = resolveSafeRepoPath(root, outputIndex < 0 ? 'docs/generated/AGENT-RUNTIME-CONTEXT.md' : args[outputIndex + 1], 'Context output path');
const statePath = 'docs/product-specs/CURRENT-STATE.md';
const digest = (content) => createHash('sha256').update(content).digest('hex');
const cell = (value) => String(value).replace(/[\r\n|`]/g, ' ').slice(0, 120);

async function assertContained(target) {
  await assertNoRepoSymlinks(root, target.rel);
}

async function read(relative) {
  const target = resolveSafeRepoPath(root, relative, 'Context input path');
  await assertContained(target);
  return fs.readFile(target.abs, 'utf8');
}

async function plans(directory, statuses) {
  const target = resolveSafeRepoPath(root, directory, 'Plan directory');
  await assertContained(target);
  return collectPlans(directory, statuses);
}

// Descendants come from readdir under checked roots; preserve their actual filenames.
async function collectPlans(directory, statuses) {
  const entries = await fs.readdir(path.join(root, directory), { withFileTypes: true });
  const result = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === 'evidence') continue;
    const relative = `${directory}/${entry.name}`;
    if (entry.isSymbolicLink()) throw new Error(`Context path contains a symlink: ${relative}`);
    if (entry.isDirectory()) {
      result.push(...await collectPlans(relative, statuses));
      continue;
    }
    if (entry.name === 'README.md' || !entry.name.endsWith('.md')) continue;
    if (!entry.isFile()) throw new Error(`Plan must be a regular file: ${directory}/${entry.name}`);
    const content = await fs.readFile(path.join(root, relative), 'utf8');
    const metadata = parseMetadata(content);
    const id = metadataValue(metadata, 'Plan-ID');
    const status = metadataValue(metadata, 'Status');
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || !statuses.has(status)) throw new Error(`Invalid unfinished plan metadata: ${relative}`);
    const checklist = parseMustLandChecklist(content);
    const remaining = checklist.filter(item => !item.checked).length;
    const awaitingValidation = relative.startsWith('docs/exec-plans/active/') && ['validation', 'in-review'].includes(status);
    if (!checklist.length || (!remaining && !awaitingValidation)) throw new Error(`Plan has no remaining checklist items; close or correct it: ${relative}`);
    result.push({ id, status, remaining, relative, content, priority: metadataValue(metadata, 'Priority'), dependencies: metadataValue(metadata, 'Dependencies'), approval: metadataValue(metadata, 'Security-Approval') });
  }
  return result.sort((a, b) => a.priority.localeCompare(b.priority) || a.id.localeCompare(b.id));
}

function renderPlans(items, directory) {
  if (!items.length) return `No unfinished plans in \`${directory}\`.`;
  const rows = items.slice(0, 8).map(p => `| \`${cell(p.id)}\` | ${cell(p.status)} | ${p.remaining} | ${cell(p.dependencies)} | ${cell(p.approval)} | \`${p.relative}\` |`);
  return ['| Plan | Status | Remaining | Dependencies | Approval | Read |', '| --- | --- | --- | --- | --- | --- |', ...rows,
    ...(items.length > 8 ? [`\n${items.length - 8} additional plans are omitted. Inspect \`${directory}\` before selecting work.`] : [])].join('\n');
}

async function main() {
  const [agents, state, active, future] = await Promise.all([
    read('AGENTS.md'), read(statePath), plans('docs/exec-plans/active', ACTIVE_STATUSES), plans('docs/future', FUTURE_STATUSES)
  ]);
  const owner = agents.match(/^Owner:\s+(.+)$/m)?.[1] ?? null;
  const updated = state.match(/^Last Updated:\s+(.+)$/m)?.[1] ?? null;
  if (!owner || !updated) throw new Error('Context sources need Owner and Last Updated metadata.');
  const date = state.match(/^Current State Date:\s+(.+)$/m)?.[1] ?? 'unknown';
  const inputHash = digest(JSON.stringify([agents, state, ...active.map(p => [p.relative, p.content]), ...future.map(p => [p.relative, p.content])]));
  const content = `# Project Context Index

Status: generated
Owner: ${owner}
Last Updated: ${updated}
Source of Truth: AGENTS.md, ${statePath}, and unfinished plan files.
Input SHA256: ${inputHash}

## Start Here

Read \`AGENTS.md\` and \`${statePath}\`, then the requested plan and nearest live code.
Snapshot verification date: ${date}. This is a human-maintained claim, not proof of live behavior.
Snapshot SHA256: ${digest(state)}
Do not load historical plans, raw logs, or every policy file by default.
This index describes recorded work. It does not authorize execution or prove that an undocumented feature exists.

## Active Work

${renderPlans(active, 'docs/exec-plans/active')}

## Proposed Work

${renderPlans(future, 'docs/future')}

A draft is plan-only. Read the complete plan, dependencies, approvals, and current user request before implementation.
Completed work is excluded. If a shipped feature remains in the queue, reconcile it against code and evidence before acting.

## Resume And Close

Use the active plan's single continuation section for decisions, approvals, changed paths, validation, blockers, and next action.
Replace obsolete product-state statements and remove resolved gaps. Move completed plans out of the active queue.
Regenerate with \`npm run context:compile\`. Verify without writes with \`npm run context:check\`.
`;
  await assertContained(output);
  if (args.includes('--check')) {
    if (await fs.readFile(output.abs, 'utf8') !== content) throw new Error('Generated context is stale. Run npm run context:compile after updating product state and plans.');
    console.log('[context:check] current.');
    return;
  }
  await fs.mkdir(path.dirname(output.abs), { recursive: true });
  await fs.writeFile(output.abs, content);
  console.log(`[context:compile] wrote ${output.rel} (${active.length} active, ${future.length} proposed plans).`);
}

main().catch(error => {
  console.error(`[context:compile] ${error.message}`);
  process.exitCode = 1;
});
