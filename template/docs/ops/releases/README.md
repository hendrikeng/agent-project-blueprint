# Release Operations

Status: canonical
Owner: {{DOC_OWNER}}
Last Updated: {{LAST_UPDATED_ISO_DATE}}
Source of Truth: This document.

## Purpose

Define the release quality bar without binding the blueprint to one hosting provider or tracker.

## Release Contract

- A release candidate is a reviewed, verifiable change set, not a place to discover basic correctness.
- Release notes summarize included slices, user impact, migrations/backfills, environment changes, validation, and rollback or fix-forward expectations.
- Release gates must run repository scripts instead of duplicating policy in hosting-provider configuration.
- The default long-lived branches are `dev` and `main`. Additional branches, hosted test environments, and deployment conventions are project-specific.
- Release-only fixes must be mirrored back to the normal integration branch or explicitly tracked as follow-up debt.
- Explicit commit-to-plan mappings and required plan-free change mappings live in `docs/ops/releases/release-mapping.md`.

## Default Branch and CI Flow

```text
slice/* or fix/* -> PR -> dev -> release/YYYY.MM.DD.N -> PR -> main
```

Implementation PRs target `dev`. Release PRs target `main`, with title `Release YYYY.MM.DD.N` and completed-plan evidence.
Release fixes also return to `dev`.

CI runs scoped fast checks on PRs to `dev` and `main`, and on merge groups targeting `main`.
Ordinary branch pushes do not run validation.
Full checks run for broad or harness PRs, selected candidates, and main boundaries. Release PRs and the main merge queue also run release verification.
See `docs/ops/automation/INTEROP_GITHUB.md` for exact scopes and candidate proof.
These jobs run repository-defined checks. They do not deploy services or create hosted environments.
Required status checks and branch protection need project-specific GitHub configuration.

## Release and Source Tags

A merged release PR creates two annotated tags in one atomic push:

- `vYYYY.MM.DD.N`: the landed `main` revision.
- `source-vYYYY.MM.DD.N`: the original release head.

The workflow validates the date, positive release sequence, and PR title before it creates tags.
Reruns reuse annotated tags only when their commit identities match. Conflicting tags stop the workflow.
Merge commits, squash, and rebase do not require different tag conventions.
A tag records a revision, not deployment success.

Release PR verification reads the exact PR head. Release notes and verification prefer the previous source tag when one exists.
Older releases without a source tag retain their release-tag boundary.
Before the first release tag, the default base is `origin/main`. An explicit `--base` can select another boundary.
The merge queue verifies its proposed integration against `origin/main`.

For production-targeted PRs, successful current required code checks select Preview only.
After a PR merges into production, Production selection requires verified passing candidate evidence for the exact deployment revision.
Source, tested, and landed revisions remain distinct. Tags and release publication do not substitute for exact deployment proof.
See `docs/deploy/README.md` for identity, target readiness, verification, and recovery requirements.
The blueprint does not wire provider deployments. Projects implement applicable gates, completion hooks, credentials, and integration separately.
Staging, browser smoke checks, and multi-repository deployment coordination remain project-owned.

## GitHub Releases and Notes

After tagging, the same workflow creates a GitHub Release for `vYYYY.MM.DD.N`.
It uses the existing notes generator and links the release PR. No additional release pipeline is required.
The notes list completed slices, evidence, configuration changes, and migration files without unfinished template prompts.
Validation results remain in the linked evidence. Publication does not prove successful deployment or runtime health.

The workflow derives the landed predecessor from the merged release commits and uses its canonical release tag with the exact original PR head.
The source-tag boundary applies when available. The first release uses the landed predecessor commit instead.
If the predecessor belongs to an unpublished release, publication stops for a safe retry after the earlier release.
A generation failure stops before tagging. GitHub Release creation requires an existing verified tag.

A retry can create a missing GitHub Release after successful tagging. It preserves existing published release notes, including manual edits.
The workflow serializes release jobs. An existing draft or prerelease stops publication.
This workflow does not backfill historical releases. Operators retain control over user-facing wording and rollback guidance in the release PR.

## Release Mapping File

`docs/ops/releases/release-mapping.md` is lowercase because it is an operational ledger, not a canonical framework policy document. The script `scripts/automation/release-support-lib.mjs` reads it during `release:notes` and `release:verify`.

For every plan-free implementation commit, add a `standard-change` entry with the commit hash and rationale before release verification.
Ordinary PR or commit summaries do not supply machine-readable release mapping. Documentation-only commits do not require an entry.
For planned work, use an explicit ledger entry when commit metadata and completed plans do not supply the mapping.

## High-Risk Release Checks

- Database, migration, backfill, auth, payment, integration, environment, and security-sensitive releases need explicit owner review.
- Environment changes require documented variable names, target environments, rollout order, and verification evidence without exposing secret values.
- Rollback is required when practical; otherwise document the fix-forward path and the data/operator impact.
- Deployment verification must inspect the real target environment, not only local build success.

## Verification

- If release support is active, run `npm run project:gates:release` to execute all required release gates.
- Use `npm run release:verify` for the focused range and evidence check.
- Run `npm run release:notes` to draft release notes from completed plans and accepted mappings.
- Run `npm run verify:full` before release promotion.
- Run `npm run verify:deploy` for deployment health checks when a deployed target URL is available.
- Keep release evidence in PRs, completed plans, release notes, or the evidence index so a future agent can audit what shipped.

## Mapping Rules

- For planned work, prefer completed plan metadata and evidence indexes over manual mapping.
- Manual `Plan-ID` mappings must point to completed plans included in the release range.
- Manual `standard-change` mappings are only for small, low-risk fixes or operational commits with explicit rationale.
- Do not use release mapping to hide missing closeout, missing validation, or unresolved release risk.
