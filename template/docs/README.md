# Documentation Guide

Status: canonical
Owner: {{DOC_OWNER}}
Last Updated: {{LAST_UPDATED_ISO_DATE}}
Source of Truth: This document.

## Entry Points

Start with `AGENTS.md` and `docs/product-specs/CURRENT-STATE.md`. Read other files when the task touches their surface.
`docs/MANIFEST.md` is the complete compatibility map. It is not a startup reading list.

| Need | Read |
| --- | --- |
| Product direction | `VISION.md` |
| Current behavior and gaps | `docs/product-specs/CURRENT-STATE.md` |
| Unfinished work | `docs/generated/AGENT-RUNTIME-CONTEXT.md`, then the selected plan |
| Plan lifecycle | `docs/PLANS.md` |
| Any code change | `docs/design-docs/ENGINEERING-INVARIANTS.md` |
| Structure and dependencies | `ARCHITECTURE.md`, `docs/architecture/README.md` |
| Frontend or backend work | `docs/FRONTEND.md`, `docs/BACKEND.md` |
| Security, privacy, collection, logging, analytics, or exports | `docs/SECURITY.md` |
| Failure behavior and recovery | `docs/RELIABILITY.md` |
| Environment and configuration | `docs/env/README.md` |
| Deployment, rollback, and health verification | `docs/deploy/README.md` |
| API contracts | `docs/BACKEND.md`, `docs/ops/api/README.md` |
| Persistence and migrations | `docs/BACKEND.md`, `docs/generated/db-schema.md` |
| UI conventions | `docs/ui/README.md`, `docs/design-docs/UI-STANDARDS.md` |
| Repository policy and gates | `docs/governance/README.md` |
| Agent continuation and tools | `docs/agent-hardening/README.md` |
| Operations and releases | `docs/ops/README.md` |

## Authoring Rules

Keep one owner per fact. Replace obsolete statements. Remove resolved gaps and move finished plans to history in the same change.
The snapshot summarizes product capabilities; domain docs contain details; completed plans preserve delivery evidence.
Keep a domain doc only when it records project-specific facts or decisions. Use an explicit not-applicable note for absent surfaces.
Do not create a new document for each small change. Add a short section to the existing owner when needed.
Size limits use UTF-8 bytes, including long single lines. See `docs/governance/doc-checks.config.json`.
Move detailed reference material out of startup context. Splitting a log into many live docs does not make it current.
Update verification dates only after checking facts. Dates and hashes cannot prove that behavior remains correct.
Keep secrets and personal machine paths out of tracked documentation.
