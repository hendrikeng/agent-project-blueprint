import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
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
    date() { [[ "$3" == *-99-* ]] || printf '%s\n' "\${3//-/.}"; }
    git() {
      printf 'git %s\n' "$*" >> "$CALLS"
      case "$1" in
        fetch|config|push) return 0 ;;
        tag)
          if [[ "$2" == --points-at ]]; then
            [[ "$NO_PREVIOUS_TAG" != true ]] && printf 'v2026.09.12.1\n'
            [[ "$NONCANONICAL_TAG" == true ]] && printf 'v2026.09.12.1-rc\n'
            [[ "$INVALID_RELEASE_TAG" == true ]] && printf 'v2026.99.99.1\n'
          elif [[ "$2" == --list ]]; then
            [[ "$ORPHANED_BASE" == true ]] && printf 'v2026.09.11.1\n'
            [[ "$TAG_STATE" == all ]] && printf '%s\n' "$RELEASE_TAG"
            [[ "$TAG_STATE" == all && "$PAIRED_TAGS" == true ]] && printf 'source-%s\n' "$RELEASE_TAG"
            [[ "$NONCANONICAL_TAG" == true ]] && printf 'v2026.09.11.1-rc\n'
            [[ "$INVALID_RELEASE_TAG" == true ]] && printf 'v2026.99.99.1\n'
            return 0
          else return 0; fi ;;
        cat-file) printf '%s\n' "$TAG_TYPE" ;;
        rev-list)
          if [[ "$BAD_MERGE" == true ]]; then printf '%s %s\n' "$MERGE_SHA" "$BASE_SHA"
          else printf '%s %s %s\n' "$MERGE_SHA" "$BASE_SHA" "$SOURCE_SHA"; fi ;;
        show-ref)
          if [[ "$TAG_STATE" == all ]]; then return 0; fi
          if [[ "$TAG_STATE" == landed && "$4" != refs/tags/source-* ]]; then return 0; fi
          return 1 ;;
        rev-parse)
          if [[ "$2" == "$MERGE_SHA^1" ]]; then printf '%s\n' "$BASE_SHA"
          elif [[ "$TAG_CONFLICT" == all || ( "$TAG_CONFLICT" == source && "$2" == source-* ) ]]; then printf 'wrong-commit\n'
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
        'api '*)
          if [[ "$*" == *'any(.number =='* ]]; then
            [[ "$2" == *"/commits/$MERGE_SHA/pulls" ]] && printf 'true\n' || printf 'false\n'
          else [[ "$PREVIOUS_RELEASE_PR" == true ]] && printf '41\n' || true; fi ;;
        'release view')
          if [[ "$3" == v2026.09.12.1 ]]; then
            [[ "$BASE_RELEASE_EXISTS" == true ]] || return 1
            [[ "$BASE_RELEASE_UNPUBLISHED" == true ]] && printf 'true\n' || printf 'false\n'
          else
            [[ "$RELEASE_EXISTS" == true ]] || return 1
            [[ "$RELEASE_UNPUBLISHED" == true ]] && printf 'true\n' || printf 'false\n'
          fi ;;
        'release create') [[ "$RELEASE_EXISTS" != true && "$PUBLISH_FAILURE" != true ]] ;;
        *) return 91 ;;
      esac
    }
    ${script}
  `], { encoding: 'utf8', env: {
    ...process.env, CALLS: calls, RUNNER_TEMP: directory,
    BASE_SHA: 'a'.repeat(40), MERGE_SHA: 'b'.repeat(40), SOURCE_SHA: 'c'.repeat(40),
    RELEASE_TAG: 'v2026.09.13.1', RELEASE_VERSION: '2026.09.13.1', RELEASE_PR_NUMBER: '42',
    GITHUB_REPOSITORY: 'owner/app', RELEASE_PR_URL: 'https://github.com/owner/app/pull/42',
    TAG_STATE: 'none', TAG_TYPE: 'tag', TAG_CONFLICT: '', BASE_RELEASE_EXISTS: 'true', BASE_RELEASE_UNPUBLISHED: 'false', RELEASE_EXISTS: 'false', RELEASE_UNPUBLISHED: 'false', BAD_MERGE: 'false',
    NO_PREVIOUS_TAG: 'false', ORPHANED_BASE: 'false', NONCANONICAL_TAG: 'false', INVALID_RELEASE_TAG: 'false', PREVIOUS_RELEASE_PR: 'false', PAIRED_TAGS: String(pairedTags), NOTES_FAILURE: 'false', PUBLISH_FAILURE: 'false', ...overrides
  } });
  const notesPath = path.join(directory, 'release-notes.md');
  return { ...result, calls: readFileSync(calls, 'utf8'), notes: existsSync(notesPath) ? readFileSync(notesPath, 'utf8') : '' };
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
  assert.match(workflow, /MERGE_SHA: \$\{\{ github.event.pull_request.merge_commit_sha \}\}/);
  assert.match(workflow, /SOURCE_SHA: \$\{\{ github.event.pull_request.head.sha \}\}/);
  assert.match(workflow, /GH_TOKEN: \$\{\{ github.token \}\}/);
  assert.doesNotMatch(workflow, /workflow_dispatch:|release edit|--force/);
  assert.match(workflow, /concurrency:\n  group: release-publication-\$\{\{ github\.repository \}\}\n  queue: max\n  cancel-in-progress: false/);
  assert.ok(result.calls.includes(`git tag --points-at ${'a'.repeat(40)}`));
});

test('first release falls back to the pre-merge base; failed notes prevent tag/publication effects', () => {
  const first = run({ NO_PREVIOUS_TAG: 'true' });
  assert.equal(first.status, 0, first.stderr);
  assert.ok(first.calls.includes(`--base ${'a'.repeat(40)} --head ${'c'.repeat(40)}`));
  const firstRetry = run({ NO_PREVIOUS_TAG: 'true', TAG_STATE: 'all' });
  assert.equal(firstRetry.status, 0, firstRetry.stderr);
  assert.doesNotMatch(firstRetry.calls, /git tag -a/);
  const blocked = run({ BASE_RELEASE_EXISTS: 'false' });
  assert.notEqual(blocked.status, 0);
  assert.doesNotMatch(blocked.calls, /node|git tag -a|git push|gh release create/);
  const reordered = run({ NO_PREVIOUS_TAG: 'true', PREVIOUS_RELEASE_PR: 'true' });
  assert.notEqual(reordered.status, 0);
  assert.doesNotMatch(reordered.calls, /node|git tag -a|git push|gh release create/);
  const suffixOnly = run({ NO_PREVIOUS_TAG: 'true', NONCANONICAL_TAG: 'true', INVALID_RELEASE_TAG: 'true' });
  assert.equal(suffixOnly.status, 0, suffixOnly.stderr);
  assert.ok(suffixOnly.calls.includes(`--base ${'a'.repeat(40)}`));
  const failed = run({ NOTES_FAILURE: 'true' });
  assert.notEqual(failed.status, 0);
  assert.doesNotMatch(failed.calls, /git tag -a|git push|gh release (?:create|edit)/);
  const outOfOrder = run({ NO_PREVIOUS_TAG: 'true', ORPHANED_BASE: 'true' });
  assert.notEqual(outOfOrder.status, 0);
  assert.doesNotMatch(outOfOrder.calls, /node|git tag -a|git push|gh release/);
});

test('retry repairs a missing release without recreating tags or overwriting existing notes', () => {
  for (const exists of ['false', 'true']) {
    const result = run({ TAG_STATE: 'all', RELEASE_EXISTS: exists });
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.calls, /git tag -a|gh release edit/);
    assert.ok(result.calls.includes('gh release create'));
    assert.equal(result.calls.includes('gh release view v2026.09.13.1'), exists === 'true');
  }
  const failed = run({ PUBLISH_FAILURE: 'true' });
  assert.notEqual(failed.status, 0, 'publication errors must fail the job');
});

test('drafts and prereleases cannot masquerade as published releases', () => {
  const result = run({ TAG_STATE: 'all', RELEASE_EXISTS: 'true', RELEASE_UNPUBLISHED: 'true' });
  assert.notEqual(result.status, 0);
  assert.match(result.calls, /gh release create/);
  assert.doesNotMatch(result.calls, /gh release edit/);
});

test('lightweight tags and disallowed merge styles cannot publish', () => {
  const lightweight = run({ TAG_STATE: 'all', TAG_TYPE: 'commit' });
  assert.notEqual(lightweight.status, 0);
  assert.doesNotMatch(lightweight.calls, /git push|gh release (?:create|edit)/);
  if (!pairedTags) {
    const nonMerge = run({ BAD_MERGE: 'true' });
    assert.notEqual(nonMerge.status, 0);
    assert.doesNotMatch(nonMerge.calls, /git tag -a|git push|gh release (?:create|edit)/);
  }
});

test('conflicting landed/source tags block publication; a missing source tag is recoverable', () => {
  for (const conflict of pairedTags ? ['all', 'source'] : ['all']) {
    const result = run({ TAG_STATE: 'all', TAG_CONFLICT: conflict });
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.calls, /git push|gh release (?:create|edit)/);
  }
  if (pairedTags) {
    const partial = run({ TAG_STATE: 'landed' });
    assert.equal(partial.status, 0, partial.stderr);
    assert.match(partial.calls, /git tag -a source-v2026\.09\.13\.1/);
    assert.doesNotMatch(partial.calls, /git tag -a v2026\.09\.13\.1/);
    assert.match(partial.calls, /git push --atomic/);
  }
});
