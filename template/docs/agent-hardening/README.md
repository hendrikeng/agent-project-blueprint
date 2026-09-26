# Agent Hardening

Status: canonical
Owner: {{DOC_OWNER}}
Last Updated: {{LAST_UPDATED_ISO_DATE}}
Source of Truth: This document and linked docs in this folder.

## Why This Exists

- Agent quality, safety, and recovery rules must be explicit enough for a fresh agent or reviewer to enforce.
- Hardening policy is canonical from repository bootstrap and applies before project-specific runtime notes add local detail.
- This folder defines stack-agnostic contracts for the agent loop, run control, evals, observability, tool use, and memory/context behavior.
- The harness must optimize for durable outcomes: correct code, auditable decisions, resumable work, and fast recovery after interruption.
- Any agent workflow that cannot leave evidence, explain tool choices, or resume from repo-local context is not production-ready.
- The blueprint is not an orchestration runtime. Runtime-native goals, background runs, subagents, handoffs, hooks, guardrails, and traces are useful execution machinery, but repo-local plans, docs, checks, and evidence remain the durable control plane.

## Canonical Documents

- `docs/agent-hardening/AGENT_LOOP.md`
- `docs/agent-hardening/EVALS.md`
- `docs/agent-hardening/evals.config.json`
- `docs/agent-hardening/OBSERVABILITY.md`
- `docs/agent-hardening/RUN_CONTROL.md`
- `docs/agent-hardening/TOOL_POLICY.md`
- `docs/agent-hardening/MEMORY_CONTEXT.md`
- `docs/generated/evals-report.json`

## Enforcement

- Agent loop process: `docs/agent-hardening/AGENT_LOOP.md`.
- Agent loop contract verifier: `npm run agent:verify`.
- Agent activation boundary and eval verifier: `npm run eval:verify`.
- Eval report refresh: `npm run eval:refresh`.
- Iteration profile: `npm run verify:fast`.
- Merge profile: `npm run verify:full`.
- Runtime context build: `npm run context:compile`.

- `agent:verify`, `eval:refresh`, and `eval:verify` are required before merge.
- `eval:verify` checks content-addressed policy and fixture integrity, suite health, regression counts, and repository-local evidence.
- `context:compile` must run whenever canonical docs, policy manifests, plan conventions, or hardening rules change.
- High-risk changes must leave enough evidence for another agent to reproduce the decision path without relying on chat history.
- Exceptions require an owner, reason, expiry, and follow-up tracked in the relevant plan or evidence index.
