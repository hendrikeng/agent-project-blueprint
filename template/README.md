# {{PRODUCT}}

Status: canonical
Owner: {{DOC_OWNER}}
Last Updated: {{LAST_UPDATED_ISO_DATE}}
Source of Truth: This document delegates to linked canonical docs.
Current State Date: {{CURRENT_STATE_DATE}}

{{SUMMARY}}

## Product Scope

- {{SCOPE1}}
- {{SCOPE2}}
- {{SCOPE3}}

Current behavior and known gaps: `docs/product-specs/CURRENT-STATE.md`.
Direction: `VISION.md`. Structure: `ARCHITECTURE.md`.

## Operating Model

Start with `AGENTS.md` and the current-state snapshot. Read only task-relevant code, plans, and docs.
Use a compact plan for risky, broad, or multi-session work. Bounded low-risk fixes can use the PR as their record.
Runtime-native execution is optional. Repository state must remain sufficient for another agent to resume.
The queue is docs/future/ -> docs/exec-plans/active/ -> docs/exec-plans/completed/.

## Stack

- Frontend: {{FRONTEND_STACK}}
- Backend: {{BACKEND_STACK}}
- Data: {{DATA_STACK}}
- Shared contracts: {{SHARED_CONTRACT_STRATEGY}}

## Documentation Navigation

Use `docs/README.md` for task-based navigation and `docs/MANIFEST.md` for the installed inventory.
Use `docs/generated/AGENT-RUNTIME-CONTEXT.md` to find unfinished plans. It is a generated index, not product truth.

## Enforcement and Quality Gates

- Focused iteration: run the relevant project command.
- Repository consistency: npm run verify:fast.
- Delivery candidate: npm run verify:full.
- Documentation and size budgets: npm run docs:verify.
- Refresh context after state or plan changes: npm run context:compile.
- Eval integrity: npm run eval:integrity.
- Agent activation after model, prompt, or tool changes: npm run eval:verify.

Declare real project commands in `docs/governance/project-gates.json`.
Deferred or inapplicable checks need a concrete rationale. Generic harness checks do not prove product behavior.
Bootstrap helpers are temporary. Run npm run bootstrap:cleanup after configuration and verification.

## Documentation Updates

Replace obsolete statements instead of appending a delivery log.
Keep the current-state snapshot short. Put detailed behavior in a linked domain spec.
On completion, remove resolved gaps, move the plan to completed, and refresh the generated index.
Preserve historical evidence. Never delete it merely to meet a context budget.
