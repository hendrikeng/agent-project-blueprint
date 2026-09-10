# CI budget reduction: phase one

Status: locally validated phase-one snapshot, superseded by the completion slice
Scope: blueprint source in `ci-budget-blueprint`, based on `d6b807c9`.

## Plan

- [x] `events`: Keep PR events, dev/main pushes, cancellation, and merge-group coverage. Remove feature-push runs.
- [x] `full`: Make Full Gate depend on successful Fast Gate before it uses `--skip-fast`. Keep standalone full verification unchanged.
- [x] `coverage`: Keep gate names, required commands, release checks, and the public root OS/Node matrix.
- [x] `proof`: Run focused orchestrator tests and generated workflow assertions through the existing bootstrap tests.
- [x] `adoption`: Document separate downstream adoption and the limits of local proof.

The initial scope excluded publication. The later user instruction authorized the [completion slice](ci-budget-completion.md) and its scoped publication.

## Deferred work

PR title and body changes affect `pr:verify` and the release contract. Metadata-only runs need proof of required-check behavior before adoption.
The `edited` and `ready_for_review` events continue to run all applicable gates in this phase.

Cache placeholders remain unused. The current workflow enables Corepack after `setup-node`.
Package-manager cache discovery needs compatible npm, pnpm, and yarn setup, plus focused smoke proof. This phase does not add that work.

Selective tests and changes to the required PR gates remain outside this phase. No required checks move to staging.

## Validation and closeout

Node.js v24.18.0 passed these focused checks:

```sh
node --test template/scripts/automation/verify-fast.test.mjs template/scripts/automation/verify-full.test.mjs scripts/release-workflow.test.mjs
node --test --test-name-pattern='bootstrap configure preserves files' scripts/bootstrap-configure.test.mjs
git diff --check
```

The first command passed eight tests. The second passed two generated-consumer tests.
A scratch-only Node preload redirected fixture temporary files to `AGENT_TOOLKIT_SCRATCH_ROOT`. It did not change `TMPDIR` or repository code.

Dry runs covered default full verification, explicit skip, and false or invalid skip values.
Stub child scripts proved command order, full-profile arguments, early termination, and nonzero exit propagation with and without fast verification.
The generated workflow assertions covered event filters, cancellation, the successful fast prerequisite, gate names, and retained validation and release commands.
These assertions inspect workflow text. They do not run the GitHub Actions scheduler or install package managers.

The adoption guide is `template/docs/ops/automation/INTEROP_GITHUB.md`.
The ownership manifest remains unchanged. Downstream workflows and project gates need separate adoption.
The public root CI remains unchanged, including all four OS/Node combinations.
No commits, publication, AI reviews, hosted changes, or changes to other checkouts occurred.

Local tests cannot prove hosted cancellation, merge-queue behavior, branch protection, or billed-minute savings.
The next phase needs hosted event evidence and a before/after minutes baseline before metadata-only checks or caching can proceed.
No claim of complete safety or measured savings applies.
