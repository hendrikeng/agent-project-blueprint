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
The hook still runs format, lint, and typecheck against the remote tip of the branch, but not the full gate. Check out the pushed commit without local changes: otherwise the hook refuses the push.
It allows only a fast-forward of the fetched branch, and it writes the push to its log.
If you push the checked-out feature branch, the hook runs two checks:

1. `scripts/automation/lint-changed.mjs`: `bun fmt` (with a `[fmt]` section in `bunfig.toml`) or oxfmt, and oxlint on the committed changed files, ESLint if configured, or Ruff in a Python project.
2. The `typecheck` gate from `docs/governance/project-gates.json`.

If whole-program checks make the hook slow, set `validationPolicy.prePushWholeProgram` to `false`.
Then a feature-branch push runs only the changed-file check with `PRE_PUSH_FAST=1`, and the ESLint configuration can drop type-aware rules.
Without those rules, their `eslint-disable` directives look unused. With `--max-warnings 0`, these reports would block the push.
For this reason, in fast mode the hook runs ESLint with `--report-unused-disable-directives-severity off`.
ESLint before 8.56 does not have this flag. With such a version, or if the hook cannot read the ESLint version, the hook does not set the flag. Then unused directives still block the push.
The flag overrides `linterOptions.reportUnusedDisableDirectives`. The CI lint gate runs without `PRE_PUSH_FAST`.
The CI lint gate must fail on unused directives: use `--max-warnings 0`, or set `reportUnusedDisableDirectives` to `"error"`.
CI runs the typecheck and the type-aware rules. A gated push to `dev` or `main` still runs every check.
If the required fast lint gate checks every file and also the formatting, set `validationPolicy.ciLintGateCoversChangedFiles` to `true`.
Then CI `verify:fast` skips the changed-file check when the same job runs that gate. The CI lint gate must run the type-aware rules: only the hook sets `PRE_PUSH_FAST`.

To adopt a tool step by step, list its id in `validationPolicy.changedFileObserve` in `docs/governance/policy-manifest.json`.
The ids are `bun-fmt`, `oxfmt`, `oxlint`, `eslint`, `ruff-format`, and `ruff-check`. A listed tool reports findings and does not fail. Remove the id when the files are clean.
If a Node tool needs more memory, for example a type-aware ESLint run, set `validationPolicy.changedFileNodeOptions`, for example `{ "eslint": ["--max-old-space-size=4096"] }`.
If `node` is not on the `PATH` of the Git client, the hook stops with a message. Start Git from a shell that loads Node.
CI does not run the hook: `install-hooks.mjs` changes nothing when `CI` is set to a value other than `false` or `0`.
A tool in observe mode still fails on an exit code other than 1, on a configuration error, and on a missing module.
oxlint and oxfmt use exit code 1 for a configuration error, so the check reads their output. Keep a tool in observe mode only during the adoption.
On Windows, Yarn Plug'n'Play projects are not supported: Node cannot start `yarn.cmd` without a shell.

A local `verify:fast` normally skips plan closeout during feature work.
To check closeout as the PR into the integration branch will, set `validationPolicy.closeoutPredictionRef`, for example to `origin/dev`.
Then `verify:fast` compares against the merge base with that ref. For mid-iteration work only, set `VERIFY_FAST_SKIP_CLOSEOUT=1`.

The checks read the working tree. If the pushed commit is not checked out, or if tracked files have changes, the hook writes a skip.
The hook writes the time, SHA, branch, result, and duration to `pre-push.log` in the Git directory.
To skip the checks, set `VERIFY_PRE_PUSH=skip`. The hook writes the skip to the log.
Do not install AI reviews as Git hooks.
