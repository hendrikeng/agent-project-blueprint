import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
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
  // Only a passed PR Full records its tree for exact-tree candidate reuse.
  assert.match(ci, /id: tree\n\s+if: steps.full.outcome == 'success' && github.event_name == 'pull_request' && github.base_ref == 'dev'\n/);
  assert.match(ci, /if: steps.tree.outcome == 'success'\n\s+with:\n\s+name: full-tree-\$\{\{ steps.tree.outputs.tree \}\}/);
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
    ['.github/workflows/ci.yml', true], ['scripts/ci/classify-change.mjs', true],
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
  for (const [event_name, base_ref, release] of [['pull_request', 'main', true], ['pull_request', 'dev', false], ['merge_group', undefined, true]]) {
    const needs = { scope: { outputs: { scope: 'full' } } };
    const github = { event_name, base_ref, event: { label: { name: 'ci:full' } } };
    assert.equal(evaluate(fullCondition, github, needs), true);
    assert.equal(evaluate(fullRequired, github, needs), true);
    assert.equal(evaluate(releaseCondition, github, needs), release, `${event_name} ${base_ref}`);
  }
  assert.equal(evaluate(fullCondition, { event_name: 'merge_group', event: {} }, { scope: { outputs: { scope: 'full' } } }), true);
});

test('the scope step runs the base classifier and selects full without one', () => {
  const ci = workflow('ci');
  const step = ci.match(/- id: scope\n[\s\S]*?run: \|\n([\s\S]*?)\n      - run: npm run pr:verify/)[1];
  assert.match(ci, /BASE_SHA: \$\{\{ github.event.pull_request.base.sha \|\| github.event.merge_group.base_sha \}\}/);
  const d = mkdtempSync(path.join(tmpdir(), 'scope-step-'));
  try {
    // GitHub runs an unnamed shell as `bash -e`, without pipefail.
    const repo = path.join(d, 'repo');
    const git = (...args) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: repo, encoding: 'utf8' }).stdout.trim();
    mkdirSync(path.join(repo, 'scripts/ci'), { recursive: true });
    git('init', '-q');
    git('commit', '-q', '--allow-empty', '-m', 'no classifier');
    const empty = git('rev-parse', 'HEAD');
    // A project-owned classifier can import its sibling files.
    writeFileSync(path.join(repo, 'scripts/ci/paths.mjs'), "export const scope = 'product';\n");
    writeFileSync(path.join(repo, 'scripts/ci/classify-change.mjs'), "import fs from 'node:fs';\nimport { scope } from './paths.mjs';\nfs.appendFileSync(process.env.GITHUB_OUTPUT, `scope=${scope}\\n`);\n");
    git('add', '.');
    git('commit', '-q', '-m', 'classifier');
    const base = git('rev-parse', 'HEAD');
    // The PR head must not decide its own scope.
    writeFileSync(path.join(repo, 'scripts/ci/paths.mjs'), "export const scope = 'docs';\n");
    const run = (baseSha) => {
      const temp = mkdtempSync(path.join(d, 'runner-'));
      const output = path.join(temp, 'output');
      writeFileSync(output, '');
      const result = spawnSync('bash', ['-e', '-c', step], { cwd: repo, encoding: 'utf8',
        env: { ...process.env, BASE_SHA: baseSha, RUNNER_TEMP: temp, GITHUB_OUTPUT: output } });
      assert.equal(result.status, 0, result.stderr);
      return readFileSync(output, 'utf8');
    };
    assert.equal(run(base), 'scope=product\n');
    assert.equal(run(empty), 'scope=full\n');
    assert.equal(run(''), 'scope=full\n');
    writeFileSync(path.join(repo, 'scripts/ci/classify-change.mjs'), 'process.exit(1);\n');
    git('commit', '-q', '-am', 'broken classifier');
    assert.equal(run(git('rev-parse', 'HEAD')), 'scope=full\n');
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test('drafts and ci:full label workflows stay small and least-privileged', () => {
  const draft = workflow('pr-draft');
  assert.match(draft, /pull_request_target:\s+types: \[opened, reopened\]/);
  assert.match(draft, /permissions:\n  contents: write\n  pull-requests: write\n\n/);
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
  assert.match(ci, /run: npm run verify:fast\n\s+if: needs.reuse.outputs.run_id == ''\n\s+- run: npm run verify:full -- --skip-fast\n\s+if: needs.reuse.outputs.run_id == ''/);
  // Only the lookup job reads Actions and PR data. It runs the dispatch commit, and every doubt runs Full.
  assert.match(ci, /^permissions:\n  contents: read\n\n/m);
  const lookup = ci.split('  reuse:\n')[1].split('\n  candidate:\n')[0];
  assert.match(lookup, /if: \$\{\{ !inputs.full \}\}/);
  assert.match(lookup, /permissions:\n      contents: read\n      actions: read\n      pull-requests: read\n/);
  assert.doesNotMatch(lookup, /ref: /);
  assert.match(lookup, /persist-credentials: false/);
  assert.match(ci, /needs: reuse\n.*\n    if: \$\{\{ !cancelled\(\) \}\}/);
  const script = lookup.match(/run: \|\n([\s\S]*)$/)[1];
  const outputs = (env, node = 'echo run_id=42 >>"$GITHUB_OUTPUT"') => {
    const d = mkdtempSync(path.join(tmpdir(), 'reuse-step-'));
    try {
      writeFileSync(path.join(d, 'out'), '');
      spawnSync('bash', ['-e', '-c', `timeout() { shift; "$@"; }\nnode() { ${node}; }\n${script}`], { env: { ...process.env,
        GITHUB_REF: 'refs/heads/dev', DEFAULT_BRANCH: 'dev', REVISION: 'a'.repeat(40), GITHUB_OUTPUT: path.join(d, 'out'), ...env } });
      return readFileSync(path.join(d, 'out'), 'utf8');
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  };
  assert.equal(outputs({}), 'run_id=42\n');
  assert.equal(outputs({ GITHUB_REF: 'refs/heads/feature' }), 'run_id=\n');
  assert.equal(outputs({ REVISION: 'main' }), 'run_id=\n');
  assert.equal(outputs({}, 'return 1'), 'run_id=\n');
  assert.ok(ci.indexOf('Record successful validation identity') > ci.indexOf('npm run verify:full'));
  assert.match(ci, /run_id: e.GITHUB_RUN_ID, run_attempt: e.GITHUB_RUN_ATTEMPT/);
  assert.match(ci, /name: ci-candidate-\$\{\{ inputs.revision \}\}/);
  assert.match(ci, /if-no-files-found: error\s+overwrite: true/);
  assert.match(lookup, /continue-on-error: true/);
  assert.doesNotMatch(ci.split('\n  candidate:\n')[1], /if: always|continue-on-error/);
  assert.doesNotMatch(ci, /if: always|secrets:|environment:|contents: write/);
});

test('only PRs outside main run the light mode, and a candidate reuse runs the full mode again', () => {
  const ci = workflow('ci');
  const candidate = workflow('ci-candidate');
  const fastGate = ci.split('  fast-gate:\n')[1].split(/\n  [\w-]+:\n/)[0];
  const light = fastGate.match(/^    env:\n(?:      #[^\n]*\n)*      CI_LIGHT_MODE: \$\{\{ (.+) \}\}$/m)[1];
  const evaluate = (github) => new Function('github', `return (${light})`)(github);
  // Full mode is empty, so a test that checks truthiness also runs the full mode.
  assert.equal(evaluate({ event_name: 'pull_request', base_ref: 'dev' }), 'true');
  assert.equal(evaluate({ event_name: 'pull_request', base_ref: 'main' }), '');
  assert.equal(evaluate({ event_name: 'merge_group' }), '');
  // template/scripts/ci/full-mode-proof.test.mjs rejects any other setter or reader in .github.
  assert.match(candidate, /- run: npm run verify:full -- --skip-fast\n\s+if: needs.reuse.outputs.run_id == ''\n(?:\s+#[^\n]*\n)?\s+- name: Run the light-mode tests in full mode\n\s+if: needs.reuse.outputs.run_id != ''\n\s+run: node scripts\/ci\/full-mode-proof.mjs\n/);
  assert.ok(candidate.indexOf('full-mode-proof.mjs') < candidate.indexOf('Record successful validation identity'));
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
