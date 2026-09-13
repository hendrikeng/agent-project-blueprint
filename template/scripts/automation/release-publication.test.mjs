import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { renderReleaseNotes } from './release-support-lib.mjs';

const workflow = readFileSync(new URL('../../.github/workflows/release-tag.yml', import.meta.url), 'utf8');
const pairedTags = workflow.includes('source_tag=');
function step(name) {
  const body = workflow.split(`      - name: ${name}\n`)[1]?.split('\n      - ')[0];
  assert.ok(body, `Missing ${name}`);
  return body.split('        run: |\n')[1].replace(/^ {10}/gm, '');
}
const script = [step('Generate release notes'), step(`Create or verify annotated release tag${pairedTags ? 's' : ''}`), step('Create GitHub Release')].join('\n');

function run(overrides = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), 'release-publication-'));
  const calls = path.join(directory, 'calls.txt');
  const result = spawnSync('bash', ['-e', '-c', `
    git() {
      printf 'git %s\n' "$*" >> "$CALLS"
      case "$1" in
        fetch|config|tag|push) return 0 ;;
        describe) if [[ "$NO_PREVIOUS_TAG" == true ]]; then return 1; fi; printf 'v2026.09.12.1\n' ;;
        cat-file) printf '%s\n' "$TAG_TYPE" ;;
        rev-list)
          if [[ "$BAD_MERGE" == true ]]; then printf '%s %s\n' "$MERGE_SHA" "$BASE_SHA"
          else printf '%s %s %s\n' "$MERGE_SHA" "$BASE_SHA" "$SOURCE_SHA"; fi ;;
        show-ref)
          if [[ "$TAG_STATE" == all ]]; then return 0; fi
          if [[ "$TAG_STATE" == landed && "$4" != refs/tags/source-* ]]; then return 0; fi
          return 1 ;;
        rev-parse)
          if [[ "$TAG_CONFLICT" == all || ( "$TAG_CONFLICT" == source && "$2" == source-* ) ]]; then printf 'wrong-commit\n'
          elif [[ "$2" == source-* ]]; then printf '%s\n' "$SOURCE_SHA"
          else printf '%s\n' "$MERGE_SHA"; fi ;;
        *) return 90 ;;
      esac
    }
    node() {
      printf 'node %s\n' "$*" >> "$CALLS"
      if [[ "$NOTES_FAILURE" == true ]]; then return 1; fi
      printf '# Release Notes\nObserved slice evidence\n'
    }
    gh() {
      printf 'gh %s\n' "$*" >> "$CALLS"
      case "$1 $2" in
        'release view') [[ "$RELEASE_EXISTS" == true ]] ;;
        'release create') [[ "$PUBLISH_FAILURE" != true ]] ;;
        *) return 91 ;;
      esac
    }
    ${script}
  `], { encoding: 'utf8', env: {
    ...process.env, CALLS: calls, RUNNER_TEMP: directory,
    BASE_SHA: 'a'.repeat(40), MERGE_SHA: 'b'.repeat(40), SOURCE_SHA: 'c'.repeat(40),
    RELEASE_TAG: 'v2026.09.13.1', RELEASE_VERSION: '2026.09.13.1',
    GITHUB_REPOSITORY: 'owner/app', RELEASE_PR_URL: 'https://github.com/owner/app/pull/42',
    TAG_STATE: 'none', TAG_TYPE: 'tag', TAG_CONFLICT: '', RELEASE_EXISTS: 'false', BAD_MERGE: 'false',
    NO_PREVIOUS_TAG: 'false', NOTES_FAILURE: 'false', PUBLISH_FAILURE: 'false', ...overrides
  } });
  return { ...result, calls: readFileSync(calls, 'utf8'), notes: readFileSync(path.join(directory, 'release-notes.md'), 'utf8') };
}

test('notes contain real inventory and evidence, not unfinished prompts or claimed test passes', () => {
  const notes = renderReleaseNotes({ base: 'previous', head: 'candidate', branch: 'release/2026.09.13.1', warnings: [],
    configFiles: ['.github/workflows/ci.yml'], migrationFiles: ['migrations/001.sql'], mappedStandardChanges: [],
    plans: [{ planId: 'example', title: 'Example feature', filePath: 'docs/exec-plans/completed/example.md', doneEvidence: 'docs/exec-plans/evidence-index/example.md', evidenceBullets: ['Focused check passed.'] }] });
  assert.match(notes, /^# Release Notes\n/);
  for (const value of ['Example feature', 'migrations/001.sql', 'docs/exec-plans/evidence-index/example.md', 'Focused check passed.']) assert.ok(notes.includes(value));
  assert.doesNotMatch(notes, /Draft|Fill manually|promote user-facing|<previous-tag>|npm run verify:deploy/);
  assert.match(notes, /does not verify deployment health/);
});

test('publication uses explicit source range, generated notes, and verified existing tags', () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.calls, new RegExp(`node scripts/automation/release-notes.mjs --base v2026.09.12.1 --head ${'c'.repeat(40)}`));
  assert.match(result.calls, /gh release create v2026\.09\.13\.1 --repo owner\/app --verify-tag --title Release 2026\.09\.13\.1 --notes-file/);
  assert.ok(result.calls.indexOf('node scripts/automation/release-notes.mjs') < result.calls.indexOf('git tag -a'));
  assert.ok(result.calls.indexOf('git push') < result.calls.indexOf('gh release create'));
  assert.match(result.notes, /Release PR: https:\/\/github.com\/owner\/app\/pull\/42/);
  assert.match(workflow, /BASE_SHA: \$\{\{ github.event.pull_request.base.sha \}\}/);
  assert.match(workflow, /SOURCE_SHA: \$\{\{ github.event.pull_request.head.sha \}\}/);
  assert.match(workflow, /GH_TOKEN: \$\{\{ github.token \}\}/);
  assert.doesNotMatch(workflow, /workflow_dispatch:|release edit|--force/);
  assert.ok(result.calls.includes(`--abbrev=0 ${'a'.repeat(40)}`));
});

test('first release falls back to the pre-merge base; failed notes prevent tag/publication effects', () => {
  const first = run({ NO_PREVIOUS_TAG: 'true' });
  assert.equal(first.status, 0, first.stderr);
  assert.ok(first.calls.includes(`--base ${'a'.repeat(40)} --head ${'c'.repeat(40)}`));
  const failed = run({ NOTES_FAILURE: 'true' });
  assert.notEqual(failed.status, 0);
  assert.doesNotMatch(failed.calls, /git tag -a|git push|gh release/);
});

test('retry repairs a missing release without recreating tags or overwriting existing notes', () => {
  for (const exists of ['false', 'true']) {
    const result = run({ TAG_STATE: 'all', RELEASE_EXISTS: exists });
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.calls, /git tag -a|gh release edit/);
    assert.equal(result.calls.includes('gh release create'), exists === 'false');
  }
  const failed = run({ PUBLISH_FAILURE: 'true' });
  assert.notEqual(failed.status, 0, 'publication errors must fail the job');
});

test('lightweight tags and disallowed merge styles cannot publish', () => {
  const lightweight = run({ TAG_STATE: 'all', TAG_TYPE: 'commit' });
  assert.notEqual(lightweight.status, 0);
  assert.doesNotMatch(lightweight.calls, /git push|gh release/);
  if (!pairedTags) {
    const nonMerge = run({ BAD_MERGE: 'true' });
    assert.notEqual(nonMerge.status, 0);
    assert.doesNotMatch(nonMerge.calls, /git tag -a|git push|gh release/);
  }
});

test('conflicting landed/source tags block publication; a missing source tag is recoverable', () => {
  for (const conflict of pairedTags ? ['all', 'source'] : ['all']) {
    const result = run({ TAG_STATE: 'all', TAG_CONFLICT: conflict });
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.calls, /git push|gh release/);
  }
  if (pairedTags) {
    const partial = run({ TAG_STATE: 'landed' });
    assert.equal(partial.status, 0, partial.stderr);
    assert.match(partial.calls, /git tag -a source-v2026\.09\.13\.1/);
    assert.doesNotMatch(partial.calls, /git tag -a v2026\.09\.13\.1/);
    assert.match(partial.calls, /git push --atomic/);
  }
});
