# Environment Model

Status: canonical
Owner: {{DOC_OWNER}}
Last Updated: {{LAST_UPDATED_ISO_DATE}}
Source of Truth: This document.

## Environment Contract

Record variable names, purposes, required environments, owners, sensitivity, and validation locations. Never record secret values.
Mark client-exposed variables as public. Keep server secrets out of client bundles, logs, docs, and fixtures.
Edit local environment files only when the user authorizes that action.

## Changes

Use the existing configuration boundary to parse and validate inputs.
For deployed changes, record the rollout order, target, verification, and recovery in `docs/deploy/README.md` or the selected plan.
Remove retired variables from the current inventory. Keep migration history in completed evidence.
