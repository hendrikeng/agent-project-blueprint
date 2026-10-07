# Run Control

Status: canonical
Owner: {{DOC_OWNER}}
Last Updated: {{LAST_UPDATED_ISO_DATE}}
Source of Truth: This document.

## Goal-Driven Run Control

An implementation request authorizes necessary bounded work within its scope.
Keep the requested outcome and acceptance criteria explicit. Continue through focused checks and fixes.
Ask only for decisions that materially change scope, contracts, or authorization.
A conceptual goal does not require a runtime goal tool. Use native features only when available and authorized.

## Task Graph Planning

Use parallel work only when scopes are independent and file ownership is disjoint.
The runtime owns dispatch and messages. The repository owns plans and durable results.
A draft or blocked plan does not authorize implementation. Read dependencies and approvals before dispatch.

## Delegation and Handoffs

Name the worker's outcome, edit scope, relevant files, validation, and publication limits.
Pass applicable authorization and restrictions. A handoff does not grant broader permissions.
One coordinator owns integration and final verification.
Use the continuation section defined in `docs/agent-hardening/MEMORY_CONTEXT.md`.

## Runtime Execution Contract

Runtime-native execution machinery is optional.
System instructions, native permissions, and explicit user instructions take precedence over repository guidance.
Do not bypass denials through another tool, worker, path, or mode.
Use native controls for enforced restrictions. Documentation is guidance, not an access-control mechanism.

## Completion Audits

Compare requested outcomes with actual changed files and validation results.
Report completed, unverified, and blocked items truthfully.
Remove finished work from the active queue. Do not restart a completed plan from historical context.
