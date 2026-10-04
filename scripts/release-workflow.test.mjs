import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { classifyChanges } from '../template/scripts/ci/classify-change.mjs';

const workflow = (name) => readFileSync(new URL(`../template/.github/workflows/${name}.yml`, import.meta.url), 'utf8');

test('default CI retains required aggregates, contract, and release coverage', () => {
  const ci = workflow('ci');
  assert.match(ci, /pull_request:\s+branches: \[dev, main\]\s+types: \[opened, synchronize, reopened, edited, ready_for_review\]/);
  assert.match(ci, /push:\s+branches: \[dev, main\]\s+merge_group:\s+branches: \[main\]/);
  assert.doesNotMatch(ci, /slice\/\*\*|fix\/\*\*/);
  assert.match(ci, /cancel-in-progress: true/);
  assert.match(ci, /&& !github.event.changes.base && 'metadata' \|\| 'code'/);
  for (const name of ['Fast Gate', 'Full Gate', 'Release Candidate Gate']) {
    assert.ok(ci.includes(`|| '${name}'`), `Metadata must not replace ${name}`);
  }
  assert.match(ci, /name: PR Contract/);
  assert.match(ci, /needs: \[scope, fast-gate, release-candidate-gate\]\s+if: >-\s+always\(\)/);
  for (const result of ['SCOPE_RESULT', 'FAST_RESULT', 'RELEASE_RESULT']) assert.ok(ci.includes(`test "$${result}" = success`));
  assert.match(ci, /npm run verify:full -- --skip-fast\s+if: needs.scope.outputs.scope == 'full'/);
  assert.match(ci, /RELEASE_HEAD_REF: \$\{\{ github.event.pull_request.head.sha \}\}/);
  assert.match(ci, /npm run release:verify -- --allow-any-branch/);
  assert.doesNotMatch(ci, /staging|preview|environment:|railway|wrangler/i);
});

test('PR metadata skips gate runners without replacing or canceling real validation', () => {
  const ci = workflow('ci');
  const evaluate = (expression, github) => new Function('github', 'always', `return (${expression})`)(github, () => true);
  const group = (github) => ci.match(/^  group: (.+)$/m)[1]
    .replace(/\$\{\{ (.+?) \}\}/g, (_, expression) => evaluate(expression, github));
  const jobs = ['fast-gate', 'full-gate', 'release-candidate-gate'].map((id) => {
    const block = ci.split(`  ${id}:\n`)[1].split(/\n  [\w-]+:\n/)[0];
    const condition = block.match(/^    if: >-\n((?:      [^\n]+\n)+)/m)?.[1].trim() ?? block.match(/^    if: (.+)$/m)[1];
    return { id, condition, name: block.match(/^    name: \$\{\{ (.+) \}\}$/m)[1] };
  });
  const requiredNames = ['Fast Gate', 'Full Gate', 'Release Candidate Gate'];
  for (const base of ['dev', 'main']) {
    const real = { event_name: 'pull_request', workflow: 'ci', ref: 'refs/pull/7/merge',
      event: { action: 'synchronize', changes: {}, pull_request: { number: 7 } }, base_ref: base };
    for (const [action, changes, metadata] of [
      ['edited', { title: { from: 'old title' } }, true],
      ['edited', { body: { from: 'old body' } }, true],
      ['edited', {}, true],
      ['edited', { base: { ref: { from: 'other' } } }, false],
      ['edited', { base: {}, body: { from: 'old body' } }, false],
      ['opened', {}, false], ['synchronize', {}, false], ['reopened', {}, false],
      ['ready_for_review', {}, false]
    ]) {
      const github = { ...real, event: { ...real.event, action, changes } };
      const label = `${base}: ${action} ${JSON.stringify(changes)}`;
      assert.equal(group(github) === group(real), !metadata, `${label}: cancellation group`);
      for (const { id, condition, name } of jobs) {
        assert.equal(evaluate(condition, github), !metadata && (id !== 'release-candidate-gate' || base === 'main'), `${label}: ${id} scheduling`);
        const checkName = evaluate(name, github);
        if (metadata) assert.ok(!requiredNames.includes(checkName), `${label}: skipped job must not replace required evidence`);
        else assert.equal(checkName, requiredNames[['fast-gate', 'full-gate', 'release-candidate-gate'].indexOf(id)]);
      }
    }
  }
  for (const event_name of ['push', 'merge_group']) {
    const github = { event_name, workflow: 'ci', ref: 'refs/heads/main', event: { changes: {} } };
    for (const { id, condition, name } of jobs) {
      assert.equal(evaluate(condition, github), id !== 'release-candidate-gate' || event_name === 'merge_group');
      assert.ok(requiredNames.includes(evaluate(name, github)));
    }
  }
});

test('risk PRs run full after broad fast, without requiring release checks or widening dev pushes', () => {
  const ci = workflow('ci');
  // These workflow expressions use the same comparisons and boolean operators as JS.
  const fullCondition = ci.match(/npm run verify:full -- --skip-fast\s+if: ([^\n]+)/)[1];
  const releaseCondition = ci.match(/RELEASE_REQUIRED: \$\{\{ (.+) \}\}/)[1];
  const fastScript = ci.match(/name: Focused fast validation[\s\S]*?run: \|\n([\s\S]*?)      - run:/)[1];
  for (const [path, fullOnPr] of [
    ['src/auth/session.ts', true], ['src/schema.ts', true], ['package-lock.json', true],
    ['src/shared/types.ts', true], ['unknown.file', true], ['scripts/automation/verify-fast.mjs', true],
    ['src/components/Card.vue', false], ['docs/product-specs/cards.md', false]
  ]) {
    const scope = classifyChanges([{ path, status: 'M' }]);
    for (const event_name of ['pull_request', 'push']) {
      const github = { event_name };
      const needs = { scope: { outputs: { scope } } };
      assert.equal(new Function('github', 'needs', `return (${fullCondition})`)(github, needs), event_name === 'pull_request' && fullOnPr, `${path}: ${event_name}`);
      assert.equal(new Function('github', 'needs', `return (${releaseCondition})`)(github, needs), false);
      const fast = spawnSync('bash', ['-e', '-c', `npm() { printf '%s' "$*"; };\n${fastScript}`], {
        encoding: 'utf8', env: { ...process.env, SCOPE: scope, GITHUB_EVENT_NAME: event_name }
      });
      assert.equal(fast.status, 0, fast.stderr);
      assert.equal(fast.stdout, `run verify:fast -- --scope ${event_name === 'pull_request' && fullOnPr ? 'broad' : scope}`);
    }
  }
  for (const event_name of ['pull_request', 'push', 'merge_group']) {
    const needs = { scope: { outputs: { scope: 'full' } } };
    assert.equal(new Function('github', 'needs', `return (${fullCondition})`)({ event_name }, needs), true);
    assert.equal(new Function('github', 'needs', `return (${releaseCondition})`)({ event_name }, needs), event_name !== 'push');
  }
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
