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
The hook refuses direct pushes to an existing `dev` or `main` branch. Merge through a pull request.
The hook also refuses to delete `dev` or `main`. The first push that creates the branch is allowed.
If hosted CI cannot run, run the full gate on the exact commit first. Then set `ALLOW_PROTECTED_PUSH=1` for the fast-forward push.
The hook does not run the gate. It allows only a fast-forward of the fetched branch, and it writes the push to its log.
If you push the checked-out feature branch, the hook runs two checks:

1. `scripts/automation/lint-changed.mjs`: oxfmt and oxlint on the committed changed files, ESLint if configured, or Ruff in a Python project.
2. The `typecheck` gate from `docs/governance/project-gates.json`.

To adopt a tool step by step, list its id in `validationPolicy.changedFileObserve` in `docs/governance/policy-manifest.json`.
The ids are `oxfmt`, `oxlint`, `eslint`, `ruff-format`, and `ruff-check`. A listed tool reports findings and does not fail. Remove the id when the files are clean.
CI does not run the hook: `install-hooks.mjs` changes nothing when `CI` is set to a value other than `false` or `0`.
A tool in observe mode still fails on an exit code other than 1. Exit code 1 can also mean a crash or a configuration error, for example in oxlint or a Node tool. Thus keep a tool in observe mode only during the adoption.
On Windows, Yarn Plug'n'Play projects are not supported: Node cannot start `yarn.cmd` without a shell.

A local `verify:fast` normally skips plan closeout during feature work.
To check closeout as the PR into the integration branch will, set `validationPolicy.closeoutPredictionRef`, for example to `origin/dev`.
Then `verify:fast` compares against the merge base with that ref. For mid-iteration work only, set `VERIFY_FAST_SKIP_CLOSEOUT=1`.

The checks read the working tree. If the pushed commit is not checked out, or if tracked files have changes, the hook writes a skip.
The hook writes the time, SHA, branch, result, and duration to `pre-push.log` in the Git directory.
To skip the checks, set `VERIFY_PRE_PUSH=skip`. The hook writes the skip to the log.
Do not install AI reviews as Git hooks.
