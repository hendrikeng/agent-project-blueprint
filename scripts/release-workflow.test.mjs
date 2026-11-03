import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { classifyChanges } from '../template/scripts/ci/classify-change.mjs';

const workflow = (name) => readFileSync(new URL(`../template/.github/workflows/${name}.yml`, import.meta.url), 'utf8');

test('starter workflows pin external actions and avoid implicit package-manager caching', () => {
  const root = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  for (const [index, raw] of [root, workflow('ci'), workflow('ci-candidate'), workflow('release-tag')].entries()) {
    const content = raw.replace(/^[ \t]*#[^\r\n]*(?:\r?\n|$)/gm, '');
    const actions = content.split(/^[ \t]+-[ \t]+(?=[\w-]+:)/m)
      .map(block => [block.match(/^[ \t]*uses:[ \t]+([^\r\n]+)/m)?.[1].trim(), block])
      .filter(([reference]) => reference);
    assert.ok(actions.length > 0);
    for (const [reference, block] of actions) {
      assert.match(reference, /^actions\/[a-z-]+@[a-f0-9]{40}(?:\s+#.*)?$/);
      const options = block.match(/^([ \t]+)with:[ \t]*\r?\n((?:\1[ \t]+[^\r\n]*(?:\r?\n|$)|\r?\n)*)/m)?.[2] ?? '';
      if (reference.startsWith('actions/setup-node@')) assert.match(options, /^[ \t]+package-manager-cache:[ \t]+false[ \t]*(?:#.*)?$/m);
      if (index < 2 && reference.startsWith('actions/checkout@')) assert.match(options, /^[ \t]+persist-credentials:[ \t]+false[ \t]*(?:#.*)?$/m);
    }
    if (index < 2) {
      const permissions = content.match(/^permissions:[ \t]*\r?\n((?:[ \t]+[^\r\n]*(?:\r?\n|$)|\r?\n)*)/m)?.[1];
      assert.ok(permissions);
      assert.deepEqual(permissions.trim().split(/\r?\n/).map(line => line.replace(/[ \t]+#.*$/, '').trim()).filter(Boolean), ['contents: read']);
      assert.doesNotMatch(content, /^[ \t]+permissions:/m);
    }
  }
});

test('default CI retains required aggregates, contract, and release coverage', () => {
  const ci = workflow('ci');
  const root = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  // Trigger declarations are the scheduler contract; job conditions cannot disable push runs.
  for (const content of [root, ci]) {
    const events = content.split(/^on:\s*\n/m)[1].split(/^\S/m)[0];
    assert.deepEqual([...events.matchAll(/^  ([a-z_]+):/gm)].map(match => match[1]), ['pull_request', 'merge_group']);
    assert.match(events, /merge_group:\n(?:    branches: \[main\]\n)?    types: \[checks_requested\]/);
  }
  assert.match(ci, /pull_request:\s+branches: \[dev, main\]\s+types: \[opened, synchronize, reopened, edited, ready_for_review, labeled\]/);
  assert.match(ci, /merge_group:\s+branches: \[main\]/);
  assert.doesNotMatch(ci, /slice\/\*\*|fix\/\*\*/);
  assert.match(ci, /cancel-in-progress: true/);
  assert.match(ci, /github.event.label.name != 'ci:full'\)\) && 'metadata' \|\| 'code'/);
  for (const name of ['Fast Gate', 'Full Gate', 'Release Candidate Gate']) {
    assert.ok(ci.includes(`|| '${name}'`), `Metadata must not replace ${name}`);
  }
  assert.match(ci, /name: PR Contract/);
  assert.match(ci, /needs: \[scope, fast-gate, release-candidate-gate\]\s+if: >-\s+always\(\)/);
  for (const result of ['SCOPE_RESULT', 'FAST_RESULT', 'RELEASE_RESULT']) assert.ok(ci.includes(`test "$${result}" = success`));
  assert.match(ci, /npm run verify:full -- --skip-fast\s+id: full\s+if: \(needs.scope.outputs.scope == 'full'/);
  assert.match(ci, /RELEASE_HEAD_REF: \$\{\{ github.event.pull_request.head.sha \}\}/);
  assert.equal((ci.match(/run: npm run project:gates:release/g) ?? []).length, 2);
  assert.match(ci, /RELEASE_BASE_REF: origin\/main\s+RELEASE_ALLOW_ANY_BRANCH: "true"/);
  assert.doesNotMatch(ci, /staging|preview|environment:|railway|wrangler/i);
});

test('PR metadata skips gate runners without replacing or canceling real validation', () => {
  const ci = workflow('ci');
  // GitHub expressions return null for missing properties; optional chaining matches that.
  const startsWith = (value, prefix) => String(value ?? '').startsWith(prefix);
  const evaluate = (expression, github) => new Function('github', 'always', 'startsWith', `return (${expression.replace(/\.(?=[a-z_])/g, '?.')})`)(github, () => true, startsWith);
  const group = (github) => ci.match(/^  group: (.+)$/m)[1]
    .replace(/\$\{\{ (.+?) \}\}/g, (_, expression) => evaluate(expression, github));
  const jobs = ['fast-gate', 'full-gate', 'release-candidate-gate'].map((id) => {
    const block = ci.split(`  ${id}:\n`)[1].split(/\n  [\w-]+:\n/)[0];
    const condition = block.match(/^    if: >-\n((?:      [^\n]+\n)+)/m)?.[1].trim() ?? block.match(/^    if: (.+)$/m)[1];
    return { id, condition, name: block.match(/^    name: \$\{\{ (.+) \}\}$/m)[1] };
  });
  const requiredNames = ['Fast Gate', 'Full Gate', 'Release Candidate Gate'];
  const scopeCondition = ci.split('  scope:\n')[1].match(/^    if: \$\{\{ (.+) \}\}$/m)[1];
  for (const base of ['dev', 'main']) {
    const pr = { number: 7, user: { type: 'User' }, head: { ref: 'slice/x', repo: { full_name: 'o/r' } } };
    const real = { event_name: 'pull_request', workflow: 'ci', ref: 'refs/pull/7/merge', repository: 'o/r',
      event: { action: 'synchronize', changes: {}, pull_request: pr }, base_ref: base };
    for (const [action, changes, metadata, label, draft = false, override = {}] of [
      ['edited', { title: { from: 'old title' } }, true],
      ['edited', { body: { from: 'old body' } }, true],
      ['edited', {}, true],
      ['edited', { base: { ref: { from: 'other' } } }, false],
      ['edited', { base: {}, body: { from: 'old body' } }, false],
      // pr-draft.yml converts human same-repo PRs; bots, release branches, and forks run CI on open.
      ['opened', {}, true], ['reopened', {}, true], ['synchronize', {}, false],
      ['opened', {}, false, undefined, false, { user: { type: 'Bot' } }],
      ['opened', {}, false, undefined, false, { head: { ref: 'release/2026.01.01.1', repo: { full_name: 'o/r' } } }],
      ['reopened', {}, false, undefined, false, { head: { ref: 'slice/x', repo: { full_name: 'fork/r' } } }],
      ['ready_for_review', {}, false],
      ['labeled', {}, true, { name: 'bug' }], ['labeled', {}, false, { name: 'ci:full' }],
      ['synchronize', {}, true, undefined, true], ['labeled', {}, true, { name: 'ci:full' }, true]
    ]) {
      const github = { ...real, event: { ...real.event, action, changes, label, pull_request: { ...pr, draft, ...override } } };
      const caseName = `${base}: ${action} ${JSON.stringify({ changes, label, draft, override })}`;
      const skipped = draft || (['opened', 'reopened'].includes(action) && !Object.keys(override).length);
      assert.equal(evaluate(scopeCondition, github), !skipped, `${caseName}: PR Contract scheduling`);
      assert.equal(group(github) === group(real), !metadata, `${caseName}: cancellation group`);
      for (const { id, condition, name } of jobs) {
        assert.equal(evaluate(condition, github), !metadata && (id !== 'release-candidate-gate' || base === 'main'), `${caseName}: ${id} scheduling`);
        const checkName = evaluate(name, github);
        if (metadata) assert.ok(!requiredNames.includes(checkName), `${caseName}: skipped job must not replace required evidence`);
        else assert.equal(checkName, requiredNames[['fast-gate', 'full-gate', 'release-candidate-gate'].indexOf(id)]);
      }
    }
  }
  const queued = { event_name: 'merge_group', workflow: 'ci', ref: 'refs/heads/main', event: { changes: {} } };
  for (const { condition, name } of jobs) {
    assert.equal(evaluate(condition, queued), true);
    assert.ok(requiredNames.includes(evaluate(name, queued)));
  }
});

test('risk PRs run full once ci:full is added, and Full Gate requires it', () => {
  const ci = workflow('ci');
  // These workflow expressions use the same comparisons and boolean operators as JS; ?. matches null propagation.
  const evaluate = (expression, github, needs) => new Function('github', 'needs', `return (${expression.replace(/\.(?=[a-z_])/g, '?.')})`)(github, needs);
  const fullRequired = ci.match(/FULL_REQUIRED: \$\{\{ (.+) \}\}/)[1];
  const gateScript = ci.match(/name: Require all selected checks to succeed[\s\S]*?run: \|\n([\s\S]*?)\n\s*echo 'Selected/)[1];
  const gate = (env) => spawnSync('bash', ['-e', '-c', gateScript], { encoding: 'utf8', env: { ...process.env,
    SCOPE_RESULT: 'success', FAST_RESULT: 'success', RELEASE_REQUIRED: 'false', ...env } }).status;
  assert.equal(gate({ FULL_REQUIRED: 'true', FULL_RESULT: 'skipped' }), 1);
  assert.equal(gate({ FULL_REQUIRED: 'true', FULL_RESULT: 'success' }), 0);
  assert.equal(gate({ FULL_REQUIRED: 'false', FULL_RESULT: 'skipped' }), 0);
  const fullCondition = ci.match(/npm run verify:full -- --skip-fast\s+id: full\s+if: ([^\n]+)/)[1];
  const releaseCondition = ci.match(/RELEASE_REQUIRED: \$\{\{ (.+) \}\}/)[1];
  const fastScript = ci.match(/name: Focused fast validation[\s\S]*?run: \|\n([\s\S]*?)      - run:/)[1];
  for (const [path, fullOnPr] of [
    ['src/auth/session.ts', true], ['src/schema.ts', true], ['package-lock.json', true],
    ['src/identity.ts', true], ['apps/api/src/tenancy.ts', true], ['apps/api/src/persistence.ts', true],
    ['src/shared/types.ts', true], ['unknown.file', true], ['scripts/automation/verify-fast.mjs', true],
    ['src/components/Card.vue', false], ['docs/product-specs/cards.md', false]
  ]) {
    const scope = classifyChanges([{ path, status: 'M' }]);
    const labeled = { event_name: 'pull_request', event: { action: 'labeled', label: { name: 'ci:full' } } };
    const needs = { scope: { outputs: { scope } } };
    assert.equal(evaluate(fullCondition, labeled, needs), fullOnPr, path);
    assert.equal(evaluate(fullRequired, labeled, needs), fullOnPr, path);
    for (const action of ['opened', 'synchronize', 'ready_for_review']) {
      assert.equal(evaluate(fullCondition, { event_name: 'pull_request', event: { action } }, needs), false, `${path}: ${action}`);
    }
    assert.equal(evaluate(releaseCondition, labeled, needs), false);
    const fast = spawnSync('bash', ['-e', '-c', `npm() { printf '%s' "$*"; };\n${fastScript}`], {
      encoding: 'utf8', env: { ...process.env, SCOPE: scope, GITHUB_EVENT_NAME: 'pull_request' }
    });
    assert.equal(fast.status, 0, fast.stderr);
    assert.equal(fast.stdout, `run verify:fast -- --scope ${fullOnPr ? 'broad' : scope}`);
  }
  for (const event_name of ['pull_request', 'merge_group']) {
    const needs = { scope: { outputs: { scope: 'full' } } };
    const github = { event_name, event: { label: { name: 'ci:full' } } };
    assert.equal(evaluate(fullCondition, github, needs), true);
    assert.equal(evaluate(fullRequired, github, needs), true);
    assert.equal(evaluate(releaseCondition, github, needs), true);
  }
  assert.equal(evaluate(fullCondition, { event_name: 'merge_group', event: {} }, { scope: { outputs: { scope: 'full' } } }), true);
});

test('drafts and ci:full label workflows stay small and least-privileged', () => {
  const draft = workflow('pr-draft');
  assert.match(draft, /pull_request_target:\s+types: \[opened, reopened\]/);
  assert.match(draft, /permissions:\n  pull-requests: write\n\n/);
  assert.match(draft, /timeout-minutes: 2/);
  assert.match(draft, /!github.event.pull_request.draft &&\s+github.event.pull_request.user.type != 'Bot' &&\s+!startsWith\(github.event.pull_request.head.ref, 'release\/'\)/);
  assert.match(draft, /gh pr ready --undo "\$PR_URL"/);
  const label = workflow('ci-full-label');
  assert.match(label, /pull_request_target:\s+types: \[synchronize\]/);
  assert.match(label, /permissions:\n  pull-requests: write\n\n/);
  assert.match(label, /issues\/\$PR\/labels\/ci%3Afull/);
  for (const content of [draft, label]) assert.doesNotMatch(content, /uses:|checkout|paths:/);
  for (const name of ['ci', 'pr-draft', 'ci-full-label']) assert.doesNotMatch(workflow(name), /^\s+paths(-ignore)?:/m);
});

test('candidate dispatch validates trust before checkout and records success-only exact evidence', () => {
  const ci = workflow('ci-candidate');
  const guard = ci.match(/name: Validate trusted dispatch[\s\S]*?run: \|\n([\s\S]*?)      - uses: actions\/checkout/)[1].replace(/^          /gm, '');
  const env = { ...process.env, REVISION: 'a'.repeat(40), DEFAULT_BRANCH: 'main', GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch' };
  assert.equal(spawnSync('bash', ['-e', '-c', guard], { env }).status, 0);
  for (const invalid of [{ REVISION: 'main' }, { REVISION: 'A'.repeat(40) }, { REVISION: 'a'.repeat(39) }, { GITHUB_REF: 'refs/heads/feature' }, { GITHUB_EVENT_NAME: 'push' }]) {
    assert.notEqual(spawnSync('bash', ['-e', '-c', guard], { env: { ...env, ...invalid } }).status, 0);
  }
  assert.match(ci, /run-name: CI candidate \$\{\{ inputs.revision \}\}/);
  assert.match(ci, /required: true\s+type: string/);
  assert.match(ci, /test "\$\(git rev-parse HEAD\)" = "\$REVISION"/);
  assert.match(ci, /git merge-base --is-ancestor "\$REVISION" origin\/dev/);
  assert.match(ci, /npm run verify:fast\s+- run: npm run verify:full -- --skip-fast/);
  assert.ok(ci.indexOf('Record successful validation identity') > ci.indexOf('npm run verify:full'));
  assert.match(ci, /run_id: e.GITHUB_RUN_ID, run_attempt: e.GITHUB_RUN_ATTEMPT/);
  assert.match(ci, /name: ci-candidate-\$\{\{ inputs.revision \}\}/);
  assert.match(ci, /if-no-files-found: error\s+overwrite: true/);
  assert.doesNotMatch(ci, /if: always|continue-on-error|secrets:|environment:|contents: write/);
});

test('release tags preserve landed and source identities atomically', () => {
  const tags = workflow('release-tag');
  assert.match(tags, /github.event.pull_request.merged == true/);
  assert.match(tags, /SOURCE_SHA: \$\{\{ github.event.pull_request.head.sha \}\}/);
  assert.match(tags, /git tag -a "\$source_tag" "\$source_sha"/);
  assert.match(tags, /git push --atomic origin "refs\/tags\/\$tag" "refs\/tags\/\$source_tag"/);
  assert.match(tags, /for candidate in "\$tag" "\$source_tag"/);
  assert.match(tags, /date -d/);
  assert.doesNotMatch(tags, /parent_count|must be merged with a merge commit|railway|wrangler/);
});
