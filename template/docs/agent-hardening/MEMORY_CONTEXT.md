# Context And Continuation

Status: canonical
Owner: {{DOC_OWNER}}
Last Updated: {{LAST_UPDATED_ISO_DATE}}
Source of Truth: This document.

## Context Budget Rules

Read `AGENTS.md` and the current-state snapshot first. Add the requested plan, relevant code, and focused evidence.
Load other docs only when they explain a touched boundary or unresolved decision.
Historical plans and logs do not enter routine startup context.

## Persistence Rules

Maintain one continuation section in the active plan for multi-session work:

- Objective and remaining acceptance items.
- Decisions and assumptions that cannot be recovered from code.
- Valid approvals, denied actions, scope, and expiry when applicable.
- Changed paths and validation results.
- Blocker, next action, and evidence references.

Replace this section after material scope, approval, validation, or blocker changes, and before handoff. Do not append a session diary or raw transcript.
On resume, reconcile it with the latest user request, Git status and diff, and relevant evidence. Repeat only checks invalidated by changes.
Never persist secrets or private reasoning traces.

## Improve Before Re-Architecture

Fix stale specs and oversized plans before adding a memory service.
Current-state specs describe what exists. Plans describe remaining work. Completed records describe history.
Before archiving a plan, reflect enduring decisions in their current canonical owner. Do not leave required context only in history.

## Do Not Add Yet

Do not add a memory database, scheduler, or agent-specific policy fork without a demonstrated need.

## Consider Bigger Changes Later

If repository context repeatedly fails to support recovery, measure the failure before adding infrastructure.

## Safe Rule

Keep the repository sufficient for a fresh agent to resume. Runtime memory can help, but cannot authorize actions or replace evidence.

## Provenance and Redaction

Use exact code, test, plan, and artifact references. Redact sensitive payloads.
When a fact becomes obsolete, replace it in the current owner rather than adding a contradictory note elsewhere.
