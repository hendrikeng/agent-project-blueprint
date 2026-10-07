# Engineering Invariants

Status: canonical
Owner: {{DOC_OWNER}}
Last Updated: {{LAST_UPDATED_ISO_DATE}}
Source of Truth: This document.

## Core Invariants

When delivery pressure conflicts with correctness, preserve required validation, authority, data integrity, and recovery. Report any unresolved limitation instead of weakening the contract.
Validate external input at trust boundaries. Enforce sensitive authority in the trusted runtime.
Keep schema, validation, persistence, and consumer contracts aligned across touched surfaces.
Make partial failure and recovery visible. Define idempotency when an operation can repeat.
Keep generated artifacts tied to a source and generation command.

## Implementation Discipline

Inspect existing callers and tests before changing a contract.
Trace a defect to its cause and inspect affected callers and sibling paths. Fix the shared cause when it explains the failure.
Before framework-specific changes, inspect the owning package manifest, lockfile, configuration, and local conventions. Use official documentation for uncertain or version-sensitive APIs. Do not upgrade dependencies merely to follow current examples.
Use the smallest complete change. Remove introduced dead code and unnecessary wrappers.
Add an abstraction only for existing complexity, reuse, or a necessary boundary.

## Quality Escalation

Protect behavior with the strongest practical focused check.
For performance changes, measure the affected bottleneck and preserve existing latency and resource budgets.
Review the actual diff against the requested outcome, failure paths, and existing contracts before claiming completion.
For a bug fix, use a regression check when the failure is reproducible.
Do not add tests that merely copy implementation details or duplicate existing coverage.

## Documentation Discipline

Update the owning contract in place. Put current facts in specs, future work in plans, and history in completed evidence.
Do not copy general rules into feature docs.
