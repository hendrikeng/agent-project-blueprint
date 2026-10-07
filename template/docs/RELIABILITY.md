# Reliability

Status: canonical
Owner: {{DOC_OWNER}}
Last Updated: {{LAST_UPDATED_ISO_DATE}}
Source of Truth: This document.

## Reliability Goals

Critical workflows report success only after their required effects succeed.
Handle partial failure, duplicate delivery, stale state, and provider timeouts where these can occur.
Retries need bounded attempts and safe replay. Define recovery for effects that cannot be rolled back.
For work that must outlive a request or browser session, preserve resumable state, observable progress, and a defined terminal status.
Keep telemetry from blocking core behavior unless the product contract requires it.

## Reliability Anti-Patterns

Avoid silent fallback, unbounded retry, swallowed errors, fake success, and recovery paths that lose the original failure.
A green build does not establish deployment health or prove a dependency is available.

## Critical Flows

- {{CRITICAL_FLOW_1}}
- {{CRITICAL_FLOW_2}}
- {{CRITICAL_FLOW_3}}

## Project Recovery Contracts

Record only current degraded modes, their observable symptoms, and targeted recovery steps.
Remove resolved incidents from this file. Preserve incident history in references or completed evidence.
Verify changed failure behavior with focused tests or a named manual observation.
