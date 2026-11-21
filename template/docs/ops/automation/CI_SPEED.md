# CI Speed

Status: canonical
Owner: {{DOC_OWNER}}
Last Updated: {{LAST_UPDATED_ISO_DATE}}
Source of Truth: This document.

Target: a PR result in less than 2 minutes at the median and less than 3 minutes at p95.
The defaults below keep each part of a job inside a budget. Each budget is a `timeout-minutes` value. A slower job fails.

| Part | Default | Budget |
| --- | --- | --- |
| Wait | Ubicloud runners (`ubicloud-standard-2`) for every job. `concurrency` with `cancel-in-progress`. | Less than 10 seconds |
| Setup | Blobless clone (`filter: blob:none`), not a shallow clone. `.github/actions/setup` restores `node_modules`. `ci-cache.yml` seeds the cache on `dev` and `main`. | Less than 30 seconds |
| Install and scripts | pnpm installs packages with `minimumReleaseAge`, `strictPeerDependencies`, and `engineStrict` in `pnpm-workspace.yaml`. Workflows run scripts with `node --run`. | Part of setup |
| Format and lint | oxfmt and oxlint. Python: Ruff. | Less than 5 seconds |
| Typecheck | `tsc` from TypeScript 7. `vue-tsc` for `.vue` files. | Less than 5 seconds |
| Tests | Vitest with `isolate: false` and random order. Python: pytest with pytest-xdist and pytest-randomly. | Less than 60 seconds for each shard |

Lint, typecheck, build, and unit tests run in parallel jobs: `Project lint`, `Project typecheck`, `Project build`, and `Project unit-tests`.
`Fast Gate` sets `PROJECT_GATES_IN_JOBS`, so it does not run these gates again. Full Gate requires each job for code scopes.
Move migration checks and the tests of other applications into their own jobs. Do not put them in the slowest job.

On PRs outside `main`, `Project unit-tests` runs the `affectedCommand` of the `unit-tests` gate, for example `pnpm test --changed origin/dev`.
The `ci:full` label, PRs into `main`, and merge groups run the full suite.
If the PR ran only affected tests, Full Gate fails until the `ci:full` run passes. Thus the full suite runs before a change gets to `dev`.
If the test runner cannot select tests, set `affectedCommand` to the unit test command. Then every PR run is a full run.
After you add selection, hide a real change from the selection on purpose, and make sure that CI fails.

The pre-push hook runs format, lint, and typecheck on the changed files. See [Daily Workflow](LITE_QUICKSTART.md).

Starter configuration for a TypeScript project:

- `.oxlintrc.json`: `{ "categories": { "correctness": "error", "suspicious": "error", "perf": "error" } }`. Turn on more rules when the project is clean.
  Some ESLint `recommended` rules are not in these categories. Turn them on by name, for example `no-regex-spaces`, `no-useless-assignment`, and `preserve-caught-error`.
- `package.json` scripts: `"lint": "oxlint --deny-warnings"`, `"format": "oxfmt"`, `"typecheck": "tsc --noEmit"`, `"test": "vitest run"`.
- `vitest.config.ts`: `test: { isolate: false, sequence: { shuffle: true }, testTimeout: 45000 }`. Write the cleanup rules from `AGENTS.md` into each test file.

If `vue-tsc` or a framework cannot use TypeScript 7 yet, keep its checker. Record the measured reason in `docs/governance/project-gates.json`.
Before you replace a tool, run the old tool and the new tool side by side. List each finding that the new tool does not find.

Starter configuration for a Python project: `uv sync --frozen` installs, `ruff format --check` and `ruff check` lint, and `pytest -n auto -p randomly` tests.
The harness changed-file check finds Ruff through `ruff.toml`, `.ruff.toml`, or `[tool.ruff]` in `pyproject.toml`.

## Kept Tools

These tools stay because the replacement loses a capability or saves no time. Measured on 2026-11-21.

- pnpm stays the package manager. Bun 1.4.5 installs conflicting peer dependencies without an error, does not check `engines`, and has no documented strict release-age setting.
  With a `node_modules` cache keyed on the lockfile, Bun saves about 0 seconds in CI.
- Workflows and harness scripts use `node --run`. It started a script in 87 ms. `npm run` took 220 ms. `bun run` took 67 ms, but CI then needs a Bun setup step.
- `vue-tsc` stays for `.vue` files. TypeScript 7 cannot check them.
- ESLint with the Vue plugin stays for `.vue` templates. oxlint has no Vue template rules. The changed-file check runs both linters when both are configured.
- Vitest uses jsdom by default. On one Vue project, happy-dom took 234 seconds against 170 seconds for jsdom and failed 216 tests. Measure before you switch.
