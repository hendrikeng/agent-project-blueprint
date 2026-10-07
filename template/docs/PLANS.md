# Plans And Closeout

Status: canonical
Owner: {{DOC_OWNER}}
Last Updated: {{LAST_UPDATED_ISO_DATE}}
Source of Truth: This document routes planning work to the detailed contracts under `docs/future/` and `docs/exec-plans/`.

## Choose A Path

For a bounded low-risk change, use the PR or commit summary as the record.
For a plan-free code fix, add an explicit `standard-change` entry to [the release ledger](ops/releases/release-mapping.md).
The release verifier does not parse ordinary PR or commit rationale as release mapping.
Routine README or current-state maintenance does not require a plan by filename alone.
Policy, tooling, dependencies, and sensitive domain changes conservatively require closeout on standard branches.
Inspect `scripts/automation/plan-closeout-lib.mjs` before relying on the no-plan path.
Use one plan for risky, cross-domain, staged, or multi-session work.
Planning-only requests do not authorize implementation. An implementation request permits necessary planning without a separate promotion approval.

## Lifecycle

1. Draft proposed work in docs/future/ when execution is not yet authorized or ready.
2. Move an authorized executable plan to docs/exec-plans/active/.
3. Maintain the remaining checklist and one continuation section during execution.
4. Run focused checks. Run required delivery gates before publication.
5. Update current-state and affected contracts in place. Remove resolved gaps and obsolete limitations.
   Before archiving, put enduring decisions in their current canonical owner with source or decision anchors.
6. Move the plan to docs/exec-plans/completed/ and retain concise validation evidence.
7. Run npm run context:compile. Finished plans must disappear from the unfinished-work index.

Do not create a future file, active file, session log, and evidence narrative for the same small change.
If implementation is complete but checks or review remain pending, retain the active plan in `validation` or `in-review`.
Checked deliverables alone do not establish completed closeout.
Do not delete historical records to reduce startup context. Keep them outside routine reading.

## Plan Contract

Use the existing metadata contract in `docs/exec-plans/README.md`.
Keep Already-True Baseline, Must-Land Checklist, and Deferred Follow-Ons separate.
Use stable checklist IDs. Do not copy whole specs, source files, or test output into plans.
A small plan usually needs 50–120 lines. The byte budget catches oversized single-line prose too.
