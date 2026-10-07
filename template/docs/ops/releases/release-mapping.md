# Release Mapping

Status: canonical
Owner: {{DOC_OWNER}}
Last Updated: {{LAST_UPDATED_ISO_DATE}}
Source of Truth: This file plus `scripts/automation/release-support-lib.mjs`.

This file is the operational ledger consumed by `scripts/automation/release-support-lib.mjs`.
Every non-documentation implementation commit requires a `Plan-ID` for a completed plan in the release range or an explicit ledger entry.
Plan-free code fixes require a `standard-change` entry with the commit hash and rationale.
Ordinary PR or commit summaries do not supply machine-readable release mapping. Documentation-only commits do not require an entry.

## Rules

- For planned work, use `Plan-ID` commit metadata or an explicit ledger entry for the completed plan.
- For every plan-free implementation commit, add a `standard-change` ledger entry before release verification.
- Planned slice mappings must point to completed plans included in the release range.
- Standard-change mappings must stay limited to small, low-risk fixes or operational commits with explicit rationale.
- Do not use this file to hide missing closeout, missing validation, or unresolved release risk.

## Mapping Format

```md
- Commit: `abcdef123456` | Plan-ID: `example-plan-id` | Rationale: Squash commit omitted plan metadata but delivered this completed plan.
- Commit: `abcdef123456` | Type: `standard-change` | Rationale: Small accepted fix that did not require completed plan evidence.
```

## Current Release Mappings

- None.
