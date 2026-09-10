# Governance Rules

Status: canonical
Owner: {{DOC_OWNER}}
Last Updated: {{LAST_UPDATED_ISO_DATE}}
Source of Truth: This document.

## Core Rules

- Canonical docs are source-of-truth for behavior and constraints.
- Correctness over speed for sensitive domains.
- Shared contracts/primitives are canonical.
- Server-side authority for critical invariants.
- No fabricated production behavior paths.
- Keep architecture boundaries enforceable.
- Keep agent hardening policy canonical from bootstrap.
- Keep security and data-safety controls explicit.
- Docs are part of done.
- Root `README.md` is a concise orientation surface, not a rolling delivery log; detailed current behavior belongs in `docs/product-specs/CURRENT-STATE.md` and domain docs.
- Harness-defined canonical framework docs under `docs/` use uppercase basenames with lowercase `.md`; folder entrypoints remain `README.md`, and newly created repo-local docs stay lowercase unless explicitly promoted into the canonical harness contract.
- Canonical docs must remain environment-agnostic: no personal machine paths, hostnames, credentials, or private runbooks.
- `docs/governance/policy-manifest.json` is the machine-readable policy source for runtime context compilation.
- `docs/governance/project-gates.json` is the machine-readable source for real project-specific lint, typecheck, test, build, migration, browser, release, and deploy gates.
- `docs/agent-hardening/RUN_CONTROL.md` defines how runtime-native goals, subagents, handoffs, hooks, guardrails, traces, and background runs plug into repo-local policy without becoming a mandatory orchestration layer.
- Runtime-native execution features are replaceable adapters; repo-local plans, checks, and evidence are the durable control plane.

## Planning and Scope

- Non-trivial work must be planned before implementation.
- One executable slice maps to one future or active plan; split broader initiatives into ordered slices with explicit dependencies.
- Use `docs/future/` before implementation when work crosses domains, changes architecture or critical invariants, requires staged rollout, is expected to span multiple sessions or PRs, or carries medium/high risk.
- Direct active execution is acceptable only for isolated, low-risk fixes with one focused acceptance surface.
- If direct work expands beyond that boundary, stop and create or promote a future slice before continuing.
- Plans must keep `## Already-True Baseline`, `## Must-Land Checklist`, and `## Deferred Follow-Ons` separate so merge scope stays explicit.

## Branch and Merge Discipline

- Do not switch branches or worktrees unless the user explicitly requests it in-thread.
- Prefer short-lived slice branches and PR review for shared-repository work.
- Atomic commits are allowed as slice-local checkpoints and review aids inside a checkout; they are not a substitute for branch policy when a repo defines one.
- For shared repositories, use branch classes as the coordination surface: `slice/*`, `fix/*`, and `release/*`.
- Repo-specific `dev`, `main`, release branch, or merge-strategy rules must be documented in repo-local ops docs before they are treated as mandatory.
- Merge-ready slices should close or update their active plan state and preserve review evidence in completed plans or evidence docs.

## Documentation Discipline

- Docs are part of done for behavior, workflow, architecture, and critical invariant changes.
- Root `README.md` is a concise orientation and current top-level scope surface, not a delivery log or exhaustive docs index.
- Detailed current behavior belongs in current-state, domain, governance, design, automation, or evidence docs.
- Historical/archive material is not canonical unless it is explicitly promoted into a canonical doc.
- Do not duplicate full navigation into `README.md` or `AGENTS.md`; keep `docs/README.md` as the documentation index.

## Execution Quality

- Translate implementation requests into verifiable goals before editing.
- For multi-step work, pair each planned step with the check that proves it.
- Use runtime-native goal and loop features when useful, but keep the durable goal contract, handoff evidence, and completion audit in the repository.
- Preserve a continuation packet before pause, context compaction, background handoff, or agent handoff.
- Prefer the smallest implementation that satisfies the must-land checklist, and keep every changed line traceable to the user request, active plan, or required validation.
- State material assumptions when intent has multiple plausible interpretations; ask or stop rather than silently choosing a risky path.

## Project Gate Discipline

- Every adopted project must declare real lint, typecheck, unit-test, and build gates or fail bootstrap verification.
- Optional gates such as integration tests, migration integrity, browser smoke, security audit, release verification, and deployment verification must be either wired to a real command or marked `deferred`/`not-applicable` with a concrete rationale.
- Gate commands must call the real project toolchain; no no-op commands, recursive aggregate commands, or unresolved placeholders.
- Standalone `verify:fast` runs broad fast verification. CI can select explicit product, docs, or harness scopes while retaining mandatory safety checks.
- `verify:full` includes broad fast verification and all full project gates. CI can skip fast only after successful broad fast verification.
- Full CI runs for broad or harness PRs, exact selected candidates, and main/release boundaries, not on ordinary dev pushes.
- Project-owned classifiers must keep unknown, deleted, shared-configuration, and sensitive changes broad.
- Metadata-only checks cannot replace code evidence. Base edits require code validation again.
- The CI scope and deployment proof contract lives in `docs/ops/automation/INTEROP_GITHUB.md`.
- Gate status must be truthful. A missing test harness is `deferred`, not a fake required command.
- Deployment, migration, and release gates must be added before the project treats those surfaces as production-ready.

## Policy Surface Model

- Live canonical policy can define engineering rules: root canonical Markdown, top-level docs, agent hardening, architecture, design docs, governance, ops workflow docs, product-state docs, UI docs, machine-readable governance, and harness scripts/checks.
- Supporting local guidance is subordinate: feature references and runtime-specific notes may summarize or link, but they do not override canonical docs.
- Historical evidence is audit material: completed plans and evidence indexes may be corrected for metadata and links, but they are not rewritten into current policy.
- Generated artifacts are rebuilt from canonical sources; do not hand-edit generated outputs to add policy.
- When improving a rule, tighten the canonical owner first, then update generated context and enforcement checks if the rule is machine-readable.
- Machine-readable config must satisfy its adjacent schema when one exists.
- Schema changes and verifier changes belong in the same slice as config shape changes.

## Scoped Plan Closeout

Closeout checks the delivered change, not every unfinished task in the repository.
Unchanged inherited active plans can remain on `dev` and `main`. Their index and worktree bytes must match the comparison baseline.
New or changed active plans must complete before delivery. Removed active plans require completed plans with the same Plan-IDs and matching evidence.
Completed plans need completed status, checked must-land IDs, resolved required approval, and nonempty changed evidence.
The checker validates the worktree and index separately. Unstaged repairs cannot authorize an incomplete staged closeout.

PRs retain their source-branch classification. Protected-branch deliveries retain the path-based low-risk fix exemption. Sensitive changes still require completed plans.
Local feature iteration does not require premature closeout. CI or an explicit comparison baseline checks delivery from feature branches.
A pending merge uses its pre-merge HEAD. An ordinary local commit uses its first parent.
CI uses verified GitHub event identity and the PR base, merge-group base, or pre-push commit, including attached checkouts.
An explicit `PLAN_CLOSEOUT_BASE_REF` must resolve to a real pre-change ancestor. Missing history, ambiguous merges, and empty HEAD comparisons fail closed.
Historical merge receipts remain audit records. The checker does not reuse them as permission for later work.

## Exception Discipline

- Exceptions must name owner, reason, scope, expiry, and follow-up.
- Exceptions must live in plans, evidence indexes, or governance config; they must not live only in chat or PR prose.
- Expired exceptions block completion until resolved, renewed with justification, or converted into an explicit future slice.

## Verification Profiles

- Fast iteration profile: `npm run verify:fast`
  - Scope-aware checks + mandatory safety checks.
- Full candidate and release profile: `npm run verify:full`
  - `node ./scripts/automation/compile-runtime-context.mjs`
  - `node ./scripts/docs/check-governance.mjs`
  - `node ./scripts/check-article-conformance.mjs`
  - `node ./scripts/architecture/check-dependencies.mjs`
  - `node ./scripts/agent-hardening/check-agent-hardening.mjs`
  - `node ./scripts/agent-hardening/check-evals.mjs`
  - `node ./scripts/automation/check-harness-alignment.mjs`
  - `node ./scripts/automation/check-plan-metadata.mjs`
  - `node ./scripts/automation/check-project-gates.mjs`
- Relevant domain tests remain required for changed behavior.
