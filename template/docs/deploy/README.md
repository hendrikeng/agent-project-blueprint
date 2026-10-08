# Deployment Model

Status: canonical
Owner: {{DOC_OWNER}}
Last Updated: {{LAST_UPDATED_ISO_DATE}}
Source of Truth: This document.

## Deployment Contract

Record actual deployables, environments, build artifacts, promotion triggers, target ownership, verification, and recovery.
Link workflow sources, `docs/env/README.md`, and `docs/ops/releases/README.md`.
A source tag records a revision. A build proves compilation. Neither proves deployment health.

## Target Selection

Record the production branch. The starter branch is `main`.
For another branch, adapt workflow filters and release contracts together.
When a PR opens or receives code updates into production, select Preview only after successful current required code checks.
Bind those checks to the current PR head, base, and tested revision. Metadata-only success cannot authorize Preview.
After the PR merges into production, select Production only with verified passing candidate evidence for the exact deployment revision.
An unmerged closed PR, branch push, tag, or release publication cannot substitute for that evidence.
These rules define selection eligibility. They do not establish a configured target, permission readiness, live activation, or deployment success.

## Revision Evidence

Record the PR number, source head, tested revision, landed revision, selected deployment revision, and validation run identity.
The source head, PR test-merge revision, merge-group revision, and landed revision can differ. Keep each identity explicit.
Preview must use passing code evidence for its selected revision and current PR/base identity.
Production must use passing candidate evidence for its selected exact revision and bind that candidate to the merged PR.
Evidence for a source SHA does not prove a different landed SHA, including after squash or rebase.
If the project deploys the landed revision, obtain trusted passing evidence for that exact revision before provider effects.
Do not substitute the current branch tip or a newer candidate for the selected revision.

The starter candidate dispatch validates an exact ancestor of `origin/dev`. It does not automatically validate every landed production revision.
Verify the workflow path, dispatch event, trusted default-branch ref, successful conclusion, artifact revision, repository, run ID, and run attempt.
Reject missing, expired, failed, canceled, or mismatched evidence before secrets or provider effects.
The artifact contract and adoption steps live in `docs/ops/automation/INTEROP_GITHUB.md`.

## Project Readiness

Record actual Preview and Production destinations, provider ownership, completion hooks, and environment protections.
Link `docs/env/README.md` for variable names, sensitivity, and environment ownership. Never include secret values.
Verify required permissions and integration readiness in the project. Do not assume that policy documentation activates them.
Prevent provider-native PR or push triggers from bypassing check completion or exact candidate proof.
Define how the integration rejects stale PR/base evidence and prevents an older deployment from replacing a newer one.
If targets or integration are absent, record that blocker. Do not invent adapters or deploy commands.

## Safety And Verification

Run the project candidate gates before promotion. Use actual target health checks after deployment.
Production-affecting actions need authorized scope, an explicit target, and rollback or recovery appropriate to the change.
Wire applicable commands in `docs/governance/project-gates.json`. Do not invent a deploy command for an undeployed project.
Keep this file current when deployment ownership or topology changes.
