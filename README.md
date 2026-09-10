# Agent Project Blueprint

Status: canonical
Owner: Platform Engineering
Last Updated: 2026-08-18
Source of Truth: This directory.

Reusable blueprint for bootstrapping high-quality agent-assisted software projects.

## What This Repo Is

- This repository is the blueprint source.
- `template/` is the install payload for adopted repositories.
- `scripts/harness-sync.mjs` installs, updates, and checks that payload for drift in downstream repos. JSON output separates managed files, project-owned files, and bootstrap helpers.
- `template/README.md` becomes the downstream repo root README after bootstrap.

## Blueprint Principles

- The repository is the operating system for engineering work.
- `VISION.md` makes product direction explicit before agents enter plans or code.
- Canonical docs define current product state, architecture, standards, planning, and quality gates.
- Non-trivial work is planned as one executable slice before implementation.
- Code quality is protected through small scope, explicit contracts, focused validation, reviewable evidence, and automated checks.
- The blueprint is agent-portable: any capable coding agent should be able to rebuild context from repo-local artifacts.
- The blueprint deliberately avoids a mandatory orchestration runtime; runtime-native goals, subagents, hooks, guardrails, traces, and background work should plug into repo-local plans and evidence instead of replacing them.
- Runtime task graphs are useful when two or more ready tasks have disjoint ownership. `template/docs/agent-hardening/RUN_CONTROL.md` defines the planning contract.
- Draft and blocked plans remain plan-only. Execution requires an active slice with satisfied dependencies and approvals.
- The runtime owns graph state and worker dispatch. The repository owns the approved plan, checks, evidence, and closeout.
- External issue trackers, hosting providers, and deployment platforms are optional integrations, not harness requirements.

## Default Git Workflow

The blueprint assumes two long-lived branches: `dev` and `main`.
Slice and fix PRs enter `dev`. Release PRs use `release/YYYY.MM.DD.N` and target `main`.
CI validates integration and release candidates. A merged release creates both a landed tag and a source tag, without deploying services.
Staging, Preview, provider integration, and cross-repository deployment coordination remain project-specific.
The [release contract](template/docs/ops/releases/README.md) defines the defaults.

Existing projects receive managed script updates through the normal reviewed synchronization process.
Workflows are project-owned starter files. Review and adapt them separately when adopting the new CI and tag behavior.
PR templates and release helpers remain managed. Existing local customizations still require reviewed reconciliation.
Do not assume that a managed-script update also installed the new tag workflow or deployment controls.

Starter CI avoids feature-push duplication and selects explicit product, docs, harness, or broad fast validation.
Metadata contracts do not replace code-check evidence. Base edits run code validation again.
Full validation runs for broad or harness PRs, selected exact-SHA candidates, and main/release boundaries, not every dev push.
Standalone full verification still includes broad fast verification. CI runs those commands once.
Workflows, project gates, and `scripts/ci/**` need explicit downstream adoption, not automatic synchronization.
The [CI adoption guide](template/docs/ops/automation/INTEROP_GITHUB.md#ci-budget-defaults) defines required checks and deployment proof.
The [completion record](distribution/ci-budget-completion.md) describes the scope and evidence.
The public blueprint CI retains its four-job OS/Node matrix unchanged. It does not use the private 5of5 minutes budget.

## Start Here

- [template/AGENTS.md](template/AGENTS.md)
- [template/VISION.md](template/VISION.md)
- [template/README.md](template/README.md)
- [template/docs/PLANS.md](template/docs/PLANS.md)
- [template/docs/QUALITY_SCORE.md](template/docs/QUALITY_SCORE.md)
- [template/docs/governance/RULES.md](template/docs/governance/RULES.md)
- [template/docs/ops/automation/LITE_QUICKSTART.md](template/docs/ops/automation/LITE_QUICKSTART.md)

## Bootstrap

The bootstrap has two locations:

- From this blueprint repo, install or adopt the template payload in the target repo.
- From the target repo, plan and execute adoption while the installed files still contain `{{...}}` placeholders.

Use `install` only for a new project. The command refuses existing blueprint paths that contain different content.

```bash
node ./scripts/harness-sync.mjs install --target /path/to/new-project
```

Use `adopt` for an existing Node.js project. The command copies missing files and preserves every existing file.

```bash
node ./scripts/harness-sync.mjs adopt --target /path/to/existing-project --json true
```

Use `drift` for a read-only comparison.

The distribution manifest separates harness-managed files from project-owned starter files through `projectOwnedGlobs`.
Install and adopt copy both groups. The installed manifest records them in `managedFiles` and `projectFiles`.
Project-owned files include root product docs, project configuration, workflows, and generated reports. Updates do not overwrite or restore these files.
Framework scripts and remaining framework docs stay harness-managed. Review upstream changes to project-owned files separately.

Configuration keeps the source-template hash (`sha256`) and the configured file hash (`configuredSha256`) for managed files.
Updates compare managed files against the configured baseline. Local edits, deleted managed files, and preserved adoption conflicts stop the update.
The `--overwrite-modified` flag cannot bypass these conflicts.
Older manifests automatically release ownership of files that match the current `projectOwnedGlobs`. Updates preserve those files, including local edits and deletions.

Updates reuse the approved packet at the recorded `decisionsPath`. The optional `--decisions` argument selects a different approved packet in the target repository. Missing decisions or invalid incoming templates stop the update before it changes files. The manifest advances only after configuration succeeds.

```bash
node ./scripts/harness-sync.mjs update --target /path/to/existing-project
```

### Existing Project Migration

This revision removes Nx-specific checks and adds explicit eval runtime identity. Existing project-owned configuration stays unchanged during updates.

1. Remove the retired decisions: `ESLINT_CONFIG_PATH`, `SOURCE_TAG_*`, `ALLOWED_TARGET_TAG_*`, `PROJECT_JSON_PATH_*`, `PROJECT_REQUIRED_TAG_*`, and `EVAL_EVIDENCE_PATH_1`.
2. Add approved values for `EVAL_RUNTIME_VERSION`, `EVAL_PROMPT_VERSION`, and `EVAL_TOOL_CONFIG_VERSION`.
3. Replace `nx_dep_constraints` and `required_project_tags` checks with checks for the actual stack in `docs/governance/architecture-rules.json`.
4. If no boundaries apply, record an empty `checks` array and a concrete `rationale`. This reports “not enforced,” not passing enforcement.
5. Add `runtime` to `docs/agent-hardening/evals.config.json` with `provider`, `model`, `runtimeVersion`, `promptVersion`, and `toolConfigVersion` from the approved packet.
6. Add repo-local prompt and tool configuration files to `additionalInputPaths` when those files affect agent behavior.
7. Run the update command, refresh the eval report, and rerun the required evaluations.
8. Record the evaluated `runtime` in the report. Run `npm run eval:verify`.

Older manifests without a configured baseline stop with `CONFIGURED_BASELINE_MISSING`. To migrate that baseline first:

1. Back up local edits.
2. Create a checkout of the blueprint revision recorded in the installed manifest.
3. Copy the updated `scripts/harness-sync.mjs` and `scripts/bootstrap-configure.mjs` into that checkout.
4. Do not change the templates in the checkout.
5. Restore any removed bootstrap-only helpers from the installed revision.
6. Run `bootstrap-configure.mjs` with the approved packet and `--baseline-only true`.
7. Review files marked `preservedLocal` in the manifest.
8. If you restore those files to their configured template content, run configuration again before another update.

Do not adopt the repository again or copy source hashes into the configured baseline.

### Reviewed manual reconciliation

If an approved manual migration preserves project customizations, `reconcile` can record the new installation after those merges. It writes only the manifest. It does not copy, remove, or restore target files.

```bash
node ./scripts/harness-sync.mjs reconcile --target /path/to/existing-project \
  --review docs/ops/automation/reconciliation-review.json
```

Create the review file inside the target repository. Keep it separate from managed files, the manifest, and the decision packet. Record approval only after the user reviews the migration.

The review contract contains:

- `version: 1`, `action: "record-reconciliation"`, and `approvedAt` with the actual UTC approval timestamp.
- `sourceRevision` with the full Git commit ID, and `sourceManifestSha256` with the source ownership manifest hash.
- `installedManifestSha256` with the unchanged installed manifest hash.
- `decisionsPath` with the approved repository-relative packet path, and `decisionsSha256` with its hash.
- `files` with exactly one entry for every path in the installed and incoming managed sets.

Each file entry contains `targetPath`, `currentSha256`, `sourceSha256`, `configuredSha256`, and `resolution`.
Use `configureContent()` from `scripts/bootstrap-configure.mjs` to calculate the expected configured content.

- `configured`: Current content equals the configured incoming template.
- `preserve-local`: Current content differs from that template. The new manifest must retain `preservedLocal: true`.
- `retired`: The old managed path is absent from the incoming set. Source and configured hashes are `null`. Retained content stays untouched.

`currentSha256` can be `null` only for an absent retired file. All incoming managed files must exist.
Changed hashes, duplicate or unexpected entries, missing coverage, and symlink paths stop the command before mutation.

The new manifest records the review path and its hash. Legacy manifests do not need a fabricated historical configured baseline.
Normal updates still reject preserved customizations that differ from incoming templates. Reconciliation does not grant an evaluation pass or merge approval.

The current adoption workflow requires Node.js 24 and a `package.json` with an npm, pnpm, or yarn lockfile. New-project configuration currently creates an npm `package-lock.json` or `npm-shrinkwrap.json`. Other stacks can use audit mode, but automatic adoption is not yet supported.

`distribution/bootstrap-questionnaire.json` is the machine-readable decision contract. It covers every placeholder and supplies inference hints for interactive tools. `scripts/bootstrap-configure.mjs` validates an approved decision packet, replaces governed placeholders, and merges non-conflicting package scripts. Interactive clients should call these blueprint-owned interfaces instead of copying their logic.

The install copies `template/` into the target repository root. After install, paths lose the `template/` prefix: `template/PLACEHOLDERS.md` becomes `PLACEHOLDERS.md`, `template/AGENTS.md` becomes `AGENTS.md`, and `template/docs/...` becomes `docs/...`. `PLACEHOLDERS.md`, `package.scripts.fragment.json`, and the bootstrap verification/cleanup scripts are bootstrap-only helpers: they are copied for the first adoption pass but are not tracked as permanent harness-managed files. The sync manifest is written to `docs/ops/automation/harness-manifest.json`; downstream `.gitignore` is preserved.

Then work inside the target repo:

1. Use the planning kickoff prompt below to decide product scope, stack, invariants, placeholder values, gates, and first slices.
2. Use the execution kickoff prompt to apply those decisions to the installed template.
3. Merge `package.scripts.fragment.json` into the target `package.json`.
4. Replace `docs/governance/project-gates.json` with real lint, typecheck, test, build, database, browser, deploy, and security gates, or mark missing gates with a concrete rationale.
5. Run `npm run harness:verify`, `npm run context:compile`, and `npm run eval:refresh`. Run the required evaluations and record their execution evidence before `npm run verify:fast`. See `docs/agent-hardening/EVALS.md`.
6. Run `npm run bootstrap:cleanup` after placeholders are replaced and package scripts are merged; cleanup removes the bootstrap inputs, bootstrap-only scripts/tests, and the two bootstrap package commands.

## Agent Quickstart Prompts

Use these prompts when starting a new project from the blueprint.

Planning kickoff:

```text
This repository has just been initialized from the Agent Project Blueprint.
We are inside the target repo now, and installed files may still contain {{...}} placeholders.
Stay in planning mode. Do not edit files yet.

Read VISION.md, AGENTS.md, PLACEHOLDERS.md, README.md, docs/PLANS.md, docs/QUALITY_SCORE.md, docs/governance/RULES.md, and the nearest existing code/package files if any.

Produce a bootstrap decision packet:
1. define what the product does, who it serves, and which outcomes matter,
2. choose the stack, runtime, deployment posture, data model direction, and testing strategy,
3. identify critical invariants for security, authorization, data integrity, lifecycle transitions, money/numeric behavior, and reliability,
4. map every placeholder in PLACEHOLDERS.md to a project-specific value or an explicit not-applicable rationale,
5. define the initial current-state, architecture, frontend, backend, security, reliability, and quality-score baseline that should be written during execution,
6. identify the real project commands that should back docs/governance/project-gates.json,
7. propose the first executable future slices with acceptance criteria, dependencies, validation lanes, evidence expectations, and risk tiers,
8. call out any missing decision that blocks safe execution.

Treat this as a production engineering blueprint: explicit contracts, small executable slices, strong defaults, proof-oriented validation, and no invented product behavior.
Stop after the decision-complete planning output. Do not replace placeholders, merge package scripts, create product code, or run verification until I approve execution.
```

Execution kickoff:

```text
Approved. Execute the bootstrap decision packet in this installed target repo.

Assume the template has already been installed into the current repository root. If AGENTS.md, PLACEHOLDERS.md, package.scripts.fragment.json, or docs/governance/project-gates.json are missing, stop and report that the template install step has not happened.

1. Replace all {{...}} placeholders in installed files using the approved decision packet; use PLACEHOLDERS.md as the temporary placeholder inventory during this pass.
2. Merge package.scripts.fragment.json into package.json without deleting unrelated existing project scripts.
3. Wire docs/governance/project-gates.json to real project commands for lint, typecheck, unit tests, build, and any applicable integration, migration, browser, security, release, or deploy checks.
4. Run ./scripts/check-template-placeholders.sh until no unresolved placeholders remain outside the documented inventory.
5. Run npm run harness:verify, npm run context:compile, and npm run eval:refresh. Run the required evaluations and record execution evidence under docs/agent-hardening/EVALS.md before running npm run docs:verify, npm run plans:verify, npm run project:gates:verify, and npm run verify:fast. Refresh alone never grants an eval pass.
6. Create or update exactly one executable future or active slice from the approved first-slice plan.
7. Implement only that slice if execution approval includes implementation; otherwise stop after verified bootstrap and slice creation.
8. Update current-state docs, architecture/standards docs, validation evidence, and completed-plan closeout where the executed change requires it.
9. Run npm run bootstrap:cleanup to remove bootstrap-only inputs, scripts, tests, and package commands after placeholders are clear and package scripts are merged.
10. Run the strongest relevant verification available and report the exact commands and evidence.

Keep the work agent-portable: any capable coding agent must be able to resume from repository-local docs, plans, code, validation output, and evidence.
```

## Root Commands

- `npm run test:root`
- `npm run test:template-smoke`
- `npm run test:golden-adopted-repo`
- `npm test`

CI runs the golden adoption workflow once on Linux with Node.js 24.x. It uses the public install, adopt, and configure commands.
The smoke and golden fixtures record real harness-test output under fixture-specific eval configs. They do not claim that agent evaluations passed.
