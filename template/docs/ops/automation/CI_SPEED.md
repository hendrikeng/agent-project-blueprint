# CI Speed

Status: canonical
Owner: {{DOC_OWNER}}
Last Updated: {{LAST_UPDATED_ISO_DATE}}
Source of Truth: This document.

Target: a PR result in less than 2 minutes at the median and less than 3 minutes at p95.
Cost rule: the billed minutes per run must not increase. Get faster by doing less work, not by paying for larger machines.
Use the standard runner size. Do not use larger runners.
The defaults below keep each part of a job inside a budget. Each budget is a `timeout-minutes` value. A slower job fails.

| Part | Default | Budget |
| --- | --- | --- |
| Wait | Ubicloud runners (`ubicloud-standard-2`) for every job. `concurrency` with `cancel-in-progress`. | Less than 10 seconds |
| Setup | Blobless clone (`filter: blob:none`), not a shallow clone. `.github/actions/setup` restores `node_modules`. `ci-cache.yml` seeds the cache on `dev` and `main`. | Less than 30 seconds |
| Install and scripts | pnpm installs packages with `minimumReleaseAge`, `strictPeerDependencies`, and `engineStrict` in `pnpm-workspace.yaml`. Workflows run scripts with `node --run`. | Part of setup |
| Format and lint | `bun fmt` (or oxfmt) and oxlint. Python: Ruff. | Less than 5 seconds |
| Typecheck | `bun check`, or `tsc` from TypeScript 7 without Bun. `vue-tsc` for `.vue` files. | Less than 5 seconds |
| Tests | Vitest with `isolate: false` and random order. Build the application once for each test process and reuse it across test files. Split shards by recorded test duration. Python: pytest with pytest-xdist and pytest-randomly. | Less than 60 seconds for each shard |

Each job pays its own setup and a rounded billed minute. Thus short gates share a job, and only long gates get their own job.
Lint and typecheck run in `Fast Gate`. The build and the unit tests run in parallel jobs: `Project build` and `Project unit-tests`.
`Fast Gate` sets `PROJECT_GATES_IN_JOBS`, so it does not run these two gates again. Full Gate requires both jobs for code scopes.
Move migration checks and the tests of other applications out of the slowest job only if the billed minutes do not increase.

New projects use Node 26, the active LTS line. The setup action installs Corepack on Node 26, because Node 25 and later do not include it.

On PRs outside `main`, `Project unit-tests` runs the `affectedCommand` of the `unit-tests` gate, for example `pnpm test --changed origin/dev`.
The `ci:full` label, PRs into `main`, and merge groups run the full suite.
If the PR ran only affected tests, Full Gate fails until the `ci:full` run passes. Thus the full suite runs before a change gets to `dev`.
If the test runner cannot select tests, set `affectedCommand` to the unit test command. Then every PR run is a full run.
After you add selection, hide a real change from the selection on purpose, and make sure that CI fails.

The pre-push hook runs format, lint, and typecheck on the changed files. See [Daily Workflow](LITE_QUICKSTART.md).

Starter configuration for a TypeScript project:

- `.oxlintrc.json`: `{ "categories": { "correctness": "error", "suspicious": "error", "perf": "error" } }`. Turn on more rules when the project is clean.
  Some ESLint `recommended` rules are not in these categories. Turn them on by name, for example `no-regex-spaces`, `no-useless-assignment`, and `preserve-caught-error`.
- `package.json` scripts: `"lint": "oxlint --deny-warnings"`, `"format": "bun fmt"`, `"typecheck": "bun check"`, `"test": "vitest run"`.
- `bunfig.toml` with a `[fmt]` section, for example from `bun fmt --init`. The changed-file check then uses `bun fmt`.
  CI installs Bun only when `bunfig.toml` exists. Keep the file also if you use only `bun check`.
- `bun test` is an option for test files that use no Vitest-only APIs and no framework plugins. Measure it against Vitest before you switch.
- `vitest.config.ts`: `test: { isolate: false, sequence: { shuffle: true }, testTimeout: 45000 }`. Write the cleanup rules from `AGENTS.md` into each test file.

If `vue-tsc` or a framework cannot use `bun check` or TypeScript 7 yet, keep its checker. Record the measured reason in `docs/governance/project-gates.json`.
Before you replace a tool, run the old tool and the new tool side by side. List each finding that the new tool does not find.

Starter configuration for a Python project: `uv sync --frozen` installs, `ruff format --check` and `ruff check` lint, and `pytest -n auto -p randomly` tests.
The harness changed-file check finds Ruff through `ruff.toml`, `.ruff.toml`, or `[tool.ruff]` in `pyproject.toml`.

## Measurements

Measured on the blueprint (83 `.mjs` files, checked as JavaScript) on 2026-11-21:

- Typecheck: `tsc` 5.9.3 took 1.9 to 3.2 seconds (54 errors). TypeScript 7.0.2 took 0.25 to 0.71 seconds. `bun check` (Bun 1.4.5) took 0.08 seconds.
  `bun check` and TypeScript 7 reported the same 52 errors. The 2 extra `tsc` 5.9 errors are inference differences for JavaScript.
- Format: `bun fmt --check` took 0.03 to 0.04 seconds. `oxfmt --check` took 0.08 to 0.33 seconds.
  On 91 files that oxfmt formatted, `bun fmt` changed 1 file: it joins one method chain to fewer lines.

## Kept Tools

These tools stay because the replacement loses a capability or saves no time. Measured on 2026-11-21.

- pnpm stays the package manager. Bun 1.4.5 installs conflicting peer dependencies without an error, does not check `engines`, and has no documented strict release-age setting.
  With a `node_modules` cache keyed on the lockfile, Bun saves about 0 seconds in CI.
- Workflows and harness scripts use `node --run`. It started a script in 87 ms. `npm run` took 220 ms. `bun run` took 67 ms, but CI then needs a Bun setup step.
- `vue-tsc` stays for `.vue` files. TypeScript 7 cannot check them.
- ESLint with the Vue plugin stays for `.vue` templates. oxlint has no Vue template rules. The changed-file check runs both linters when both are configured.
- An ESLint configuration can drop type-aware rules when `PRE_PUSH_FAST=1`. In fast mode, the pre-push hook turns off unused-directive reports, so the directives of the dropped rules do not block the push. See [Daily Workflow](LITE_QUICKSTART.md).
- Vitest uses jsdom by default. On one Vue project, happy-dom took 234 seconds against 170 seconds for jsdom and failed 216 tests. Measure before you switch.
