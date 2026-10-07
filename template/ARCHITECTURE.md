# Architecture

Status: canonical
Owner: {{DOC_OWNER}}
Last Updated: {{LAST_UPDATED_ISO_DATE}}
Source of Truth: This document and `docs/architecture/`.

## Read Order

Use `docs/architecture/TOPOLOGY.md` for actual entrypoints and boundaries.
Read `docs/architecture/DEPENDENCY-RULES.md` only when imports or module ownership change.

## Core Invariants

- {{SHARED_CONTRACT_STRATEGY}}
- Sensitive authority: {{SERVER_AUTHORITY_BOUNDARY_SET}}.
- Document actual components, owners, and allowed dependencies. Do not mandate unused architectural layers.
- Planned structure belongs in plans until implemented.

## Verification

Declare real import checks in `docs/governance/architecture-rules.json`.
Run npm run architecture:verify for boundary changes. An empty configuration means not enforced.
