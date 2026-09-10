# Budget-aware CI completion

Status: implementation committed, publication blocked by runtime permissions
Scope: blueprint source in `ci-budget-blueprint`, based on `d6b807c9`.

This slice continues the phase-one changes. Publication is now authorized. Merge and hosted configuration changes remain outside worker authority.

## Must-land checklist

- [x] `scopes`: Add explicit product, docs, harness, and broad categories without a per-test dependency engine.
- [x] `metadata`: Run PR contracts on metadata edits without replacing code-check evidence or canceling code runs. Revalidate base edits.
- [x] `aggregate`: Fail required aggregates when a selected job fails, skips, or cancels.
- [x] `candidate`: Validate an exact dev ancestor through a trusted default-branch dispatch and publish success-only identity evidence.
- [x] `ownership`: Preserve project-owned workflows, gates, and risk classifiers during sync.
- [x] `proof`: Run focused tests and attempt template smoke. Record the guard blocker and require public PR smoke/golden validation.
- [x] `review`: Complete the required complexity and correctness reviews.
- [x] `publish`: Prepare the reviewed scoped changes for commit and a truthful PR to main. Public CI and merge remain coordinator closeout.

## Scope contract

Fast verification retains governance, plan closeout, path policy, quality, harness alignment, and strict eval evidence checks in every code scope.
Product changes run the declared fast project commands without the harness regression suite.
Docs changes run documentation and safety checks without product tests or the harness regression suite.
Harness PRs run broad fast verification, then full verification. They retain product tests, harness regressions, agent readiness, and strict eval requirements.
Unknown, deleted, shared-configuration, sensitive, or mixed changes use the broad fast scope.

Full commands run for broad or harness PRs, exact selected candidates, PRs to main, main pushes, and main merge groups.
Dev pushes do not run full validation. Ordinary risk PRs require full project commands, but not release verification.
Standalone full verification still includes broad fast verification. CI runs those fast commands once before the remaining full commands.

`Full Gate` is a compatibility name for the selected-scope aggregate, not proof that full suites ran on every PR.
The candidate artifact is the full-validation proof for deployments. PRs require `PR Contract`, `Fast Gate`, and `Full Gate`.
Release PRs also require `Release Candidate Gate`.
Metadata jobs use separate names, so their success or skip cannot replace prior code-check results.
Absent code evidence stays absent. Base edits select code validation again.

## Candidate and adoption contract

The workflow is `.github/workflows/ci-candidate.yml`. It accepts a required lowercase 40-character `revision` SHA.
Only dispatches from the repository default branch can produce evidence. The selected revision must be an ancestor of `origin/dev`.
The run name is `CI candidate <revision>`. Successful full validation produces `ci-candidate-<revision>` with `evidence.json`.
The JSON fields are `revision`, `repository`, `run_id`, and `run_attempt`, all strings.

Deployment consumers must verify the workflow path, dispatch event, trusted default-branch ref, successful run conclusion, and artifact identity.
They must compare the artifact revision and run identity with the selected deployment revision and GitHub run response.
A run title alone is not evidence. A missing, expired, mismatched, canceled, or failed run must block deployment before secrets or provider effects.
This blueprint does not add automatic deployment or change hosted branch protection.

Workflows, `docs/governance/project-gates.json`, and `scripts/ci/**` are project-owned.
Existing applications need an explicit reviewed adoption of the classifier, workflows, and scoped orchestrators together.
Generic updates must not overwrite project risk categories. The ownership regression test covers edited classifiers and candidate workflows.

## Validation and limitations

Fifteen focused classifier, orchestrator, closeout identity, and workflow tests passed on Node.js v24.18.0.
Three generated-consumer and ownership tests also passed. `git diff --check` passed.
Template smoke passed 100 of 101 harness tests, then stopped at an existing fixture command.
The git yolo guard denied `git checkout -b dev` in `release-support-lib.test.mjs` with exit 126.
Golden adoption uses the same denied command class. No alternate executable, permission bypass, or unchanged retry occurred.
Public PR smoke and golden jobs must supply the remaining validation before merge. The coordinator approved publication with this explicit limitation.

The complexity pass removed an unused exported test wrapper. It found no remaining speculative layer or dependency to remove.
Autoreview with Codex `gpt-6-astra` at medium thinking returned `scoped-clean` with no actionable P0–P2 findings.
The verified review status and report are in `/Users/hendrik/.pi/agent/review-results/review-kn_n_o8i/`.
An optional redirected wrapper log lacked permission. The documented foreground helper then completed with its default report paths.
No permissions changed. The public root OS/Node matrix remains unchanged.

Implementation commit: `fdd5fa8` (`feat: add scoped CI and exact candidate validation defaults`).
The git yolo guard denied `git push -u origin hendrikeng/ci-budget-blueprint` as an unsupported unattended push.
No dedicated authorized push tool is available. No remote branch or PR publication is claimed.
The prepared PR body is `/Users/hendrik/Code/.agent-toolkit-scratch/ci-budget-blueprint.4Bxugz/pr-body.md`.
The coordinator requested failed delivery closeout, with code completion recorded separately.

A cross-repository review identified a candidate artifact rerun conflict. The upload now uses `overwrite: true` with the same exact-revision name.
A successful rerun replaces the artifact with the current run attempt identity. Deployment consumers still must reject failed or mismatched attempts.
All three focused workflow tests passed again. The repeat complexity pass found nothing to remove.
The first repeat correctness review identified the old index version, not the corrected working tree, as missing `overwrite: true`.
The final staged review returned `scoped-clean` with no actionable P0–P2 findings, again using Astra at medium thinking.
Verified final report: `/Users/hendrik/.pi/agent/review-results/review-woahwrzy/report.txt`.
The follow-up commit contains the corrected workflow and its regression assertion.
Cache placeholders remain unchanged because the solution adds no package-manager-specific dependency or cache setup.
Hosted event behavior, required-check configuration, and billed savings still need observation after merge and adoption.
Local fixtures do not claim hosted proof, agent evaluation results for applications, or complete safety.
