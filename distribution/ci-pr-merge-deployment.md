# PR and merge-group CI policy

## Metadata

- Plan-ID: ci-pr-merge-deployment
- Status: completed
- Priority: p2
- Owner: Blueprint Toolkit Worker
- Acceptance-Criteria: Root and starter CI validate PRs and merge groups without push validation. Current docs define safe deployment selection. Focused regressions pass.
- Delivery-Class: ops
- Dependencies: none
- Spec-Targets: README.md, template/docs/ops/automation/INTEROP_GITHUB.md, template/docs/ops/releases/README.md, template/docs/deploy/README.md
- Implementation-Targets: .github/workflows/ci.yml, template/.github/workflows/ci.yml, scripts/release-workflow.test.mjs, scripts/bootstrap-configure.test.mjs
- Risk-Tier: medium
- Validation-Lanes: always, host-required
- Security-Approval: not-required
- Done-Evidence: distribution/ci-pr-merge-deployment.md

## Already-True Baseline

Root verified workspace `wks_76589ffa83c9ade9` for this repository.
Root CI retains four OS/Node combinations. Starter CI separates metadata from code evidence.
Candidate dispatch validates an exact dev ancestor and records success-only run identity.
Release tags preserve separate landed and source identities. Downstream workflows remain project-owned.

## Must-Land Checklist

- [x] `events` Use PR and merge-group validation without ordinary push validation.
- [x] `coverage` Update workflow and generated-consumer event regressions.
- [x] `contracts` Define Preview and Production selection with exact identity and readiness boundaries.
- [x] `validation` Run focused deterministic checks and inspect the scoped diff.

## Deferred Follow-Ons

Provider adapters, deployment activation, secrets, permissions, and hosted configuration remain outside this slice.
Each project must adopt its workflows and verify hosted required checks and deployment consumers.
The coordinator owns rollout integration. Existing distribution history remains unchanged.

## Continuation

Implementation, focused validation, and publication review are complete for the eight assessed files and this bounded plan.
Root authorizes an explicit nine-file commit and non-force push on the existing `main` branch.
Branch changes, worktrees, sibling edits, delegation, services, and live deployments remain outside this worker's scope.
Hosted enforcement and project deployment integrations remain unverified. Candidate dispatch and release-tag workflows are unchanged.

## Validation Evidence

Node.js v24.21.0 passed these commands:

```sh
node --test scripts/release-workflow.test.mjs template/scripts/ci/classify-change.test.mjs
node --test --test-name-pattern='bootstrap configure preserves files' scripts/bootstrap-configure.test.mjs
node --test --test-name-pattern='project-owned files survive' scripts/harness-sync.test.mjs
git diff --check
```

The workflow/classifier command passed eight tests. Generated-consumer coverage passed two tests. Ownership protection passed one test.
Fixture tests used temporary directories with registered cleanup. No service or database tests ran.
Scoped diff inspection confirmed the retained matrix, candidate dispatch, release-tag boundaries, and distribution history.
The event assertions inspect workflow declarations. They do not execute the GitHub scheduler or provider integrations.

## Review Evidence

Credential inspection found no suspected real credentials in the frozen nine-file bundle.
The installed AutoReview helper used `--engine codex --mode local --base acf07a8b6a99f03d6884ddd9edf064d2f894ceb8 --max-priority P2`.
Scoped context covered root, starter, and generated-consumer event semantics, distinct revision identities, and deployment-selection-only intent.
Codex `gpt-6.1-sol` at high reasoning returned `scoped-clean`, exit 0, with no actionable P0-P2 findings.
Review thread: `01a11de4-3d59-7db2-8877-039c6a37ce28`. Helper isolation and final source verification passed.
Exact invocation and validated outcome remain in external review text artifacts. All nine source hashes matched after review.
Only this plan receives closure metadata after review. The eight implementation and contract files retain their reviewed bytes.

## Closure

Blueprint source implementation, focused checks, and mandatory publication review are complete.
The expected remote is `git@github.com:hendrikeng/agent-project-blueprint.git`.
Before publication, remote `main` matched local base `acf07a8b6a99f03d6884ddd9edf064d2f894ceb8`.
The worker's publication report records the resulting commit and remote readback, or any publication blocker.
This source closeout does not claim hosted validation, downstream adoption, deployment integration, or live activation.
