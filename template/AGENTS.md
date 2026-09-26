# AGENTS.md

Status: canonical
Owner: {{DOC_OWNER}}
Last Updated: {{LAST_UPDATED_ISO_DATE}}
Source of Truth: This document delegates to linked canonical docs.

This file is the agent and human entrypoint map for repository behavior.
If instructions conflict, this file is the behavioral priority entrypoint.

## Operating Model

- Docs-first minimal: this file is a concise map, not an execution playbook.
- `VISION.md` defines durable product direction; this file defines repository operating rules.
- Humans define scope, constraints, owners, and acceptance criteria.
- Agents execute scoped tasks using repo-local docs, code, and checks.
- Runtime-native goals, subagents, handoffs, hooks, guardrails, traces, and background runs are optional execution machinery, not harness requirements.
- Non-trivial work is planned in `docs/future/` before implementation.
- Promotion, execution, review, and closeout are repo-local.

## Agent Handout

- Treat the repo as the operating system for engineering work.
- Load `VISION.md`, the current scope, relevant docs, and nearest live code before editing.
- Use the loop in `docs/agent-hardening/AGENT_LOOP.md`: vision, rules, code, plan, build, check, fix, evidence, close.
- Translate the request into acceptance criteria and the smallest proof that would make the result trustworthy.
- Keep plans, docs, validation output, PR context, and evidence in-repo.
- Use one executable slice per plan file.
- Keep future and active `## Must-Land Checklist` items as explicit checkboxes with stable backticked IDs.
- Do not invent product behavior, schema, architecture, or workflow unsupported by code, docs, or explicit user intent.
- Runtime-specific notes are subordinate to this file and canonical docs.

## Default Read Order

For implementation work, inspect live repo surfaces before planning from docs:

- `VISION.md` and this `AGENTS.md`
- nearest live route, component, service, API handler, job, script, or domain module
- shared UI primitives, helpers, repository abstractions, adapters, and validation used by that surface
- related queries, migrations, schemas, tests, constants, and generated types
- repo-local docs when code does not explain intent, workflow, or acceptance criteria

Prefer established local patterns over new abstractions. If no strong example exists, stop and ask before inventing a repository-wide pattern.

## Intent Precedence

- Explicit user intent is binding.
- Within an approved implementation scope, make reasonable, reversible implementation choices using established repository patterns. State material assumptions and continue through implementation, focused validation, fixes, and evidence. Ask only when missing information materially changes the requested outcome, scope, public contract, or authorization.
- Planning-only work belongs in `docs/future/`; do not edit product code for planning-only requests.
- Implementation begins only when the user asks to execute a slice or make a direct change.
- Small, isolated, low-risk fixes may use the `fix/*` lane when the PR is enough review evidence.
- High-risk workflow, harness, release, governance, environment, identity, payment, database, security, and privileged-write paths require planned closeout even if they start small.
- If direct work stops being small, isolated, or low risk, stop implementation and promote or create a future plan before continuing.

## Core Map

- Platform scope/status: `README.md`
- Product vision: `VISION.md`
- Architecture entrypoint: `ARCHITECTURE.md`
- Documentation index: `docs/README.md`
- Canonical docs manifest: `docs/MANIFEST.md`
- Golden principles: `docs/governance/GOLDEN-PRINCIPLES.md`
- Governance policy: `docs/governance/RULES.md`
- Machine-readable policy: `docs/governance/policy-manifest.json`
- Project gate contract: `docs/governance/project-gates.json`
- Agent hardening: `docs/agent-hardening/README.md`
- Agent loop: `docs/agent-hardening/AGENT_LOOP.md`
- Agent run control: `docs/agent-hardening/RUN_CONTROL.md`
- Quality scorecard: `docs/QUALITY_SCORE.md`
- Engineering invariants: `docs/design-docs/ENGINEERING-INVARIANTS.md`
- UI standards: `docs/design-docs/UI-STANDARDS.md`
- Frontend standards: `docs/FRONTEND.md`
- Backend standards: `docs/BACKEND.md`
- Security: `docs/SECURITY.md`
- Reliability: `docs/RELIABILITY.md`
- Git safety: `docs/design-docs/GIT-SAFETY.md`
- Plan lifecycle: `docs/PLANS.md`
- Execution plans: `docs/exec-plans/README.md`
- Engineering workflow: `docs/ops/automation/README.md`
- API operations: `docs/ops/api/README.md`
- Release operations: `docs/ops/releases/README.md`
- Manual queue workflow: `docs/ops/automation/LITE_QUICKSTART.md`
- Generated runtime context: `docs/generated/AGENT-RUNTIME-CONTEXT.md`

## Non-Negotiables

- Correctness over speed for `{{CRITICAL_DOMAIN_SET}}`.
- Server-side authority for `{{SERVER_AUTHORITY_BOUNDARY_SET}}`.
- No fake production success-path behavior.
- Shared contracts and shared UI primitives are canonical where applicable.
- Agent hardening policy in `docs/agent-hardening/*` is mandatory.
- `{{MONEY_AND_NUMERIC_RULE}}`

## Engineering Quality Bar

Every non-trivial code change should be reviewable as production engineering, not just a working patch:

- Behavior is grounded in live code, schema, docs, or explicit user intent.
- The data contract is explicit where data enters, changes trust level, or becomes user-visible.
- Ownership is clear across route control flow, shared logic, data access, UI primitives, scripts, jobs, and services.
- Failure states are designed, not incidental.
- The change avoids unnecessary abstraction, dead code, duplicate helpers, and wrappers that hide responsibility.
- Validation is proportional to risk and names the exact commands, tests, screenshots, manual checks, or evidence used.
- General rules live once in their canonical owner; supporting references summarize or link rather than forking policy.
- If the work cannot meet this bar in one slice, split the follow-up instead of landing a broad partially finished refactor.

## Critical Domain Invariants

{{DOMAIN_INVARIANT_AREA_1}}:
- {{DOMAIN_INVARIANT_1A}}
- {{DOMAIN_INVARIANT_1B}}

{{DOMAIN_INVARIANT_AREA_2}}:
- {{DOMAIN_INVARIANT_2A}}
- {{DOMAIN_INVARIANT_2B}}

{{DOMAIN_INVARIANT_AREA_3}}:
- {{DOMAIN_INVARIANT_3A}}
- {{DOMAIN_INVARIANT_3B}}

## Documentation Contract

Any change affecting architecture boundaries, critical invariants, team workflow, security, reliability, or user-visible behavior must update relevant canonical docs under `docs/`.
Update root `README.md` only when the change affects top-level product scope, stack, workflow, architecture, commands, or the major capability map.
Detailed behavior snapshots, delivery history, and slice-level product changes belong in `docs/product-specs/CURRENT-STATE.md`, relevant domain docs, completed plans, and evidence indexes.

Docs are part of done.

## Commit Traceability

- Git commits, PRs, completed plans, and evidence are the development history; do not maintain a per-commit changelog.
- Behavior or contract changes update the relevant canonical or current-state docs in the same commit. A genuinely unaffected small fix needs only a clear commit message.
- Planned work retains its `Plan-ID` and completion evidence.
- After committing, report the hash and subject, docs updated or why none were needed, and focused checks. A push creates no documentation.
- Generate release notes only at the release boundary.

## Git and File Safety

- Canonical policy location: `docs/design-docs/GIT-SAFETY.md`.
- Never edit `.env` or environment variable files.
- Never run destructive git/file commands without explicit written instruction.
- Do not use `git stash` unless explicitly requested.
- Do not switch branches or modify git worktrees unless explicitly requested.
- Treat atomic commits as optional slice-local checkpoints, not as team coordination on shared branches.

## Test and Validation Expectations

- Runtime context generation: `npm run context:compile`.
- Agent loop process: `docs/agent-hardening/AGENT_LOOP.md`.
- Agent loop contract verifier: `npm run agent:verify`.
- Agent readiness boundary and eval verifier: `npm run eval:verify`.
- Eval report refresh: `npm run eval:refresh`.
- Harness regression tests: `npm run harness:test`.
- Project gate declaration: `npm run project:gates:verify`.
- Iteration profile: `npm run verify:fast`.
- Merge profile: `npm run verify:full`.
- Queue and metadata hygiene: `npm run plans:verify`, `npm run harness:verify`.
- Canonical verification policy lives in `docs/governance/RULES.md`.
- Add or adjust tests for behavior changes when a stable test surface exists.
- Prefer a regression test for bug fixes.
- Critical flows require focused coverage or explicit evidence when automation is not yet available.

## If Unsure

Do not guess. Inspect the nearest live implementation and apply the safest explicit change.

Before closing a slice:
- remove unused imports, props, variables, and one-off helpers introduced during iteration
- prefer existing shared utilities and components over near-duplicate local helpers
- inline simple one-use helpers when that makes the flow easier to read
- remove wrappers that do not add layout, semantics, or logic
