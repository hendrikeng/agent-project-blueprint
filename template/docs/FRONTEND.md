# Frontend Standards

Status: canonical
Owner: {{DOC_OWNER}}
Last Updated: {{LAST_UPDATED_ISO_DATE}}
Source of Truth: This document.

## Current Stack

- {{FRONTEND_STACK}}

During adoption, identify the owning manifest, lockfile, framework configuration, and local conventions through the entry points below. Those sources define supported versions and project practices.

## Frontend Quality Bar

Use the nearest live route and shared component patterns. Keep state close to its owner. Extract shared UI when reuse is real.
Consume current API contracts. The server decides permissions and mutation success.
Reuse the existing query and mutation owners and canonical status values and labels. Avoid competing fetch paths for the same state.
Show loading, empty, denied, error, and recovery states when they can occur. Reconcile optimistic state after failure.
Handle pending and disabled actions. Protect destructive actions with confirmation, undo, or recovery appropriate to their risk and reversibility.
Verify affected keyboard and focus behavior, accessible names, responsive layout, and realistic content.
Choose a component, route, or browser check that proves the changed behavior. A build alone does not prove a usable interaction.
Project-specific visual and interaction conventions belong in `docs/ui/README.md`. Generic UI checks: `docs/design-docs/UI-STANDARDS.md`.

## Current Workspace Entry Points

- {{FRONTEND_ENTRYPOINT_1}}
- {{FRONTEND_ENTRYPOINT_2}}
