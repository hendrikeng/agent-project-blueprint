# Architecture Topology

Status: canonical
Owner: {{DOC_OWNER}}
Last Updated: {{LAST_UPDATED_ISO_DATE}}
Source of Truth: This document and the repository app/package layout.

## Current Map

Record actual deployables, runtime entrypoints, shared contracts, data stores, and external integrations.
Link source directories and each surface's owner. Omit categories that do not exist.
Mark a transitional surface with its current role and removal trigger. Put proposed structure in a plan.

## Verification

Update this map when runtime ownership changes. Keep `ARCHITECTURE.md` and `docs/governance/architecture-rules.json` aligned.
Verify import rules with `npm run architecture:verify`. An empty configuration does not prove enforcement.
