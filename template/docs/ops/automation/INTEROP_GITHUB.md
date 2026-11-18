# GitHub Interop

Status: canonical
Owner: {{DOC_OWNER}}
Last Updated: {{LAST_UPDATED_ISO_DATE}}
Source of Truth: This document.

## Purpose

Describe the optional GitHub mapping for projects that use GitHub pull requests and Actions.
Canonical policy still lives in repository docs.

## Recommended Mapping

- Pull requests carry the change summary, validation summary, docs touched, and risk notes.
- Branch protection should require review and the project’s chosen fast/full gates.
- PR templates should separate planned slices, small fixes, and releases when those lanes are adopted.
- CODEOWNERS should route security, identity, payment, migration, and governance-sensitive paths to appropriate owners.
- GitHub Actions should call repository scripts rather than duplicating policy in workflow YAML.
- The generic `ci` workflow calls `pr:verify`, `plans:verify:closeout`, `verify:fast`, `verify:full`, and `project:gates:release`.
- Release PRs and merge groups execute every required release-profile gate. The starter profile includes the focused `release:verify` check.
- Merge groups use `origin/main` and `RELEASE_ALLOW_ANY_BRANCH=true`. This bypasses branch naming only; range and evidence checks still apply.
- The generic release-tag workflow tags merged `release/YYYY.MM.DD.N` PRs into `main` as `vYYYY.MM.DD.N` and creates a GitHub Release with generated notes.

## Branch And PR Lanes

- `slice/* -> dev`: planned implementation slice using the slice PR template.
- `fix/* -> dev`: small, isolated, low-risk fix using the fix PR template.
- `release/YYYY.MM.DD.N -> main`: release promotion using the release PR template.
- Repositories that use different branch names must update workflow YAML, PR verification, release docs, and this mapping together.

## CI Cost And Merge Path

CI minutes cost money. Each PR and each push to a ready PR starts a CI run.

- Open one PR for each task. Group related small changes into one PR.
- Open the PR as a draft. Keep it a draft while you iterate. Drafts run no CI.
- Run focused local checks before each push. Batch fixes into one push.
- When the work is complete, mark the PR ready once. This runs the fast tier.
- When the PR is final, add the `ci:full` label once. This runs the heavy tier. A new push removes the label.
- Merge only with `gh pr merge --squash --match-head-commit <sha>`, where `<sha>` has a green `Full Gate`.
- Never merge over a red, pending, or skipped required check. Rerun a failed job only after you find the cause.

## CI Budget Defaults

The starter CI runs on PRs to `dev` and `main`, and `checks_requested` merge groups targeting `main`.
Ordinary branch pushes do not run validation. New runs cancel older runs for the same PR or ref.
The public blueprint CI also uses PR and merge-group events, with its existing four OS/Node combinations.
The check names remain `Fast Gate`, `Full Gate`, and `Release Candidate Gate`.

`scripts/ci/classify-change.mjs` selects explicit product, docs, harness, or broad fast validation.
Product changes run the declared fast project commands. Docs changes run documentation and safety checks without product or harness test suites.
Harness PRs run broad fast verification before full verification, including product tests, harness regressions, and agent document checks.
Every code scope retains eval integrity, context freshness, governance, path policy, plan closeout, and harness alignment checks.
Unknown, deleted, mixed, shared-configuration, and sensitive changes select broad fast validation.
Changes to `.github/workflows/**`, `.github/actions/**`, or `scripts/ci/**` select full. CI runs the classifier from the PR base commit, so a PR cannot narrow its own scope.
If the base commit has no usable classifier, CI selects full.

Full validation runs for broad or harness PRs, selected candidates, PRs to `main`, and `main` merge groups.
On a PR, full validation runs only in the run that the `ci:full` label starts. Full Gate fails until that run passes.
`ci-full-label.yml` removes `ci:full` on each new push, so each PR head pays for the heavy tier once.
It uses `pull_request_target` so that fork and Dependabot PRs also lose the label. It never checks out PR code.
Ordinary risk PRs do not require release verification.
Standalone `npm run verify:full` includes broad fast verification. CI uses `--skip-fast` only after successful broad fast verification in the same job.
Agent activation additionally requires strict eval evidence through `npm run eval:verify`. Software CI does not execute agent safety evaluations.
Full Gate aggregates the selected checks and rejects failed, skipped, or canceled required jobs. Its compatibility name does not imply full-suite execution on every PR.

Draft PRs run no CI. `ready_for_review` starts the fast tier. `pr-draft.yml` converts a new non-draft human PR to a draft. CI skips that opened event.
Labels other than `ci:full` skip gate jobs and cannot cancel a running heavy run.
PR edits without base changes run only `PR Contract`. Gate jobs are skipped under metadata-only names, so they cannot replace failed or missing code-check evidence.
Base edits and ready-for-review events run code validation again. Metadata cancellation groups cannot cancel code runs.
PRs to `main` and merge groups retain release checks. Cache placeholders remain unused.
Starter workflows pin official actions to reviewed commit SHAs with version comments. Review upstream releases and update the pins together.
The Node24 action runtime requires Actions Runner 2.327.1 or later. Hosted runners supply it; verify any self-hosted runner before adoption.
Implicit package-manager caching is disabled. Candidate fetches and release pushes retain scoped Git authentication; read-only CI does not persist credentials.

### Test Lane Guards

Each test lane has a per-test timeout and prints its slowest tests. A test that waits for a missing service then fails fast, and slow tests show in every log.
`harness:test` uses `--test-timeout=45000` and `scripts/automation/lib/slowest-tests-reporter.mjs`.
Give the project test lanes the same guards:

- Vitest: `testTimeout: 45000` and a duration report, for example the JSON reporter.
- pytest: `pytest-timeout` with `--timeout=45 --timeout-method=signal` and `--durations=25`.
  Give each correct slow test an explicit `timeout` marker.
  With `pytest-xdist`, keep the signal method. The thread method stops the whole worker process.

Harness tests that read only scripts use `createScriptsRepo()`. A full repository copy is slow in a large project.

### Light Test Mode

A test with an expensive full mode can run a lighter mode on PRs outside `main`.
Examples are many stress rounds or a long sweep. `ci.yml` sets `CI_LIGHT_MODE=true` in `Fast Gate` only for those PRs.
PRs into `main`, merge groups, and `ci-candidate.yml` keep the full mode. A test must treat every other value as full mode.

Use a light mode only when both conditions are true:

- The full mode costs many CI minutes on each PR.
- The light mode still exercises the same behavior, with fewer rounds or inputs.

Do not use it to skip a behavior, an assertion, or a security, money, or data-integrity check. Keep cheap tests in full mode.

To declare a light mode, add each test to `lightModeTests` in `scripts/ci/full-mode-proof.mjs`.
Set `fullModeCommand` to a command that runs only those test files and writes a JUnit report to `$FULL_MODE_REPORT`.
Its test fails if a file outside `docs/`, `scripts/ci/`, and Markdown reads `CI_LIGHT_MODE` and has no declaration.
If no test declares a light mode, the variable has no effect and the script does nothing.

If the candidate reuses a PR Full run, it runs `full-mode-proof.mjs`, because that run used the light mode.
The script runs the declared tests without `CI_LIGHT_MODE`.
The candidate fails unless each declared test passed once and no test failed. A missing report or a timeout also fails it.
A candidate without reuse runs `verify:full` in full mode. Each successful candidate artifact therefore proves the full mode.

### Selected Candidate Proof

`.github/workflows/ci-candidate.yml` accepts a required lowercase 40-character `revision` SHA through `workflow_dispatch`.
The dispatch must use the repository default branch. The selected revision must be an ancestor of `origin/dev`.
The run name is `CI candidate <revision>`. Only successful full validation produces the artifact `ci-candidate-<revision>`.
Its `evidence.json` contains string fields `revision`, `repository`, `run_id`, and `run_attempt`.
If the candidate reused a PR Full run, `reused_full_run_id` names that run. Otherwise, the field is `null`.

The candidate does not repeat a green PR Full run of the exact same tree. `scripts/ci/full-reuse.mjs` accepts a run only if all of these are true:

- A same-repository PR merged into `dev` has the revision as its merge commit.
- The PR file list is complete and nonempty, and the PR scope ran the Full tier.
- The PR does not change gate files: workflows, local actions, `scripts/ci/**`, `package.json`, project gates, and the verify scripts.
- The dispatch commit has the same workflows, local actions, and `scripts/ci/**` as the revision.
- The `ci.yml` run of the PR head succeeded, `Fast Gate` and `Full Gate` succeeded, and its `full-tree-<tree>` artifact is current.

Any doubt, error, or timeout runs Full. The job summary lists each miss reason.
A reuse runs the [light-mode tests](#light-test-mode) again in full mode.
The `Full Reuse Lookup` job runs the dispatch commit, not the revision under test. Only this job has `actions: read` and `pull-requests: read`.
Set the `full` dispatch input to force Full.
Reuse needs `dev` as the default branch. GitHub lists the merged PR of a commit only on the default branch, and the lookup compares workflow files with the dispatch commit.
A reused Full does not run date-dependent gates again. Add a dependency audit to the reuse path if the project has one.
Release PRs do not reuse Full. The lookup needs `actions: read` and `pull-requests: read`, and `ci.yml` keeps only `contents: read`.

Before deployment, verify the workflow path, dispatch event, trusted default-branch ref, and successful conclusion.
Then compare the artifact with the GitHub run identity.
Compare the evidence revision with the exact selected deployment revision. Reject missing, expired, failed, canceled, or mismatched evidence before secrets or provider effects.
Do not trust the run title alone. This template adds no automatic deployment.

### Deployment Selection

The default production branch is `main`. Projects with another production branch must adapt branch filters and release contracts together.
When a PR opens or receives code updates into that branch, select Preview only after successful current required code checks.
Verify the current PR head, base, tested revision, and all required check results before selection.
Metadata-only success cannot authorize Preview. A base edit needs new code checks.
A title or body edit does not supply code evidence.
After the PR merges into that branch, select Production only with verified passing candidate evidence for the exact deployment revision.
An unmerged closed PR, branch push, tag, or successful metadata job cannot authorize Production.

PR source heads, PR test-merge revisions, merge-group revisions, and landed revisions are distinct identities.
The starter checkout validates the PR test-merge revision; candidate dispatch validates its selected exact source revision.
Do not relabel either identity as the other. Bind the deployment revision to its actual passing evidence and the relevant PR.
If a project deploys the landed revision, evidence for a different source or test-merge SHA does not satisfy exact revision proof.
See `docs/deploy/README.md` for the target, identity, readiness, and recovery contract.
This policy defines target selection. Each project must implement its completion hook and provider integration before automatic deployment can occur.

### Adoption in Existing Projects

Workflows, `docs/governance/project-gates.json`, and `scripts/ci/**` are project-owned. A harness sync does not apply these defaults to existing applications.

1. Review the starter workflow changes against the local workflow and branch rules.
2. Adopt the classifier, workflows, and scoped orchestrators together.
3. Adapt explicit risk categories to the project. Keep unknown and sensitive paths broad.
4. Keep every project gate and its required commands at the documented fast, candidate, or release boundary.
5. Require PR Contract, Fast Gate, and Full Gate in branch protection. Require Release Candidate Gate for release PRs.
6. Wire Preview selection after current code-check completion and Production selection after merge with exact candidate proof.
   Reject stale PR/base identities and invalid evidence before secrets or provider effects. Keep the candidate dispatch trust checks intact.
7. Record actual deployment targets, provider integration, health checks, and recovery in the owning project docs.
   Record environment variable names and permission readiness in their owning docs.
   Prevent provider-native PR or push triggers from bypassing the required checks. Do not infer readiness or activation from the blueprint policy.
8. Verify hosted PR updates, metadata edits, base edits, merge groups, and candidate dispatches. Verify that ordinary branch pushes produce no validation run.
   Exercise blocked evidence and deployment selection with the project's authorized integration. Local source assertions do not prove hosted behavior.

If branch protection is unavailable, use this manual merge checklist instead of assuming automatic enforcement:

- Verify a successful PR Contract for the latest PR metadata.
- Verify successful Fast Gate and Full Gate code results for the current PR revision and base.
- For release PRs, verify Release Candidate Gate too.
- Reject pending, missing, failed, skipped, or canceled required code results. Metadata-only success is not code evidence.

No paid GitHub feature is required by these workflows. Local tests do not prove hosted enforcement, cancellation, or billed-minute savings.
Project-specific per-test selection remains outside these defaults.

## Required Care

- Keep GitHub-specific files derived from canonical docs and scripts.
- Do not make GitHub the only place a rule exists.
- If a check fails often for unclear reasons, improve the repository script or documentation rather than weakening branch protection.
- Do not put secrets or private operational data in PR templates, workflow logs, or public check annotations.
- CODEOWNERS is a review-routing tool, not a substitute for server-side authorization, tests, or release evidence.
