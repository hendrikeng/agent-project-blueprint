# Execution Plans

Status: canonical
Owner: {{DOC_OWNER}}
Last Updated: {{LAST_UPDATED_ISO_DATE}}
Source of Truth: This document.

## Required Metadata

Each queue or completed plan has a `## Metadata` section with these fields:

| Field | Contract |
| --- | --- |
| Plan-ID | Unique lowercase kebab-case ID |
| Status | Future: draft or ready-for-promotion; active: queued, in-progress, in-review, validation, blocked, or budget-exhausted; history: completed |
| Priority | p0, p1, p2, or p3 |
| Owner | Responsible owner |
| Acceptance-Criteria | Concrete full completion criteria |
| Delivery-Class | product, docs, ops, or reconciliation |
| Dependencies | Plan-IDs, or none |
| Spec-Targets | Existing affected doc paths |
| Implementation-Targets | Actual code or artifact roots; required for product work |
| Risk-Tier | low, medium, or high |
| Validation-Lanes | always; add host-required for environment-bound checks |
| Security-Approval | not-required unless an explicit approval applies; pending or approved when it does |
| Done-Evidence | pending until complete; then real evidence paths |

Run `npm run plans:verify` to validate the metadata.

## Scope And Evidence

Use `## Already-True Baseline`, `## Must-Land Checklist`, and `## Deferred Follow-Ons`.
Checkboxes describe only remaining deliverables for this plan. Stable backticked IDs connect product claims to evidence.
Completed plans need `## Validation Evidence` and `## Closure`, completed status, checked deliverables, and valid evidence.
For a completed plan, set Done-Evidence to a nonempty changed file under `docs/exec-plans/evidence-index/`. Closeout and release checks require it. Keep this index thin: link the plan's concise validation results and any separate artifacts instead of copying them.
Use one replacement continuation section for an interrupted run. See `docs/agent-hardening/MEMORY_CONTEXT.md`.
The lifecycle and closeout command live in `docs/PLANS.md`. Do not leave finished plans in active work.
