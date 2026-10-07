# Deployment Model

Status: canonical
Owner: {{DOC_OWNER}}
Last Updated: {{LAST_UPDATED_ISO_DATE}}
Source of Truth: This document.

## Deployment Contract

Record actual deployables, environments, build artifacts, promotion triggers, target ownership, verification, and recovery.
Link workflow sources, `docs/env/README.md`, and `docs/ops/releases/README.md`.
A source tag records a revision. A build proves compilation. Neither proves deployment health.

## Safety And Verification

Run the project candidate gates before promotion. Use actual target health checks after deployment.
Production-affecting actions need authorized scope, an explicit target, and rollback or recovery appropriate to the change.
Wire applicable commands in `docs/governance/project-gates.json`. Do not invent a deploy command for an undeployed project.
Keep this file current when deployment ownership or topology changes.
