# Agent Operations

Status: canonical
Owner: {{DOC_OWNER}}
Last Updated: {{LAST_UPDATED_ISO_DATE}}
Source of Truth: This document and linked docs in this folder.

## Why This Exists

Preserve task context, trustworthy validation, and permission boundaries across sessions and agents.
Load these references when their workflow applies. Do not load the entire folder at startup.

## Canonical Documents

- Working loop: `docs/agent-hardening/AGENT_LOOP.md`
- Continuation: `docs/agent-hardening/MEMORY_CONTEXT.md`
- Delegation: `docs/agent-hardening/RUN_CONTROL.md`
- Tools: `docs/agent-hardening/TOOL_POLICY.md`
- Evidence: `docs/agent-hardening/OBSERVABILITY.md`
- Model/runtime evaluation: `docs/agent-hardening/EVALS.md`

## Instruction Discovery During Adoption

Keep `AGENTS.md` as the canonical repository entrypoint. Inspect the installed client's instruction discovery and effective context.
Codex can load ancestor instructions and a nearer `AGENTS.override.md`. Account for those instructions during adoption.
Claude Code can load `AGENTS.md` directly, but existing project or ancestor `CLAUDE.md`, `.claude/CLAUDE.md`, and `CLAUDE.local.md` can suppress that default.
Claude Code does not directly load `AGENTS.override.md`. Keep shared rules in the canonical entrypoint and verify any client-specific overrides.
If direct discovery is unavailable, import `@AGENTS.md` from the project's `CLAUDE.md`. Preserve existing project-specific instructions.
Use Claude Code's `/context` or the client's equivalent inspection to verify loading. Do not copy the policy into each provider file.
Read the current official [Codex discovery guide](https://learn.chatgpt.com/docs/agent-configuration/agents-md) and [Claude memory guide](https://code.claude.com/docs/en/memory).

## Enforcement

agent:verify checks document structure. It does not prove agent behavior.
eval:integrity checks configuration and current input identity without granting a behavioral pass.
eval:verify remains the strict readiness gate for evaluated agent systems.
