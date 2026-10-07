# Dependency Rules

Status: canonical
Owner: {{DOC_OWNER}}
Last Updated: {{LAST_UPDATED_ISO_DATE}}
Source of Truth: This document and `docs/governance/architecture-rules.json`.

## Rules

Follow actual boundaries in `ARCHITECTURE.md` and `docs/architecture/TOPOLOGY.md`.
Keep trusted authority out of client code and shared contracts free from unexpected runtime effects.
Avoid imports that cross an ownership boundary without an explicit contract.
Do not create a generic layer structure for a project that does not need it.

## Rule Configuration

`docs/governance/architecture-rules.json` owns deterministic checks for current boundaries.
Supported checks: `relative_import_graph`, `forbidden_import_patterns_rg`, and `command_hook`.
Use a native toolchain hook when it parses imports better than the built-in checks.
An empty check list needs a concrete rationale and reports that boundaries are not enforced.
A temporary exception names its owner, scope, reason, removal trigger, and expiry when relevant.

## Verification

Run `npm run architecture:verify` when dependency rules or their covered imports change.
Update the rule and its check together. A review-only constraint must say so.
