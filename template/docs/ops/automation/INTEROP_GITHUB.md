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
- The generic `ci` workflow calls `pr:verify`, `plans:verify:closeout`, `verify:fast`, `verify:full`, and `release:verify`; add service-specific preview/deploy workflows only after documenting them in ops docs.
- The generic release-tag workflow tags merged `release/YYYY.MM.DD.N` PRs into `main` as `vYYYY.MM.DD.N`.

## Branch And PR Lanes

- `slice/* -> dev`: planned implementation slice using the slice PR template.
- `fix/* -> dev`: small, isolated, low-risk fix using the fix PR template.
- `release/YYYY.MM.DD.N -> main`: release promotion using the release PR template.
- Repositories that use different branch names must update workflow YAML, PR verification, release docs, and this mapping together.

## CI Budget Defaults

The starter CI runs on PRs to `dev` and `main`, pushes to those branches, and merge groups targeting `main`.
Feature branches run CI through their PRs, not through a second push run. New runs cancel older runs for the same PR or ref.
The check names remain `Fast Gate`, `Full Gate`, and `Release Candidate Gate`.

`scripts/ci/classify-change.mjs` selects explicit product, docs, harness, or broad fast validation.
Product changes run the declared fast project commands. Docs changes run documentation and safety checks without product or harness test suites.
Harness changes run harness regression tests and agent readiness checks.
Every code scope retains strict eval evidence, governance, path policy, plan closeout, quality, and harness alignment checks.
Unknown, deleted, mixed, shared-configuration, and sensitive changes select broad fast validation.

Full validation runs for selected candidates, PRs to `main`, `main` pushes, and `main` merge groups. Dev pushes run fast validation only.
Standalone `npm run verify:full` includes broad fast verification. CI uses `--skip-fast` only after successful broad fast verification in the same job.
Strict eval and agent checks belong to fast verification, so full verification does not repeat them.
Full Gate aggregates the selected checks and rejects failed, skipped, or canceled required jobs. Its compatibility name does not imply full-suite execution on every PR.

PR edits and ready-for-review events run `PR Contract` without suites. Metadata jobs use different names and cannot replace code-check evidence.
Missing code evidence remains missing. Base edits run code validation again. Metadata cancellation groups cannot cancel code runs.
PRs to `main` and merge groups retain release checks. Cache placeholders remain unused.

### Selected Candidate Proof

`.github/workflows/ci-candidate.yml` accepts a required lowercase 40-character `revision` SHA through `workflow_dispatch`.
The dispatch must use the repository default branch. The selected revision must be an ancestor of `origin/dev`.
The run name is `CI candidate <revision>`. Only successful full validation produces the artifact `ci-candidate-<revision>`.
Its `evidence.json` contains string fields `revision`, `repository`, `run_id`, and `run_attempt`.

Before deployment, verify the workflow path, dispatch event, trusted default-branch ref, and successful conclusion.
Then compare the artifact with the GitHub run identity.
Compare the evidence revision with the exact selected deployment revision. Reject missing, expired, failed, canceled, or mismatched evidence before secrets or provider effects.
Do not trust the run title alone. This template adds no automatic deployment.

### Adoption in Existing Projects

Workflows, `docs/governance/project-gates.json`, and `scripts/ci/**` are project-owned. A harness sync does not apply these defaults to existing applications.

1. Review the starter workflow changes against the local workflow and branch rules.
2. Adopt the classifier, workflows, and scoped orchestrators together.
3. Adapt explicit risk categories to the project. Keep unknown and sensitive paths broad.
4. Keep every project gate and its required commands at the documented fast, candidate, or release boundary.
5. Require PR Contract, Fast Gate, and Full Gate in branch protection. Require Release Candidate Gate for release PRs.
6. Add exact candidate proof checks to the project deployment entry point before any provider effects.
7. Verify hosted runs for PR updates, metadata edits, base edits, dev/main pushes, merge groups, and candidate dispatches.

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
