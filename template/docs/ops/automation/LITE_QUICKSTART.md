# Daily Workflow

Status: canonical
Owner: {{DOC_OWNER}}
Last Updated: {{LAST_UPDATED_ISO_DATE}}
Source of Truth: This document.

1. Read `AGENTS.md` and `docs/product-specs/CURRENT-STATE.md`.
2. Inspect the requested plan and nearest live code.
3. Implement the authorized outcome with focused checks.
4. Replace affected current-state statements. Remove resolved gaps.
5. Close a plan only after its acceptance items and required checks are complete. After state or queue changes, run npm run context:compile.
6. Report evidence and remaining work.

Use `docs/PLANS.md` when the work needs a plan.
Run npm run verify:fast for repository consistency and npm run verify:full at delivery boundaries.
Do not claim an agent behavioral pass from structural checks or refreshed reports.
