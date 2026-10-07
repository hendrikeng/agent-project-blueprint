# Backend Standards

Status: canonical
Owner: {{DOC_OWNER}}
Last Updated: {{LAST_UPDATED_ISO_DATE}}
Source of Truth: This document.

## Current Stack

- {{BACKEND_STACK}}
- {{DATA_STACK}}

During adoption, identify the owning manifest, lockfile, framework configuration, and local conventions through the entry points below. Those sources define supported versions and project practices.

## Backend Quality Bar

Name the actor, authorization boundary, input validation, persistence contract, and response for each write.
Keep handlers small and follow existing services and data-access patterns. Avoid introducing layers without a concrete need.
Align changed schemas, migrations, producers, consumers, and validation in the same change, or document a staged compatibility path.
Use transactions, idempotency, timeouts, retries, and recovery where failure can leave inconsistent state.
After writes, update or invalidate affected caches, projections, summaries, and notifications when applicable. Define how failed derived-state updates recover.
For critical mutations, preserve the required actor and change audit trail. Redact sensitive payloads.
For long-running work and failure recovery, read `docs/RELIABILITY.md` and apply its lifecycle contract.
Do not alter an applied shared migration without an explicit repair plan. Review data-changing jobs for target selection and cleanup.
Prove changed authorization, validation, persistence, and integration behavior at the smallest reliable surface.
Database source and regeneration notes belong in `docs/generated/db-schema.md`; API operations belong in `docs/ops/api/README.md`.

## Current Workspace Entry Points

- {{BACKEND_ENTRYPOINT_1}}
- {{BACKEND_ENTRYPOINT_2}}
