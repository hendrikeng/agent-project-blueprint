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
verify:full includes verify:fast. Do not run verify:fast again before verify:full.
If `agent-heavy` is on `PATH`, each project gate, the changed-file lint, and the harness test suite run in one `agent-heavy` slot.
This limits the heavy checks that run at the same time on one machine. CI and `AGENT_HEAVY=0` run the commands directly.
Do not claim an agent behavioral pass from structural checks or refreshed reports.

The package `prepare` script sets `core.hooksPath` to `.githooks`. The `pre-push` hook is in observe mode.
If you push the checked-out feature branch, the hook runs `npm run verify:fast` with the scope of the local classifier. It never stops the push.
For other pushed feature branches, the hook writes `skipped: not checked out`, because the gate checks the working tree.
The hook writes the time, SHA, branch, scope, result, and duration to `verify-fast-pre-push.log` in the Git directory.
To skip the gate, set `VERIFY_PRE_PUSH=skip`. The hook writes the skip to the log.
To enforce the gate later, make the hook exit with the gate status. Keep `VERIFY_PRE_PUSH=skip` as the logged escape.
Do not install AI reviews as Git hooks.
