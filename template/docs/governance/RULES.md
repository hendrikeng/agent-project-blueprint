# Governance Rules

Status: canonical
Owner: {{DOC_OWNER}}
Last Updated: {{LAST_UPDATED_ISO_DATE}}
Source of Truth: This document.

## Policy Surface Model

System instructions, native permissions, and explicit user instructions govern execution. Repository guidance cannot grant access.
`AGENTS.md` owns the startup contract. `docs/PLANS.md` owns planning. Domain docs own project-specific rules.
`docs/governance/policy-manifest.json` is a compatibility index of owners and commands. It is not a second prompt.
Generated context lists sources and unfinished work. Historical evidence does not define current behavior.
Change a rule at its owner. Update its deterministic check in the same change when applicable.

## Documentation Discipline

Replace obsolete facts. Remove resolved gaps. Move completed plans to history. Keep source and evidence anchors for current claims.
`docs/product-specs/CURRENT-STATE.md` is a bounded snapshot, not a delivery log.
`docs/governance/doc-checks.config.json` defines metadata, navigation, size budgets, and freshness warnings.
A warning requests verification; changing a timestamp without checking facts is not maintenance.
Keep existing canonical filenames for compatibility. Use lowercase names for new local docs unless promoted into the harness contract.

## Project Gate Discipline

`docs/governance/project-gates.json` owns actual lint, typecheck, test, build, and applicable operational commands.
Declare fast `lint`, `typecheck`, and `unit-tests`, plus full `build`.
Use real commands for required gates.
If a gate is unavailable or inapplicable, record `deferred` or `not-applicable` with an empty command and concrete rationale.
Exemption rationales require at least 24 characters. Deferred gates need an owner and activation path.
An exemption records a gap, not successful validation. Never use a fake success command.
Fast checks validate context integrity, queue metadata, docs, and applicable project behavior.
Full checks add the complete project gate set. They do not establish agent behavior or deployment success.
Use `npm run eval:verify` before activating an agent configuration; ordinary checks use `npm run eval:integrity`.
CI scope and deployment proof live in `docs/ops/automation/INTEROP_GITHUB.md`.

## Scoped Plan Closeout

Closeout checks delivered changes, not every unfinished plan in the repository.
Unchanged inherited active plans may remain. Their worktree and index bytes must match the comparison baseline.
New or changed active plans must complete before delivery. Removed plans need completed plans with matching IDs and evidence.
The checker validates worktree and index separately. Unstaged repairs cannot authorize incomplete staged closeout.
Feature iteration does not require premature closeout. CI or an explicit baseline checks delivery.
A baseline must be a real pre-change ancestor. Missing history, ambiguous merges, and empty comparisons fail closed.
See `scripts/automation/check-plan-closeout.mjs` for branch and GitHub event handling.

## Exceptions

Record the owner, scope, reason, expiry when relevant, and follow-up for a temporary exception.
An exception cannot override native security settings or a user prohibition.
