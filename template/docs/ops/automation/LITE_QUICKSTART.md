# Daily Workflow

Status: canonical
Owner: {{DOC_OWNER}}
Last Updated: {{LAST_UPDATED_ISO_DATE}}
Source of Truth: This document.

1. Read `AGENTS.md` and `docs/product-specs/CURRENT-STATE.md`.
2. Inspect the requested plan and nearest live code.
3. Implement the authorized outcome with focused checks.
4. Replace affected current-state statements. Remove resolved gaps.
5. Close a plan only after its acceptance items and required checks are complete. After state or queue changes, run node --run context:compile.
6. Report evidence and remaining work.

Use `docs/PLANS.md` when the work needs a plan.
Run node --run verify:fast for repository consistency and node --run verify:full at delivery boundaries.
verify:full includes verify:fast. Do not run verify:fast again before verify:full.
If `agent-heavy` is on `PATH`, each project gate, the changed-file lint, and the harness test suite run in one `agent-heavy` slot.
This limits the heavy checks that run at the same time on one machine. CI and `AGENT_HEAVY=0` run the commands directly.
Do not claim an agent behavioral pass from structural checks or refreshed reports.

The package `prepare` script runs `scripts/automation/install-hooks.mjs`. It sets `core.hooksPath` to `.githooks`.
If `.githooks` is not at the repository root, if Git has a hooks path, or if `.git/hooks` has active hooks, the script changes nothing.
In that case, call `scripts/automation/pre-push.mjs` from your pre-push hook.
The `pre-push` hook stops the push when a check fails. The target time is less than 9 seconds.
If you push the checked-out feature branch, the hook runs two checks:

1. `scripts/automation/lint-changed.mjs`: oxfmt and oxlint on the changed files, or Ruff in a Python project.
2. The `typecheck` gate from `docs/governance/project-gates.json`.

The checks read the working tree. If the pushed commit is not checked out, or if tracked files have changes, the hook writes a skip.
The hook writes the time, SHA, branch, result, and duration to `pre-push.log` in the Git directory.
To skip the checks, set `VERIFY_PRE_PUSH=skip`. The hook writes the skip to the log.
Do not install AI reviews as Git hooks.
