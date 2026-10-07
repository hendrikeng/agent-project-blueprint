# Agent Project Blueprint

Status: canonical
Owner: Platform Engineering
Last Updated: 2026-10-07
Source of Truth: This directory.

Reusable blueprint for bootstrapping high-quality agent-assisted software projects.

## What This Repo Is

- This repository is the blueprint source.
- `template/` is the install payload for adopted repositories.
- `scripts/harness-sync.mjs` installs, updates, and checks that payload for drift in downstream repos. JSON output separates managed files, project-owned files, and bootstrap helpers.
- `template/README.md` becomes the downstream repo root README after bootstrap.

## Context Model

A fresh agent reads `AGENTS.md` and `docs/product-specs/CURRENT-STATE.md`, then the requested plan and relevant code.
The snapshot states what exists, what remains, and what is uncertain. Domain docs load only when needed.
`VISION.md` records durable direction for product decisions. A small project can keep direction in README and use VISION as a pointer.
Completed plans preserve history outside startup context. A continuation section preserves decisions and next actions across sessions.
The blueprint works through repository files and deterministic checks. It does not require an orchestration runtime or a provider-specific memory system.

Current-state updates replace obsolete facts and remove resolved gaps. They do not append a delivery narrative.
UTF-8 size budgets prevent long single-line files from bypassing context limits. Freshness warnings request fact verification.
The generated context index lists unfinished plans and detects changed source inputs without copying all policy into another prompt.
Ordinary software gates check eval integrity. Strict `eval:verify` remains the separate agent activation gate; report refresh never runs evaluations.
During adoption, verify that the installed client loads `AGENTS.md`. Existing provider entrypoints can change discovery.
The [agent adoption guide](template/docs/agent-hardening/README.md#instruction-discovery-during-adoption) covers Codex overrides and Claude imports without duplicating policy.

See the [template audit and migration guide](distribution/context-refresh.md) for the full file review, source guidance, limits, and existing-project reconciliation.

## Default Git Workflow

The blueprint assumes two long-lived branches: `dev` and `main`.
Slice and fix PRs enter `dev`. Release PRs use `release/YYYY.MM.DD.N` and target `main`.
CI validates integration and release candidates. A merged release creates landed and source tags, plus a GitHub Release with generated notes, without deploying services.
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
`drift --json true` and `update --json true` report `projectUpdatesAvailable` by comparing upstream template hashes with the recorded source baseline.
This list is advisory and does not authorize replacing local content. Save the drift report before update; update advances the source baseline.
Older manifests with no project-file hashes report those upstream files for review.

Configuration keeps the source-template hash (`sha256`) and the configured file hash (`configuredSha256`) for managed files.
Updates compare managed files against the configured baseline. Local edits, deleted managed files, and preserved adoption conflicts stop the update.
The `--overwrite-modified` flag cannot bypass these conflicts.
Older manifests automatically release ownership of files that match the current `projectOwnedGlobs`. Updates preserve those files, including local edits and deletions.

Updates reuse the approved packet at the recorded `decisionsPath`. The optional `--decisions` argument selects a different approved packet in the target repository. Missing decisions or invalid incoming templates stop the update before it changes files. The manifest advances only after configuration succeeds.

```bash
node ./scripts/harness-sync.mjs update --target /path/to/existing-project
```

### Existing Project Migration

This revision changes startup context, verification scopes, and eval runtime identity. Updates preserve project-owned files and `package.json`.
The script fragment is bootstrap-only. An update does not merge its new commands into an existing package.

1. Back up local edits. Capture `node ./scripts/harness-sync.mjs drift --target /path/to/existing-project --json true` before the update.
   Save `projectUpdatesAvailable`. The update advances that advisory baseline. Resolve managed-file customizations without force overwrite.
2. If the configured baseline is missing, use the baseline migration procedure below before the update.
3. Remove retired decisions: `ESLINT_CONFIG_PATH`, `SOURCE_TAG_*`, `ALLOWED_TARGET_TAG_*`, `PROJECT_JSON_PATH_*`, `PROJECT_REQUIRED_TAG_*`, and `EVAL_EVIDENCE_PATH_1`.
   If absent, add approved values for `EVAL_RUNTIME_VERSION`, `EVAL_PROMPT_VERSION`, and `EVAL_TOOL_CONFIG_VERSION`.
4. Run `node ./scripts/harness-sync.mjs update --target /path/to/existing-project` from the updated blueprint checkout.
5. Manually merge these required scripts into the target `package.json`. Preserve unrelated project commands.

   ```json
   {
     "context:check": "node ./scripts/automation/compile-runtime-context.mjs --check",
     "eval:integrity": "node ./scripts/agent-hardening/check-evals.mjs --integrity-only",
     "project:gates:release": "node ./scripts/automation/check-project-gates.mjs --profile release --run"
   }
   ```

   Compare all blueprint-owned commands with the updated `template/package.scripts.fragment.json` and merge any other missing or changed commands.
6. Manually merge the changed project contracts from the updated templates. Keep local facts, instructions, gates, and design conventions.
   - `AGENTS.md` and `docs/README.md`: startup reading, task-map routing, and the Engineering Invariants reference.
   - `README.md` and `docs/product-specs/CURRENT-STATE.md`: current capabilities, source anchors, unresolved gaps, and snapshot maintenance.
   - `docs/PLANS.md`, `docs/future/README.md`, and `docs/exec-plans/**`: remaining checklists, concise continuation, and evidence outside startup context.
   - `docs/QUALITY_SCORE.md`, domain guides, `ARCHITECTURE.md`, and `VISION.md`: current contracts and direction rather than delivery narratives.
   - `docs/ops/releases/release-mapping.md`: explicit release mapping for every plan-free implementation commit.
7. Merge `docs/governance/doc-checks.config.json`: `sizeBudgets`, `markdownExcludePrefixes`, and current-state freshness rules.
   Merge changed `requiredLinks`, `requiredHeadings`, and `metadataRules` for startup and snapshot documents. Preserve additional project checks.
   Merge the generated index contract in `docs/generated/README.md`. Regenerate `AGENT-RUNTIME-CONTEXT.md` instead of copying its template output.
8. Review `docs/governance/policy-manifest.json` and `docs/governance/project-gates.json` against local validation and authority boundaries.
   Merge scoped verification into `.github/workflows/**` and `scripts/ci/**`. Harness sync preserves these project-owned files.
9. Replace retired `nx_dep_constraints` and `required_project_tags` checks in `docs/governance/architecture-rules.json` with checks for the actual stack.
   If no boundaries apply, record an empty `checks` array and a concrete `rationale`. This reports “not enforced.”
10. Merge `runtime` into `docs/agent-hardening/evals.config.json`: `provider`, `model`, `runtimeVersion`, `promptVersion`, and `toolConfigVersion` from the approved packet.
    If repo-local prompt or tool configuration files affect agent behavior, add them to `additionalInputPaths`.
11. In the target repository, run `npm run harness:verify`, `npm run context:compile`, and `npm run eval:refresh`.
    Then run `npm run context:check`, `npm run eval:integrity`, and `npm run verify:fast`, plus affected project checks.
    Changed inputs invalidate previous eval results. A not-run report is valid for integrity, but it is not evaluation evidence.
12. Before agent activation, record real evaluation execution evidence and the evaluated `runtime`. Run strict `npm run eval:verify`.

See [the context migration details](distribution/context-refresh.md#existing-project-migration) for snapshot and queue maintenance.
Do not rerun adoption or overwrite project files with templates to satisfy these contracts.

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

Then configure the target with an approved decision packet through `scripts/bootstrap-configure.mjs` in the blueprint checkout.
Use real project commands and facts from source. Mark absent surfaces explicitly; do not invent three domains or capabilities to fill fixed template slots.
Configuration resolves placeholders. It does not establish useful project memory.
Before adoption is complete, populate applicable canonical owners with verified facts and source anchors.
Cover product behavior, architecture, stack, API/data contracts, security/privacy, reliability, validation, and deployed operations where applicable.
For UI projects, include theme/token, shared-component, and interaction anchors in `docs/ui/README.md`.
Mark absent domains not applicable. Record unresolved facts as owned questions.
Keep implementation detail in source. Do not duplicate catalogs or create a document for each update.
After configuration, run `npm run context:compile`, `npm run eval:refresh`, and `npm run verify:fast` in the target.
Clean bootstrap helpers with `npm run bootstrap:cleanup` after successful configuration.

## Agent Quickstart Prompts

Planning kickoff:

```text
Review this installed blueprint for the current project. This is planning-only; do not edit files.
Read AGENTS.md, docs/product-specs/CURRENT-STATE.md, the bootstrap questionnaire, package configuration, and relevant source.
Infer the product, actual stack, invariants, ownership, and real validation commands. Read VISION.md only if direction is needed.
Produce a decision packet for bootstrap-configure.mjs. Name missing decisions; mark absent surfaces not applicable.
Describe current capabilities and remaining gaps with source anchors. Propose a compact plan only for risky or multi-session work.
Stop after the reviewable decision packet and migration summary.
```

Execution kickoff:

```text
Apply the approved blueprint decision packet in this project. Preserve unrelated edits and existing project contracts.
Use the blueprint's bootstrap-configure.mjs; do not reimplement placeholder replacement or overwrite conflicting package scripts.
Populate applicable canonical owners with verified project facts and source anchors, including security/privacy and operational constraints.
For UI projects, link theme/tokens, components, and interaction conventions in docs/ui/README.md.
Mark absent domains not applicable. Record unresolved facts as owned questions. Configuration success alone does not complete adoption.
Reconcile current state against source and tests. Replace obsolete claims and remove resolved gaps; preserve historical evidence outside live context.
Wire real project gates. Create a plan only when risk, scope, or continuation needs it.
After state and queue changes, run context:compile, eval:refresh, and verify:fast.
An honest not-run eval report is valid for software integrity. Before agent activation, execute the configured suites and run eval:verify.
Implement product work only when the request includes it. Complete the applicable checks and cleanup, then report remaining gaps truthfully.
```

## Root Commands

- `npm run test:root`
- `npm run test:template-smoke`
- `npm run test:golden-adopted-repo`
- `npm test`

Root tests cover the distribution and bootstrap scripts. Template smoke owns the configured harness regression suite, including the CI classifier tests.
The golden fixture separately checks adoption into a real application. Its standalone full command includes fast checks without a second fast run.
CI runs the golden adoption workflow once on Linux with Node.js 24.x. It uses the public install, adopt, and configure commands.
The smoke and golden fixtures record real harness-test output under fixture-specific eval configs. They do not claim that agent evaluations passed.
