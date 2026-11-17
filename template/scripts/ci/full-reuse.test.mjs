import test from 'node:test';
import assert from 'node:assert/strict';
import { gateFile, reusableFullRun } from './full-reuse.mjs';

const revision = 'a'.repeat(40);
const head = 'b'.repeat(40);
const tree = 'c'.repeat(40);
const repository = 'acme/app';

function lookup(overrides = {}) {
  const reasons = [];
  const runId = reusableFullRun({
    repository, revision, tree, gateDrift: [],
    pulls: [{ number: 7, merged_at: '2026-11-17T00:00:00Z', merge_commit_sha: revision, base: { ref: 'dev' }, head: { sha: head, repo: { full_name: repository } } }],
    filesOf: () => [{ filename: 'src/auth/session.ts', status: 'modified' }],
    runsOf: () => [{ id: 11, path: '.github/workflows/ci.yml', event: 'pull_request', conclusion: 'success', head_sha: head, head_repository: { full_name: repository } }],
    artifactsOf: () => [{ name: `full-tree-${tree}`, expired: false }],
    jobsOf: () => [{ name: 'Fast Gate', conclusion: 'success' }, { name: 'Full Gate', conclusion: 'success' }],
    reasons,
    ...overrides
  });
  return { runId, reasons };
}

test('a green PR Full run of the exact tree is reused', () => {
  assert.deepEqual(lookup(), { runId: 11, reasons: [] });
});

test('any doubt about the tree, the run, or the gates runs Full', () => {
  const pull = { number: 7, merged_at: 'x', merge_commit_sha: revision, base: { ref: 'dev' }, head: { sha: head, repo: { full_name: repository } } };
  const run = { id: 11, path: '.github/workflows/ci.yml', event: 'pull_request', conclusion: 'success', head_sha: head, head_repository: { full_name: repository } };
  for (const [name, overrides, reason] of [
    ['different tree', { artifactsOf: () => [{ name: `full-tree-${'d'.repeat(40)}`, expired: false }] }, /no current full-tree/],
    ['expired artifact', { artifactsOf: () => [{ name: `full-tree-${tree}`, expired: true }] }, /no current full-tree/],
    ['failed run', { runsOf: () => [{ ...run, conclusion: 'failure' }] }, /ended as failure/],
    ['other workflow', { runsOf: () => [{ ...run, path: '.github/workflows/other.yml' }] }, /ended as success/],
    ['failed Full Gate job', { jobsOf: () => [{ name: 'Fast Gate', conclusion: 'success' }, { name: 'Full Gate', conclusion: 'failure' }] }, /Full Gate did not succeed/],
    ['no CI run', { runsOf: () => [] }, /has no CI run/],
    ['no merged PR', { pulls: [{ ...pull, merged_at: null }] }, /no PR merged into dev/],
    ['PR into main', { pulls: [{ ...pull, base: { ref: 'main' } }] }, /no PR merged into dev/],
    ['fork PR', { pulls: [{ ...pull, head: { sha: head, repo: { full_name: 'fork/app' } } }] }, /another repository/],
    ['empty file list', { filesOf: () => [] }, /lists 0 files/],
    ['truncated file list', { filesOf: () => Array.from({ length: 3000 }, (_, i) => ({ filename: `src/auth/${i}.ts`, status: 'modified' })) }, /lists 3000 files/],
    ['docs-only PR', { filesOf: () => [{ filename: 'docs/product-specs/cards.md', status: 'modified' }] }, /docs scope/],
    ['product-only PR', { filesOf: () => [{ filename: 'src/card.ts', status: 'modified' }] }, /product scope/],
    ['PR changes a workflow', { filesOf: () => [{ filename: 'src/auth.ts', status: 'modified' }, { filename: '.github/workflows/ci.yml', status: 'modified' }] }, /changes gate files: \.github\/workflows\/ci\.yml/],
    ['PR renames a gate file', { filesOf: () => [{ filename: 'src/auth.ts', status: 'modified' }, { filename: 'tools/gates.json', previous_filename: 'docs/governance/project-gates.json', status: 'renamed' }] }, /changes gate files/],
    ['gates changed since the revision', { gateDrift: ['.github/workflows/ci-candidate.yml'] }, /gate files differ/]
  ]) {
    const result = lookup(overrides);
    assert.equal(result.runId, null, name);
    assert.match(result.reasons.join('\n'), reason, name);
  }
});

test('gate files cover workflows, CI scripts, package scripts, and gate definitions', () => {
  for (const file of ['.github/workflows/ci.yml', '.github/actions/setup/action.yml', 'scripts/ci/full-reuse.mjs', 'package.json', 'docs/governance/project-gates.json', 'scripts/automation/verify-full.mjs']) assert.equal(gateFile(file), true, file);
  for (const file of ['src/package.json.ts', 'docs/ci.md', 'scripts/automation/verify-deploy.mjs']) assert.equal(gateFile(file), false, file);
});
