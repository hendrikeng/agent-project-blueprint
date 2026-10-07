# Database Schema Reference

Status: generated
Owner: {{DOC_OWNER}}
Last Updated: {{LAST_UPDATED_ISO_DATE}}
Source of Truth: Generated from the adopted project's canonical database schema and migration source when a database exists.

This file is the stable database entrypoint for agents and reviewers.

## Current State

- The raw blueprint template has no adopted database surface.
- When the adopted project adds a database, replace this placeholder state with a generated schema snapshot and keep it current with schema-backed changes.
- The generation command belongs in `docs/governance/project-gates.json` under `migration-integrity` or in a documented script invoked by that gate.

## Required Contents When Active

- Schema source path and generation command.
- Current migration head, snapshot identifier, checksum, or equivalent stack-specific version marker.
- Link the canonical schema or generated API instead of copying every field into agent context. Summarize models and critical constraints.
- Record critical relationships, constraints, and policies that affect safe changes. Keep the full schema in its generator-owned source.
- Enums, controlled values, seed/reference data, generated clients, and generated types when the stack uses them.
- Validation evidence for migration integrity and at least one representative read/write path after schema changes.

## Rules

- Do not hand-edit active schema snapshots when the stack can generate them from the canonical schema source.
- Schema-backed changes update schema, migrations, generated schema artifacts, repository/query code, validations, API/action contracts, UI mappings, tests, and evidence in the same slice unless an active plan explicitly stages the rollout.
- Data migrations and backfills need target selection, dry-run or preview behavior where practical, operator-readable logs, and rollback or fix-forward notes.
