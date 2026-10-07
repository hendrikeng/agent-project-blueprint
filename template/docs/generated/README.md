# Generated Context

Status: canonical
Owner: {{DOC_OWNER}}
Last Updated: {{LAST_UPDATED_ISO_DATE}}
Source of Truth: This directory.

- `docs/generated/AGENT-RUNTIME-CONTEXT.md`: current-state source identity and unfinished-plan index.
- `docs/generated/db-schema.md`: actual schema snapshot when a database exists.
- `docs/generated/evals-report.json`: observed agent evaluation results, or not-run.
- `docs/generated/article-conformance.json`: declared harness capabilities and referenced files, not behavioral proof.

Regenerate from sources. Never edit a report to claim a pass.
The context compiler reads current files. Its check mode rejects stale generated content without rewriting it.
Load detailed artifacts only when the task needs them.
