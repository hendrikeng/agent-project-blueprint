import test from 'node:test';
import assert from 'node:assert/strict';
import { metadataValue, releaseSourceBoundary, isValidReleaseVersion } from './release-support-lib.mjs';
import { execFileSync } from 'node:child_process';
import { writeFile, mkdir, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import { createTemplateRepo, runNode } from './test-helpers.mjs';

test('release versions require a real date and positive sequence', () => {
  for (const value of ['2026.09.08.1', '2028.02.29.2']) assert.equal(isValidReleaseVersion(value), true);
  for (const value of ['2026.02.29.1', '2026.13.01.1', '2026.09.08.0', '2026.09.08.01', 'latest']) {
    assert.equal(isValidReleaseVersion(value), false);
  }
});

test('release boundaries prefer source tags and preserve explicit or legacy bases', () => {
  const hasRef = (ref) => ref === 'source-v2026.09.08.1';
  assert.equal(releaseSourceBoundary('v2026.09.08.1', hasRef), 'source-v2026.09.08.1');
  assert.equal(releaseSourceBoundary('v2026.09.07.1', hasRef), 'v2026.09.07.1');
  assert.equal(releaseSourceBoundary('origin/main', hasRef), 'origin/main');
  assert.equal(releaseSourceBoundary('', hasRef), '');
});

test('release analysis excludes already-promoted source commits after a squash', async (t) => {
  const rootDir = await createTemplateRepo(t);
  const git = (...args) => execFileSync('git', args, { cwd: rootDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const initial = git('rev-parse', 'HEAD');
  git('checkout', '-b', 'dev');
  await writeFile(path.join(rootDir, 'previous.md'), 'Previous release\n');
  git('add', 'previous.md');
  git('commit', '-m', 'docs: previous release\n\nPlan-ID: previous-release');
  const source = git('rev-parse', 'HEAD');
  git('tag', 'source-v2026.09.08.1', source);
  // A separate commit with the same tree models the landed squash boundary.
  const landed = git('commit-tree', `${source}^{tree}`, '-p', initial, '-m', 'Release 2026.09.08.1');
  git('tag', 'v2026.09.08.1', landed);
  git('update-ref', 'refs/remotes/origin/main', landed);
  await writeFile(path.join(rootDir, 'next.md'), 'Next release\n');
  git('add', 'next.md');
  git('commit', '-m', 'docs: next release');
  const head = git('rev-parse', 'HEAD');
  const result = runNode('--input-type=module', ['-e',
    'import {analyzeReleaseRange} from "./scripts/automation/release-support-lib.mjs"; console.log(JSON.stringify(analyzeReleaseRange(["--allow-any-branch"])));'
  ], rootDir, { RELEASE_BASE_REF: '', RELEASE_HEAD_REF: head, GITHUB_HEAD_REF: '' });
  assert.equal(result.status, 0, String(result.stderr));
  const report = JSON.parse(result.stdout);
  assert.equal(report.base, 'source-v2026.09.08.1');
  assert.deepEqual(report.files, ['next.md']);
  assert.deepEqual(report.commits.map((commit) => commit.hash), [head]);
  assert.deepEqual(report.findings, []);
  const queue = runNode('--input-type=module', ['-e',
    'import {analyzeReleaseRange} from "./scripts/automation/release-support-lib.mjs"; console.log(JSON.stringify(analyzeReleaseRange(["--base", "origin/main"])));'
  ], rootDir, { RELEASE_ALLOW_ANY_BRANCH: 'true', RELEASE_HEAD_REF: head, GITHUB_HEAD_REF: '' });
  assert.equal(queue.status, 0, String(queue.stderr));
  const queueReport = JSON.parse(queue.stdout);
  assert.equal(queueReport.base, 'origin/main');
  assert.deepEqual(queueReport.files, ['next.md']);
  assert.deepEqual(queueReport.commits.map(commit => commit.hash), [head]);
  assert.deepEqual(queueReport.findings, []);
  git('tag', '-d', 'source-v2026.09.08.1');
  const missingPair = runNode('--input-type=module', ['-e',
    'import {analyzeReleaseRange} from "./scripts/automation/release-support-lib.mjs"; console.log(JSON.stringify(analyzeReleaseRange(["--base", "origin/main"])));'
  ], rootDir, { RELEASE_ALLOW_ANY_BRANCH: 'true', RELEASE_HEAD_REF: head, GITHUB_HEAD_REF: '' });
  const missingReport = JSON.parse(missingPair.stdout);
  assert.ok(missingReport.commits.some(commit => commit.hash === source));
  assert.match(missingReport.findings.join('\n'), /previous-release.*no completed plan/);
});

test('a plan-free release accepts mapped small fixes while unmapped code still blocks', async (t) => {
  const rootDir = await createTemplateRepo(t);
  const git = (...args) => execFileSync('git', args, { cwd: rootDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const base = git('rev-parse', 'HEAD');
  await mkdir(path.join(rootDir, 'src'), { recursive: true });
  await writeFile(path.join(rootDir, 'src/view.js'), 'export const label = "Updated";\n');
  git('add', 'src/view.js');
  git('commit', '-m', 'fix: update label');
  const hash = git('rev-parse', 'HEAD');
  const analyze = () => {
    const result = runNode('--input-type=module', ['-e',
      'import {analyzeReleaseRange} from "./scripts/automation/release-support-lib.mjs"; console.log(JSON.stringify(analyzeReleaseRange(["--allow-any-branch"])));'
    ], rootDir, { RELEASE_BASE_REF: base, RELEASE_HEAD_REF: 'HEAD', GITHUB_HEAD_REF: '' });
    assert.equal(result.status, 0, String(result.stderr));
    return JSON.parse(result.stdout);
  };
  assert.match(analyze().findings.join('\n'), /no Plan-ID mapping/);
  await writeFile(path.join(rootDir, 'docs/ops/releases/release-mapping.md'), `# Mapping\n- Commit: \`${hash}\` | Type: \`standard-change\` | Rationale: Isolated label fix needs no slice plan.\n`);
  git('add', 'docs/ops/releases/release-mapping.md');
  git('commit', '-m', 'docs: map small fix');
  assert.deepEqual(analyze().findings, []);
  assert.equal(analyze().mappedStandardChanges.length, 1);
  await writeFile(path.join(rootDir, 'src/other.js'), 'export const other = true;\n');
  git('add', 'src/other.js');
  git('commit', '-m', 'unmapped implementation');
  assert.match(analyze().findings.join('\n'), /no Plan-ID mapping/);
});

test('release metadata parser accepts canonical bullet metadata', () => {
  const content = `## Metadata

- Plan-ID: blueprint-harness-alignment
- Done-Evidence: \`docs/exec-plans/evidence-index/blueprint-harness-alignment.md\`
`;
  assert.equal(metadataValue(content, 'Plan-ID'), 'blueprint-harness-alignment');
  assert.equal(
    metadataValue(content, 'Done-Evidence'),
    'docs/exec-plans/evidence-index/blueprint-harness-alignment.md'
  );
});

test('release validates changed delivery contracts and evidence at the selected Git head', async (t) => {
  const rootDir = await createTemplateRepo(t);
  const git = (...args) => execFileSync('git', args, { cwd: rootDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const write = async (file, content) => {
    await mkdir(path.dirname(path.join(rootDir, file)), { recursive: true });
    await writeFile(path.join(rootDir, file), content);
  };
  const plan = 'docs/exec-plans/completed/topic/recovery.md';
  const evidence = 'docs/exec-plans/evidence-index/recovery.md';
  const originalEvidence = '# Existing receipt\n';
  await write(evidence, originalEvidence);
  await write('docs/exec-plans/completed/history/2026-03-16-shipped-foundation.md', 'Status: completed\n## Closure\nShipped foundation.\n## Validation Evidence\nHistorical check passed.\n');
  git('add', evidence, 'docs/exec-plans/completed/history');
  git('commit', '-m', 'docs: historical receipt');
  const base = git('rev-parse', 'HEAD');
  const valid = `# Recovery
## Metadata
- Plan-ID: recovery
- Status: completed
- Priority: p1
- Owner: Platform
- Acceptance-Criteria: Recovery works.
- Delivery-Class: product
- Dependencies: shipped-foundation
- Spec-Targets: docs/spec.md
- Implementation-Targets: src/recovery.js
- Risk-Tier: medium
- Validation-Lanes: always
- Security-Approval: not-required
- Done-Evidence: ${evidence}
## Already-True Baseline
Existing operation.
## Must-Land Checklist
- [x] \`ml-recovery\` Recover the operation.
## Deferred Follow-Ons
None.
## Closure
Acceptance complete.
## Validation Evidence
Recovery regression passed.
`;
  await write('src/recovery.js', 'export const recovery = true;\n');
  await write('docs/exec-plans/active/topic/evidence/receipt.md', 'Plan-ID: recovery\nHistorical receipt.\n');
  await write('docs/exec-plans/completed/topic/evidence/receipt.md', 'Plan-ID: recovery\nHistorical receipt.\n');
  const analyze = () => {
    const result = runNode('--input-type=module', ['-e',
      'import {analyzeReleaseRange} from "./scripts/automation/release-support-lib.mjs"; console.log(JSON.stringify(analyzeReleaseRange(["--allow-any-branch"])));'
    ], rootDir, { RELEASE_BASE_REF: base, RELEASE_HEAD_REF: 'HEAD', GITHUB_HEAD_REF: '' });
    assert.equal(result.status, 0, String(result.stderr));
    return JSON.parse(result.stdout);
  };
  for (const [name, content, receipt, expected] of [
    ['missing owner', valid.replace('- Owner: Platform\n', ''), '# Current receipt\n', /MISSING_METADATA_FIELD.*Owner/],
    ['empty closure', valid.replace('Acceptance complete.\n', ''), '# Current receipt\n', /MISSING_COMPLETION_SECTION.*Closure/],
    ['invalid lane', valid.replace('Validation-Lanes: always', 'Validation-Lanes: always, imaginary'), '# Current receipt\n', /INVALID_VALIDATION_LANE/],
    ['pending approval', valid.replace('Security-Approval: not-required', 'Security-Approval: pending'), '# Current receipt\n', /UNRESOLVED_SECURITY_APPROVAL/],
    ['unchanged evidence', valid, originalEvidence, /nonempty changed regular Done-Evidence/],
    ['empty evidence', valid, ' \n', /nonempty changed regular Done-Evidence/],
    ['valid', valid, '# Current receipt\n\n## Evidence Summary\n\n- Recovery check passed.\n- Interruption recovery verified.\n\n## Residual Risks\n\n- External service remains unavailable.\n', null]
  ]) {
    await write(plan, content);
    await write(evidence, receipt);
    git('add', '.');
    git('commit', '-m', `fixture: ${name}\n\nPlan-ID: recovery`);
    const report = analyze();
    if (expected) assert.match(report.findings.join('\n'), expected, name);
    else {
      assert.deepEqual(report.findings, []);
      assert.equal(report.plans.length, 1);
      assert.deepEqual(report.plans[0].evidenceBullets, ['Recovery check passed.', 'Interruption recovery verified.']);
      await write(plan, valid.replace('- Owner: Platform\n', ''));
      await write(evidence, '');
      assert.deepEqual(analyze().findings, [], 'Selected Git head must ignore uncommitted corruption.');
      await write(plan, valid);
    }
  }
  await rm(path.join(rootDir, evidence));
  await symlink('../../product-specs/CURRENT-STATE.md', path.join(rootDir, evidence));
  git('add', evidence);
  git('commit', '-m', 'fixture: symlink receipt\n\nPlan-ID: recovery');
  assert.match(analyze().findings.join('\n'), /nonempty changed regular Done-Evidence/);
});

test('release metadata parser remains compatible with unbulleted metadata', () => {
  assert.equal(metadataValue('Plan-ID: legacy-plan\n', 'Plan-ID'), 'legacy-plan');
});
