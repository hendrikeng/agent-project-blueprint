# Project Context Index

Status: generated
Owner: {{DOC_OWNER}}
Last Updated: {{LAST_UPDATED_ISO_DATE}}
Source of Truth: AGENTS.md, docs/product-specs/CURRENT-STATE.md, and unfinished plan files.
Input SHA256: b745c49945ee0a6038e0528f8d3a793a706d70a4b50ab267a9ea323874738a1c

## Start Here

Read `AGENTS.md` and `docs/product-specs/CURRENT-STATE.md`, then the requested plan and nearest live code.
Snapshot verification date: {{CURRENT_STATE_DATE}}. This is a human-maintained claim, not proof of live behavior.
Snapshot SHA256: a90083fca8e68f990cbb3344e3a043df6bb35843bbe968159398d1e5f32918e3
Do not load historical plans, raw logs, or every policy file by default.
This index describes recorded work. It does not authorize execution or prove that an undocumented feature exists.

## Active Work

No unfinished plans in `docs/exec-plans/active`.

## Proposed Work

No unfinished plans in `docs/future`.

A draft is plan-only. Read the complete plan, dependencies, approvals, and current user request before implementation.
Completed work is excluded. If a shipped feature remains in the queue, reconcile it against code and evidence before acting.

## Resume And Close

Use the active plan's single continuation section for decisions, approvals, changed paths, validation, blockers, and next action.
Replace obsolete product-state statements and remove resolved gaps. Move completed plans out of the active queue.
Regenerate with `npm run context:compile`. Verify without writes with `npm run context:check`.
