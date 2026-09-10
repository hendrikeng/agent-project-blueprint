import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

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
  assert.match(ci, /needs: \[scope, fast-gate, release-candidate-gate\]\s+if: always\(\)/);
  for (const result of ['SCOPE_RESULT', 'FAST_RESULT', 'RELEASE_RESULT']) assert.ok(ci.includes(`test "$${result}" = success`));
  assert.match(ci, /npm run verify:full -- --skip-fast\s+if: needs.scope.outputs.scope == 'full'/);
  assert.match(ci, /RELEASE_HEAD_REF: \$\{\{ github.event.pull_request.head.sha \}\}/);
  assert.match(ci, /npm run release:verify -- --allow-any-branch/);
  assert.doesNotMatch(ci, /staging|preview|environment:|railway|wrangler/i);
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
