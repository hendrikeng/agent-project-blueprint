import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { resolveCloseoutBase, resolveCloseoutBranch, isLocalFeatureIteration, summarizePlanCloseoutDiff, changedFilesFromNameStatus } from './plan-closeout-lib.mjs';

const scripts = path.dirname(fileURLToPath(import.meta.url));

test('durable closeout resolves real merge, successor and CI baselines without receipts', () => {
  assert.equal(isLocalFeatureIteration('slice/work', {}, []), true);
  for (const branch of ['dev', 'main', '']) assert.equal(isLocalFeatureIteration(branch, {}, []), false);
  assert.equal(isLocalFeatureIteration('slice/work', { GITHUB_ACTIONS: 'true' }, []), false);
  assert.equal(isLocalFeatureIteration('slice/work', { PLAN_CLOSEOUT_BASE_REF: 'base' }, []), false);
  assert.equal(isLocalFeatureIteration('slice/work', {}, ['merge']), false);
  for (const branchName of ['fix/copy', 'dev', 'main']) {
    assert.equal(summarizePlanCloseoutDiff(['src/view.ts'], { branchName }).requiresPlanCloseout, false);
    assert.equal(summarizePlanCloseoutDiff(['src/auth/session.ts'], { branchName }).requiresPlanCloseout, true);
  }
  const renamed = changedFilesFromNameStatus('R100\0src/auth/session.ts\0src/session.ts\0');
  assert.deepEqual(renamed, ['src/auth/session.ts', 'src/session.ts']);
  assert.equal(summarizePlanCloseoutDiff(renamed, { branchName: 'dev' }).requiresPlanCloseout, true);
  for (const file of ['scripts/agent-hardening/check-evals.mjs', 'docs/agent-hardening/EVALS.md', 'package.json']) {
    assert.equal(summarizePlanCloseoutDiff([file], { branchName: 'dev' }).requiresPlanCloseout, true);
  }
  const context = { head: 'b'.repeat(40), parents: ['a'.repeat(40)], mergeHeads: [] };
  const queue = 'gh-readonly-queue/main/pr-12';
  const queueEnv = { GITHUB_ACTIONS: 'true', GITHUB_SHA: context.head, GITHUB_EVENT_NAME: 'merge_group', GITHUB_REF: `refs/heads/${queue}` };
  const queueEvent = { merge_group: { head_sha: context.head, head_ref: queueEnv.GITHUB_REF, base_ref: 'refs/heads/main', base_sha: context.parents[0] } };
  assert.equal(resolveCloseoutBranch(queue, context.head, queueEnv, queueEvent), 'main');
  assert.equal(resolveCloseoutBranch('', context.head, queueEnv, queueEvent), 'main');
  assert.throws(() => resolveCloseoutBranch('wrong-queue', context.head, queueEnv, queueEvent), /Detached closeout/);
  assert.equal(resolveCloseoutBase({ ...context, eventName: 'merge_group', event: queueEvent }), context.parents[0]);
  assert.equal(resolveCloseoutBase(context), context.parents[0]);
  assert.equal(resolveCloseoutBase({ ...context, mergeHeads: ['c'.repeat(40)] }), context.head);
  assert.equal(resolveCloseoutBase({ ...context, eventName: 'push', event: { before: 'd'.repeat(40) } }), 'd'.repeat(40));
  assert.equal(resolveCloseoutBase({ ...context, eventName: 'pull_request', event: { pull_request: { base: { sha: 'e'.repeat(40) } } } }), 'e'.repeat(40));
  assert.throws(() => resolveCloseoutBase({ ...context, parents: [] }), /Missing closeout baseline/);
  assert.throws(() => resolveCloseoutBase({ ...context, eventName: 'push', event: { before: '0'.repeat(40) } }), /Missing closeout baseline/);
  assert.throws(() => resolveCloseoutBase({ ...context, mergeHeads: ['c'.repeat(40), 'd'.repeat(40)] }), /Ambiguous/);
});

test('Git closeout preserves inherited work across commits and validates both staged and working closure', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'durable-closeout-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const env = { ...process.env, GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.test', GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.test' };
  for (const key of Object.keys(env)) if (key.startsWith('GITHUB_') || key.startsWith('PLAN_CLOSEOUT_')) delete env[key];
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: root, env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const write = async (file, content) => {
    await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await fs.writeFile(path.join(root, file), content);
  };
  await fs.cp(scripts, path.join(root, 'scripts/automation'), { recursive: true });
  const active = 'docs/exec-plans/active/topic/unrelated\tü.md';
  const completed = 'docs/exec-plans/completed/topic/unrelated.md';
  const evidence = 'docs/exec-plans/evidence-index/unrelated.md';
  const fullContent = '# Fixture\n\n## Metadata\n\n- Plan-ID: unrelated\n- Status: active\n- Priority: p1\n- Owner: Platform\n- Acceptance-Criteria: Session boundary holds.\n- Delivery-Class: product\n- Dependencies: none\n- Spec-Targets: docs/spec.md\n- Implementation-Targets: src/auth/session.ts\n- Risk-Tier: high\n- Validation-Lanes: always\n- Security-Approval: not-required\n- Done-Evidence: '+evidence+'\n\n## Already-True Baseline\nExisting session boundary.\n\n## Must-Land Checklist\n\n- [x] `ml-fixture` Fixture proof.\n\n## Deferred Follow-Ons\nNone.\n\n## Closure\nAcceptance complete.\n\n## Validation Evidence\nSession boundary check passed.\n';
  const content = '# Fixture\n\n## Metadata\n\n- Plan-ID: unrelated\n- Status: active\n- Security-Approval: not-required\n- Done-Evidence: '+evidence+'\n\n## Must-Land Checklist\n\n- [x] `ml-fixture` Fixture proof.\n';
  await write('docs/exec-plans/completed/history/2026-03-16-shipped-foundation.md', 'Status: completed\n## Closure\nShipped foundation.\n## Validation Evidence\nHistorical check passed.\n');
  await write(active, content);
  await write('src/auth/session.ts', 'export const sensitive = true;\n');
  // Historical receipts are retained as data, never interpreted as current authority.
  await write('docs/ops/automation/plan-closeout-baseline.json', '{"historical":true}\n');
  git('init', '-b', 'dev');
  git('add', 'scripts', 'docs', 'src');
  git('commit', '-m', 'fixture baseline');
  const initialCommit = git('rev-parse', 'HEAD');
  await write('docs/future/first.md', '# First fixture\n');
  git('add', 'docs/future/first.md');
  git('commit', '-m', 'first successor');
  const check = (extraEnv = {}) => spawnSync(process.execPath, ['scripts/automation/check-plan-closeout.mjs'], { cwd: root, env: { ...env, ...extraEnv }, encoding: 'utf8' });
  const pass = (extraEnv = {}) => { const result = check(extraEnv); assert.equal(result.status, 0, result.stderr); };
  const pushContext = async (before) => {
    const head = git('rev-parse', 'HEAD');
    const eventPath = path.join(root, '.git', 'push-event.json');
    await fs.writeFile(eventPath, JSON.stringify({ before, after: head, ref: 'refs/heads/dev' }));
    return { GITHUB_ACTIONS: 'true', GITHUB_SHA: head, GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/dev', GITHUB_EVENT_PATH: eventPath };
  };
  const fail = (pattern, extraEnv) => { const result = check(extraEnv); assert.equal(result.status, 1, result.stdout); assert.match(result.stderr, pattern); };
  pass();
  await write('docs/future/second.md', '# Second fixture\n');
  git('add', 'docs/future/second.md');
  git('commit', '-m', 'second successor');
  pass();
  const ci = await pushContext(initialCommit);
  pass(ci);
  fail(/conflicts with the verified CI event/, { ...ci, PLAN_CLOSEOUT_BASE_REF: 'HEAD^' });
  fail(/Detached closeout/, { ...ci, GITHUB_SHA: '0'.repeat(40) });
  fail(/pre-change ancestor/, { PLAN_CLOSEOUT_BASE_REF: 'HEAD' });
  fail(/failed|unknown|ambiguous|revision/i, { PLAN_CLOSEOUT_BASE_REF: 'missing-ref' });
  await write(active, content + '\nChanged work.\n');
  fail(/new or changed active/);
  git('add', active);
  await write(active, content);
  fail(/new or changed active/);
  git('add', active);
  await write('docs/exec-plans/active/new.md', content.replace('unrelated', 'new'));
  fail(/new or changed active/);
  await fs.rm(path.join(root, 'docs/exec-plans/active/new.md'));
  await fs.rm(path.join(root, active));
  git('add', active);
  fail(/matching completed Plan-ID/);
  const closedContent = fullContent.replace('Status: active', 'Status: completed').replace('Dependencies: none', 'Dependencies: shipped-foundation');
  await write(completed, closedContent);
  await write(evidence, '# Fixture evidence\n');
  git('add', completed, evidence);
  pass();
  for (const [remove, expected] of [
    ['- Owner: Platform\n', /MISSING_METADATA_FIELD.*Owner/],
    ['- Acceptance-Criteria: Session boundary holds.\n', /MISSING_METADATA_FIELD.*Acceptance-Criteria/],
    ['- Implementation-Targets: src/auth/session.ts\n', /MISSING_IMPLEMENTATION_TARGETS/],
    ['- Validation-Lanes: always\n', /MISSING_VALIDATION_LANES/],
    ['## Closure\nAcceptance complete.\n\n', /MISSING_COMPLETION_SECTION.*Closure/],
    ['## Validation Evidence\nSession boundary check passed.\n', /MISSING_COMPLETION_SECTION.*Validation Evidence/]
  ]) {
    const incomplete = closedContent.replace(remove, '');
    await write(completed, incomplete);
    git('add', completed);
    await write(completed, closedContent);
    fail(expected);
    git('add', completed);
    await write(completed, incomplete);
    fail(expected);
    await write(completed, closedContent);
  }
  await write(completed, closedContent.replace('Dependencies: shipped-foundation', 'Dependencies: missing-foundation'));
  fail(/UNKNOWN_DEPENDENCY/);
  await write(completed, closedContent);
  await write(completed, closedContent.replace('[x]', '[ ]'));
  git('add', completed);
  await write(completed, closedContent);
  fail(/checked.*must-land/i);
  git('add', completed);
  for (const approval of ['', 'pending', 'unknown']) {
    await write(completed, closedContent.replace('Security-Approval: not-required', `Security-Approval: ${approval}`));
    git('add', completed);
    await write(completed, closedContent);
    fail(/resolved required approval|Status: completed/);
  }
  await write(completed, closedContent.replace('- Security-Approval: not-required\n', ''));
  git('add', completed);
  await write(completed, closedContent);
  fail(/resolved required approval|Status: completed/);
  git('add', completed);
  await write(evidence, '');
  git('add', evidence);
  await write(evidence, '# Fixture evidence\n');
  fail(/empty.*Done-Evidence/);
  git('add', evidence);
  pass();
  git('commit', '-m', 'truthful plan closure');
  pass();
  const renamedPlan = 'docs/exec-plans/completed/renamed.md';
  await fs.rename(path.join(root, completed), path.join(root, renamedPlan));
  await write(evidence, '# Fixture evidence after plan rename\n');
  git('add', completed, renamedPlan, evidence);
  pass();
  git('commit', '-m', 'rename completed plan with evidence');
  pass();
  await write('docs/future/third.md', '# Third fixture\n');
  git('add', 'docs/future/third.md');
  git('commit', '-m', 'post-closure successor');
  pass();
  const beforeFix = git('rev-parse', 'HEAD');
  await write('src/view.ts', 'export const label = "updated";\n');
  git('add', 'src/view.ts');
  git('commit', '-m', 'low-risk fix delivery');
  pass();
  pass(await pushContext(beforeFix));
  const beforePush = git('rev-parse', 'HEAD');
  await fs.rename(path.join(root, 'src/auth/session.ts'), path.join(root, 'src/session.ts'));
  git('add', 'src');
  fail(/require completed plan closeout/);
  await write(active, content);
  git('add', active);
  git('commit', '-m', 'fixture unfinished work in earlier pushed commit');
  await write('docs/future/fourth.md', '# Fourth fixture\n');
  git('add', 'docs/future/fourth.md');
  git('commit', '-m', 'fixture final pushed commit');
  fail(/new or changed active/, await pushContext(beforePush));
});
