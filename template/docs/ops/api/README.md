# API Operations

Status: canonical
Owner: {{DOC_OWNER}}
Last Updated: {{LAST_UPDATED_ISO_DATE}}
Source of Truth: This document.

## API Contract

Record current actors, authorization scope, request and response contracts, compatibility, and error behavior for operationally important APIs.
Link their source and tests. Keep generated API schemas derived from the real implementation.
For exposed or costly APIs, record applicable rate limits and resource bounds, their enforcement source, and rejection behavior. Verify affected limits when they change.
Use `docs/BACKEND.md`, `docs/SECURITY.md`, and `docs/RELIABILITY.md` for shared rules.

## Recovery

Record current degraded modes and scoped replay or repair commands. Name the target and required authorization.
Do not store credentials or private payloads in examples or evidence.
Remove resolved incident notes; retain their history outside current operational guidance.
