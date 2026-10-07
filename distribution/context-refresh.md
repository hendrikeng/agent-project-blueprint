# Context Refresh Audit And Migration

Status: Final audit repairs validated; ready for paired project trials
Owner: Platform Engineering
Last Updated: 2026-10-07
Source of Truth: Template changes, deterministic checks, and the linked provider guidance.

## Decision

Keep the repository context model. Make it smaller and maintain current facts in place.
A fresh agent reads `AGENTS.md` and `docs/product-specs/CURRENT-STATE.md`, then the requested plan and relevant source.
Product direction loads for product decisions. Domain policy loads for the affected boundary. Delivery history stays outside startup context.
Code changes also require the short Engineering Invariants contract and the relevant surface guide. A shorter prompt must still make essential rules discoverable.

The previous payload had 63 Markdown files, 27,256 whitespace-separated words, and 202,283 UTF-8 bytes.
After the audit repairs, this revision retains 63 paths for compatibility, with 12,300 words and 95,164 bytes.
This is about 55% fewer words and 53% fewer bytes than the baseline.
Small pointer files preserve existing references. The file count is not the startup context cost.
Five Markdown files remain unchanged from the baseline; the other 58 are rewritten or updated.
These measurements cover template Markdown, including PR templates, bootstrap guidance, and generated context. They do not estimate model tokens.

## What Caused Drift

Current product facts, delivery history, general rules, and future intent were repeated across many files.
The generated runtime prompt repeated policy instead of showing remaining work.
Plan and evidence requirements added paperwork to small fixes.
Date refreshes could conceal stale facts. Existing project-owned docs were preserved during updates, but upstream guidance changes were hard to notice.
Ordinary software checks required completed agent evaluations even though the blueprint supplied no agent runner.

Read-only inspection of the supplied Tracn projects showed the accumulation pattern:

| Project | Markdown files under docs | CURRENT-STATE bytes | CURRENT-STATE lines |
| --- | ---: | ---: | ---: |
| tracn-web | 670 | 126,215 | 371 |
| tracn-api | 940 | 132,069 | 564 |

Several domain docs were also tens of thousands of bytes. Long single lines made line counts misleading.
These are evidence for a migration need, not a determination that every historical document should be deleted.
Neither Tracn repository was changed.

## Modern Model Guidance

OpenAI's [model guidance](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6.1-sol) supports explicit goals, clear constraints, proportional verification, and evaluation on the actual workload.
The template avoids a model-specific prompt fork for Sol, Astra, or Claude. The eval config records the exact model and runtime being evaluated.
A model upgrade does not justify assuming a prompt is optimal without measuring task behavior.

Anthropic's [context engineering guidance](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) favors small, high-signal context and retrieval when needed.
Claude Code's [memory documentation](https://code.claude.com/docs/en/memory) describes instruction discovery and imports; its [best practices](https://code.claude.com/docs/en/best-practices) favor concise repository instructions.
Check the installed client's discovery rules. Keep provider entrypoints as pointers to one canonical owner when an adapter is needed.
An import still consumes context. Do not copy the same rules into AGENTS, CLAUDE, and generated prompts.

`VISION.md` remains useful for direction and tradeoffs. It is no longer required reading for every edit.
For a small product, README can own direction and VISION can point to it.
This audit concerns the product vision document. Image or screenshot input remains useful only when the task needs visual evidence.

## Internet Cross-Check: 2026-10-07

Current primary sources support the compact context model. This is an assessment of instruction and workflow design, not evidence of improved model performance or complete security coverage.
The earlier exhaustive reviews cover all 170 repository source files. This follow-up compares upstream guidance with the relevant context, discovery, engineering, security, UI, and evaluation owners; it does not repeat that full file audit.

| Primary source | Implication and blueprint decision |
| --- | --- |
| [Anthropic: context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) | Keep small startup context, source references, conditional retrieval, and durable continuation. Shortness alone is not the goal; enough relevant context must remain. |
| [Anthropic: long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) | Keep explicit acceptance items, recoverable session state, and checks of working behavior. Its sample progress log and feature JSON are implementation examples, not reasons to add duplicate project-memory files. |
| [Anthropic: harness design, March 2026](https://www.anthropic.com/engineering/harness-design-long-running-apps) | Reconsider scaffolding when models change. Compare one removal at a time. Added that method to EVALS; retain conditional planning and evidence rather than requiring a fixed multi-agent pipeline. |
| [Anthropic: agent evaluations](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) | Evaluate actual outcomes on representative tasks, with repeated trials where needed. Keep software checks separate from agent readiness. EVALS now explicitly compares correctness, recovery, context use, time, and cost. |
| [Claude Code: memory](https://code.claude.com/docs/en/memory) and [best practices](https://code.claude.com/docs/en/best-practices) | Verify effective instruction loading; keep shared policy in one owner. Clarified that `.claude/CLAUDE.md` can suppress default AGENTS discovery and that Claude does not directly load Codex's `AGENTS.override.md`. Check the installed client rather than assuming these rules never change. |
| [OpenAI: Astra prompt and skill guidance](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra) and [Sol 6.1 guidance](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6.1-sol) | Keep relevant requirements, remove repetition, and use conditional reading. No provider-specific policy fork is needed merely because a model changes. |
| [OpenAI: Codex as a platform](https://developers.openai.com/blog/codex-as-a-platform), [agent improvement loop](https://developers.openai.com/cookbook/examples/agents_sdk/agent_improvement_loop), and [Anthropic: Managed Agents](https://www.anthropic.com/engineering/managed-agents) | Keep project context separate from replaceable execution machinery. Use observed failures and task evaluations to justify harness changes. These examples do not require a new runtime, memory service, or evaluation dependency in this blueprint. |
| [OWASP: API resource consumption](https://api-security.owasp.org/editions/2023/en/0xa4-unrestricted-resource-consumption/) | Restore conditional API rate-limit and resource-bound guidance in the existing API owner. Record enforcement and rejection behavior, and verify changed limits. Authorization alone does not bound resource consumption. |
| [OpenAI: instruction discovery](https://learn.chatgpt.com/docs/agent-configuration/agents-md) and [execution plans](https://developers.openai.com/cookbook/articles/codex_exec_plans) | Retain client discovery checks and living plans for substantial work. Do not require a plan for every minor edit. |
| [Google: code review](https://google.github.io/eng-practices/review/reviewer/looking-for.html) | Existing invariants cover behavior, affected callers, complexity, useful tests, current documentation, and review of the actual diff. Retain these rules without adding another checklist owner. |
| [OWASP: vulnerable dependencies](https://cheatsheetseries.owasp.org/cheatsheets/Vulnerable_Dependency_Management_Cheat_Sheet.html) | Added conditional advisory and application-exposure review to SECURITY. Use declared checks and record unresolved risk with mitigation and an owner. A scanner pass alone does not establish safety. |
| [W3C: WCAG 2.2](https://www.w3.org/TR/WCAG22/) | Existing accessibility guidance remains. Made contrast, zoom, unobscured focus, and non-color status/error signals explicit in UI-STANDARDS. These checks do not claim full WCAG conformance. |

Four existing documentation owners changed in this follow-up. No new template files, dependencies, mandatory agent pipeline, or scanners were added.
The raw evaluation report was refreshed to match changed instruction inputs and remains honestly not-run. No model evaluation was performed.
Validation on Node 24.21.0: configured template smoke checks passed, including governance, fixture evaluation, fast gates, bootstrap cleanup, and installed instruction structure. Raw-template context freshness and final whitespace validation passed. Raw-template evaluation verification skips unresolved placeholders; its refreshed input hash was checked separately. Fixture evaluation is harness evidence, not a model trial.

Keep VISION for intended direction and tradeoffs; keep CURRENT-STATE for verified behavior and current gaps. Update direction when product decisions change. For a small product, the validated README pointer avoids repeating the same direction text.
This division is our project-memory design choice; upstream guidance supports selective context but does not prescribe these filenames.
The next evidence remains paired trials in adopted projects. A clean internet cross-check cannot establish that nothing is missing or that agents will maintain facts correctly.

## Final Old/New And Bloat Audit

The fresh Astra medium-reasoning Worker recommends the rewrite over the baseline. It independently confirmed the inventory and text measurements before the final three wording repairs.
Its coverage includes current template Markdown, baseline documentation comparisons, ownership and configuration contracts, and selected runtime and test owners. It did not read every executable or test body, run tests, or evaluate agent behavior.
The coordinator verified and repaired its three findings in existing owners: conditional API resource limits, authorized execution in the slice PR checklist, and the pending-validation exception in the active-work guide.
No template files, runtime code, dependencies, or workflow stages were added in this follow-up. Configured template smoke checks passed on Node 24.21.0: 142 tests, zero failures, plus governance, PR-template contracts, instruction structure, and bootstrap cleanup. Log: `/tmp/blueprint-astra-medium-smoke.log`.
The Astra Worker independently reread the three repaired owners and confirmed that all three findings are resolved. Its confirmation was read-only and did not rerun tests.
The adviser still identifies inherited paperwork costs: fixed questionnaire slots, sensitive-change closeout metadata, and matching snapshot dates. Measure their cost in project trials before changing compatibility contracts. The template must not turn absent domains into invented facts.
The earlier detailed assessments below are historical review snapshots. Their measurements and findings describe the version each reviewer inspected; the Decision and this section own the current verdict.

The final independent AutoReview compared the selected change with baseline `86bb55f8d86c28d25551ab274b8b73ba8c70aa5a`.
It used Codex `gpt-6.1-sol` at high reasoning and two isolated review passes. It consulted current official Anthropic and OpenAI guidance.
The review covered the changed bundle. Each pass had its own source scope; unchanged implementations were unavailable to that reviewer.
The earlier exhaustive advisers retain the all-file comparison. After the Astra follow-up, the complete inventory is 169 tracked regular files, 114 changed, 55 byte-identical, and this additional report.
This follow-up does not claim a new independent full-body review of unchanged files.

The review found two P2 defects. Existing owner tests reproduced both before production repairs:

| Finding | Repair and retained protection |
| --- | --- |
| Authentication paths lost sensitive-change classification | Auth0, NextAuth, and custom `authprovider` filenames now select broad CI and require sensitive closeout. A follow-up finding exposed the root problem with a restricted authentication vocabulary. The repair uses a conservative `auth` match after excluding delimited ordinary author words. Author components and stylesheet tokens retain their low-risk path. |
| Checked deliverables incorrectly implied completed work | Active `validation` and `in-review` plans can remain in the index with zero unchecked implementation items. Governance accepts those stages. Empty checklists, finished implementation-stage plans, and finished future proposals still fail. Delivery closeout still requires completed plans and evidence. |

Four existing regression tests failed before the repairs. All 18 focused tests passed after the repairs.
The post-repair review confirmed the lifecycle repair but found the NextAuth case. Two owner tests reproduced that failure before the general repair.
The same tests exposed lowercase `securityheaders` and `accesstoken` compounds. Sensitive substring checks now remain conservative across compound names.
Only delimited ordinary author words and stylesheet token matches receive the deliberate exceptions. Other sensitive words in stylesheets still select the sensitive path.
Final integrated validation passed on Node 24.21.0: 61 root tests, 142 template-smoke tests, 142 installed-harness tests, four application unit tests, and one integration test.
All 18 focused owner tests passed after the final general repair. Context freshness, raw evaluation-input identity, and whitespace checks passed.
The final independent rerun returned `scoped-clean`: zero accepted P0–P2 findings across both change-bundle passes, with exit code 0.
Its scope excludes unchanged implementations. Each pass's conclusions cover its supplied source, not the other pass's unavailable bodies.
The raw evaluation report remains `not-run`. These results establish harness checks and review findings, not improved model behavior.
Final review outputs: `/tmp/blueprint-final-confirmed-review.txt`, `/tmp/blueprint-final-confirmed-review.json`, and `/tmp/blueprint-final-confirmed-review-status.json`.
Integrated validation log: `/tmp/blueprint-final-confirmed-tests.log`. These local logs are supplementary and may not persist.

### Architecture, Stack, And Adoption

| Information | Current owner and initialization |
| --- | --- |
| System structure | `ARCHITECTURE.md` routes to `docs/architecture/TOPOLOGY.md`. Adoption records actual deployables, entrypoints, contracts, stores, integrations, and owners there. This is an authoring task, not a dedicated replacement token. |
| Frontend stack | `docs/FRONTEND.md` contains `FRONTEND_STACK` and two entrypoint placeholders. Manifests, lockfiles, configuration, and local patterns establish the actual versions and conventions. |
| Backend and data stack | `docs/BACKEND.md` contains `BACKEND_STACK`, `DATA_STACK`, and two entrypoint placeholders. Schema contracts belong in `docs/generated/db-schema.md`. |
| Visual conventions | Project-owned `docs/ui/README.md` links palette/token sources, typography, spacing, components, and interaction conventions. Source files retain token values. |
| Environment and operations | `docs/env/README.md` and `docs/deploy/README.md` record actual configuration, targets, ownership, rollout, verification, and recovery. |

The questionnaire initializes the stack and entrypoint placeholders. The execution kickoff also requires verified facts in applicable canonical owners.
Replacing tokens does not automatically populate topology, UI conventions, or domain contracts. Configuration success is not completed adoption.
The edits remain in `/Users/hendrik/Code/paseo-worktrees/1pwdo01c/blueprint-context-refresh`; the original checkout does not contain them yet.

### What Prevents Bloat And What Remains Manual

Current facts, intended direction, unfinished execution, and historical evidence have distinct owners.
README remains an orientation summary. Domain owners retain details and source anchors. Short repeated reading instructions do not create duplicate product-fact catalogs.
Small fixes do not require a plan by default. Larger work uses one plan, one replacement continuation, and a thin evidence index.
Resolved gaps disappear from live state. Enduring decisions enter their current owner before the plan moves to history.
The generated index excludes completed history and limits displayed queues. File budgets constrain live UTF-8 size; freshness checks detect stale generated inputs.

These checks do not detect every semantic duplicate, prove prose against code, or impose a total repository-document budget.
Many small files can still accumulate if authors ignore the ownership rules. Date changes alone cannot establish factual freshness.
Maintenance must inspect abandoned plans, duplicate fact owners, obsolete claims, and unnecessary documents against source and actual task outcomes.
This is a maintained engineering contract with deterministic support. It is not an automatic knowledge-cleanup service.
No extra document generator, semantic scanner, memory database, or mandatory multi-agent pipeline was added.
Paired project trials remain necessary to establish better engineering outcomes and reliable context maintenance.

## Enforced Changes

- Default live Markdown budget: 16,000 UTF-8 bytes. AGENTS: 6,000. README: 8,000. Current state: 12,000.
- Historical evidence and reference material stay outside the default live budget and routine startup reading.
- The current-state snapshot separates capabilities, unresolved gaps, and risks. Replace changed rows and remove resolved items.
- Current State Date age over 30 days produces a warning. A recent file-edit date does not hide an old snapshot verification date. Missing or future timestamps remain errors. A date does not establish semantic truth.
- Generated context hashes current state, startup instructions, and unfinished plans. It excludes completed work and repeated policy.
- The index shows up to eight plans per queue, ordered by priority and ID. It explicitly reports omitted entries and links the directory.
- `context:check` detects stale output without writes. Compile only after intentional state or queue changes.
- Fully checked future plans and active implementation plans require reconciliation or closure. Active `validation` and `in-review` plans can retain checked deliverables while checks or review remain pending. Checklist completion alone does not establish closeout.
- Small low-risk fixes can use their PR or commit summary when the delivery classifier permits it. Tooling, policy, dependency, and sensitive changes conservatively require a plan. Routine README and snapshot maintenance do not require a plan by filename alone. Risky or multi-session work uses one plan and one replacement continuation section.
- Planned closeout requires a thin changed evidence index. It links concise validation in the plan and artifacts instead of duplicating them.
- Git guidance preserves unrelated staged work. Runtime permissions and explicit user instructions take precedence.
- Ordinary verification uses `eval:integrity`; strict `eval:verify` still requires real execution evidence before agent activation.
- Eval refresh resets changed inputs to an honest not-run report. It never runs a model or manufactures a pass.
- Harness alignment checks stable sections and commands rather than exact prose.
- Sync reports upstream project-owned template changes in `projectUpdatesAvailable` while preserving local files.

## Engineering Coverage Compared With The Original

The independent `gpt-6.1-sol` high-reasoning coverage review found omissions that the earlier diff reviews did not detect. The compact structure remains, with these repairs:

| Original value | Current owner and decision |
| --- | --- |
| Correctness under delivery pressure | Engineering Invariants preserves authority, required validation, data integrity, and recovery. AGENTS requires it for code work. |
| Root-cause fixes and affected callers | Engineering Invariants requires tracing the cause and inspecting sibling paths. |
| Simple implementation and useful validation | Keep existing patterns, justified abstractions, introduced-code cleanup, focused regression checks, and review of the actual diff. |
| Frontend continuity | Frontend retains shared components, local state ownership, one query/mutation owner, canonical values, optimistic reconciliation, accessibility, responsive checks, and safe destructive actions. |
| Actual frameworks and versions | Discover the owning manifest, lockfile, configuration, and local conventions. Adoption must supply useful source/configuration anchors. Generic templates do not impose one framework or duplicate version guides. |
| Mutation correctness | Backend covers shared contracts, staged compatibility, transactions, idempotency, derived-state refresh/recovery, and required audit trails with redaction. Detailed migration obligations remain in the schema owner. |
| Long-running product work | Reliability requires resumable state, observable progress, and terminal status when work must outlive a request or browser session. Backend routes applicable work there. No queue technology is prescribed. |
| Takeover context | Keep one replacement continuation section with objectives, remaining work, decisions, approvals, paths, validation, blockers, and next action. Refresh after material changes; reconcile against current instructions and files on resume. |
| Current product and outstanding work | Current state replaces obsolete claims. The generated index now includes nested unfinished plans, excludes evidence, rejects symlinks, and hashes all included plan content. |
| Safe authorization | Scope persists across retries and handoffs. Unclear targets or effects stop dependent execution until resolved. Native controls remain binding. |
| Evidence and activation | Completion prose matches the required evidence index. Evaluation identity includes required startup state and explicitly configured task conventions. Integrity is separate from behavioral evaluation. |
| Universal process and layout prescriptions | Keep removed: routine full-tree reading, fixed six-layer architecture, universal dashboard/form layouts, repeated policy, session diaries, speculative memory services, and repeated approval rituals. |

These rules retain operational guarantees without restoring the original volume. Dates, checklists, and hashes still cannot identify undocumented shipped behavior or establish model performance.

The gates can catch excessive size, stale generated inputs, structural errors, and finished queue checklists.
They cannot determine whether a feature was implemented without updating its plan, whether an unchecked gap is obsolete, or whether a transcript is genuine.
Closeout still requires inspection of source and relevant evidence. Automatic deletion of uncertain project facts would be unsafe.

## Existing Project Migration

Perform this separately in a scoped project worktree. This blueprint change does not migrate existing applications.

1. Capture `harness-sync drift --json true` and the current local state before update. Save `projectUpdatesAvailable`; update advances the source baseline.
2. Read the installed manifest, approved decisions, local instructions, and current project gates. Reconcile managed customizations without force overwrite.
3. Check the current-state claims against source and tests. Build a concise replacement capability table with shipped, partial, or unavailable state and source anchors.
4. Remove implemented gaps and resolved risks from live context. Close corresponding plans only when evidence supports completion. Preserve history in completed records.
5. Replace delivery narratives in domain docs with current contracts. Move valuable reference detail outside startup context; do not move policy authority into an archive.
6. Merge the new startup guidance, snapshot sections, byte budgets, freshness policy, package commands, and generated index contract into project-owned files.
7. Adopt scoped verification changes with local CI classifiers and workflows. These project-owned files are not overwritten by harness sync.
8. Recompile context, refresh eval integrity, and run the project's affected checks. Use strict agent evaluations before relying on a changed autonomous configuration.
9. Start a fresh agent with only the normal entrypoints. Confirm it can identify current capabilities, outstanding work, required checks, and boundaries. Record observed mistakes as targeted eval cases.

Do not wipe the documentation tree. Do not mark a plan complete solely because it looks old.
Keep project-specific facts, production boundaries, and human instructions intact.

## Evaluation And Maintenance

For a useful before/after comparison, hold the provider, exact model, reasoning setting, permissions, tools, and task fixtures constant.
Compare task completion, stale-state errors, unnecessary reading, duplicate documentation, unsafe actions, and validation claims.
Include interruption and resume, an implemented but stale gap, a small fix, a product-direction decision, and a denied action.
Use representative repeated runs when outcomes vary. Count context bytes or actual tokens separately from task success.
The deterministic tests in this change establish harness behavior. They do not establish comparative model performance.

Review live state when behavior changes. Revisit provider discovery rules and evaluation configuration during a model or client upgrade.
Update the canonical owner rather than adding another prompt. Keep the smallest context that supports correct work.

## Validation

The five follow-up audit repairs passed 34 focused tests and `npm test` (62 root tests and 142 configured harness tests).
The baseline migration regression covers configuration at `86bb55f`, cleanup, update, required manual merges, and scoped fast verification.
The eval report remains not-run with no execution evidence. No comparative agent trial ran for these repairs.

After the earlier engineering coverage repairs, `npm test` passed: 55 distribution/bootstrap tests, the 116-test configured harness suite, and the adopted Reading List application's full, release, and cleanup workflow.
Focused tests cover nested plan visibility and freshness, evidence exclusion, symlink rejection, and required startup state in evaluation identity.
After the final durability prose repair, the configured template smoke, `context:check`, and `git diff --check` passed again.
`git diff --check` passed. The original checkout stayed clean.
Two earlier independent Codex diff reviews returned scoped-clean with no actionable P0–P2 findings in their supplied bundles. The subsequent whole-blueprint coverage review found the gaps described above. A clean diff review does not establish engineering completeness or agent performance. No reviewer evaluated model behavior.
The requested `gpt-6.1-sol` high-reasoning coverage adviser confirmed the eight repairs, identified the remaining product-job durability gap, and then confirmed its repair. The final AutoReview code bundle returned scoped-clean with no actionable P0–P2 findings. The adviser checked completion contracts read-only; neither reviewer independently reran the full test suite.
The local worktree remains uncommitted. No downstream migration or publication was performed.

## Repairs From The Exhaustive Audit

The whole-file audits found inherited contract defects and one new integrity defect. The repairs preserve compact startup reading.

| Contract defect | Repair and evidence |
| --- | --- |
| Eval refresh and cleanup can follow symlinked write targets | Shared component checks reject report, package, manifest, and removal aliases before mutation. External contents remain intact. |
| Merge queues re-audit source commits already published through squash or rebase | Commit analysis excludes canonical published source ancestry. Tree comparisons retain the selected landed boundary. Missing companion tags keep ancestry visible. |
| Required release-profile gates do not execute | Release CI and local adoption validation execute the release aggregate. The focused range checker remains a leaf command. |
| Mapped small-fix releases require an unnecessary plan | Plan-free releases require accepted mappings for every relevant implementation commit. Unmapped code still blocks. |
| Changed completed plans bypass the completion contract | Shared validation checks metadata, targets, raw lanes, resolved approval, checked deliverables, closure, and validation evidence. |
| Completion catalogs reject historical filename identities | Worktree, index, and selected-head catalogs reuse filename inference for unchanged history. New completed plans still require explicit IDs. |
| Completion snapshots share or omit evidence requirements | Worktree and index validate separately. Release reads selected-head metadata and changed, normalized, regular, nonempty evidence. |
| Baseline exemption instructions contradict their checks | Four baseline declarations remain mandatory. Explicit exemptions require empty commands and concrete reasons; exemptions do not prove successful checks. |
| Sensitive root and camel-case filenames bypass closeout | CI and closeout use the same conservative keywords, including authentication, authorization, identity, tenancy, persistence, and token names. |
| Nested plans cannot complete reference repair | The catalog recurses, preserves suffixes, and excludes receipts. Check mode detects stale references without writes. |
| Nested receipts count as plans or live context | Queue, closeout, release, and governance owners exclude receipt directories consistently. Evidence-index paths retain their contract. |
| Time-bound unrun reports can claim current inputs with stale hashes | Integrity requires current input identity in both freshness modes. Time limits remain additional checks. |
| Bootstrap repeats fast verification | Bootstrap runs full once. Full owns its fast prerequisite; failure stops later steps. |
| Optional Tags are documented but rejected | Unsupported guidance removed. The existing metadata contract remains authoritative. |
| Workflow security tests accept insecure formatting changes | Checks recognize named steps, active option lines, comments, and inherited read-only permissions. Current official action revisions are pinned. |
| Retirement tests pre-remove the file they claim to test | The fixture restores recorded content before update; existing assertions now prove removal. |
| Gate tests never execute actual failing commands | Existing owner tests execute fast and release profiles, observe exit 7, and reject an unselected deploy sentinel before checking that later gates do not run. |
| Release notes silently lose evidence summaries | End-of-input matching preserves blank-line-separated evidence bullets and stops before the next section. The selected-head regression observes both bullets. |
| Temporary fixtures lack cleanup ownership | Runner finally blocks and test teardown remove owned directories on success or failure. Setup registers teardown before writes. |

The first Node 24.21.0 full run passed: 61 distribution/bootstrap tests, 142 configured harness tests, and the golden adopted application workflow.
Golden adoption repeats the harness suite in its installed repository and runs four application unit tests plus one integration test.
The private temporary-directory check found no retained test repositories. Only Node's compile cache remained before outer cleanup.
The final Node 24.21.0 full run also passed: 61 root tests, 142 configured harness tests, 142 installed harness tests, four application unit tests, and one integration test.
After that run, the evidence-summary repair and stronger gate isolation fixture passed all 23 affected owner tests. The test adviser confirmed both precise repairs read-only.
The final isolated AutoReview used Codex `gpt-6.1-sol` with high reasoning. Both supplied bundles completed with zero findings and a `scoped-clean` P0–P2 result. The reviewer did not run project tests. Its result applies to the supplied changed-file context; it does not establish model performance or correctness of unavailable unchanged implementations.
Context freshness, documentation governance, and diff whitespace checks passed after the final code repairs. The original checkout remains clean.

Regression checks failed for their intended defects before G2/G4 and historical-identity repairs.
Controlled removal of G1, G9, G5, G8, and G10 repairs also made their owner regressions fail.
The evidence-summary regression failed before its parser repair. Removing profile filtering made both selected-profile cases fail with exit 9 instead of 7.
Those temporary changes were restored before validation. No faulted owner entered the final bundle.

Syntax checks passed for all 73 JavaScript modules. All 20 JSON files parse.
Context freshness, documentation governance, and diff whitespace checks passed.
The raw template remains honestly unrun for agent behavior. Fixture evaluation records are harness evidence, not model trials.

The [Astra guidance](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra) supports conditional instructions and proportional verification.
Current Claude discovery can depend on nearby CLAUDE files. Adoption verifies effective context and imports the canonical AGENTS owner when needed.
The [Claude memory guide](https://code.claude.com/docs/en/memory) defines this discovery behavior.
Workflows use pinned revisions of [checkout](https://github.com/actions/checkout), [setup-node](https://github.com/actions/setup-node), and [upload-artifact](https://github.com/actions/upload-artifact).
Implicit package caching is disabled. Checkout credentials are disabled in read-only CI; publication and private-fetch workflows retain required authentication.

These are local results on macOS and Node 24.21.0. Hosted GitHub jobs and their full OS/version matrix were not executed here.
Path classifiers remain project-owned heuristics. Runtime checks cannot prove that a document describes the actual product or that an approval occurred.
The symlink checks cover observed filesystem components. They do not provide atomic isolation against concurrent hostile filesystem changes.
No comparison measured agent performance across Sol, Astra, or Claude. Such claims require controlled trials in adopted projects.

## Astra Whole-File Opinion And Repairs

A fresh `gpt-6-astra` adviser at high reasoning compared all 169 baseline files with current bodies and the added report.
It read both full bodies for changed files and verified byte identity before reading unchanged files once. No source file was omitted.
Its independent recommendation supports the compact lifecycle but identifies five material P2 gaps. It found no P0 or P1 issue.

| Finding | Targeted repair |
| --- | --- |
| Project UI facts conflict with managed ownership | Keep generic checks in UI-STANDARDS. Put project facts and source anchors in project-owned docs/ui/README.md. |
| Small maintenance generates unnecessary plans | Match sensitive path words, including camel-case boundaries. Preserve authentication and session-token coverage. Exclude design-token stylesheets and remove README/snapshot filename escalation. |
| Applicable environment/deployment/contracts are hard to find | Add task-map routes and require applicable entries before changing a surface. |
| Product-data privacy rules were lost | Restore minimization/redaction across storage and outputs, with actual retention/deletion needs. |
| Configuration passes without useful project memory | Adoption must populate applicable canonical owners with verified facts and source anchors. Mark absent domains and owned unresolved questions. Promote enduring decisions before archiving. |

The adviser also identified stale verdicts in this report. Those rows now describe the current bodies, with obsolete finding references removed.
A conditional performance rule now requires measurement of the affected bottleneck and preservation of existing budgets.
The unused delivery-log helper remains a compatibility follow-up, not a current continuation mechanism.

VISION owns intended users, outcomes, scope, non-goals, and tradeoffs. CURRENT-STATE owns observed capabilities, unresolved gaps, and current risks.
Update vision when direction changes. Do not copy shipments, task lists, or release history into vision.
For small projects, README can own Product Direction. VISION can retain only metadata and a validated source pointer.
The existing smoke runner exercises that pointer and rejects a missing target. No new file or document is required.

The harmless author-path regressions failed against the previous matchers and passed after repair.
The vision pointer failed against the old heading checker before the repair. The coordinator then observed a full Node 24 pass: 61 root, 142 smoke, 142 installed harness, and application 4+1 tests.
The adviser confirmed F1/F3/F4/F5 and the vision distinction read-only. It found themed-token stylesheet false positives and missing README-owned direction in evaluation identity.
The first isolated Astra review identified missing OAuth and plural schema alternatives in the narrowed risk matcher. Those paths previously selected broad validation.
Follow-up repairs suppress only token words in stylesheets, preserve other sensitive words/prefixes, and cover OAuth and schemas. README now participates in evaluation identity.
Existing owner regressions failed before these repairs and passed afterward. The final follow-up Node 24 suite passed: 61 root, 142 smoke, 142 installed harness, and application 4+1 tests.
Astra independently confirmed the precise follow-ups through read-only probes and source inspection. Its earlier privacy, discovery, adoption, and vision findings remain closed.
The isolated rerun confirmed those repairs but found authentication verb forms absent from the bounded matcher.
Both owners now match authentication/authorization word families, including authenticate, authorize, authenticator, and unauthorized. AuthorCard and AuthorsList remain harmless controls.
The existing classifier and closeout regressions failed before repair. All 15 focused classifier, closeout, and release tests then passed.
The final isolated Astra high review completed both bundles with zero findings and a scoped-clean P0–P2 result. The reviewer did not execute project tests.
The result covers its supplied changed-file context. It does not prove semantic accuracy or better agent behavior.
Actual project trials remain the next behavioral evidence.

For behavioral evidence, compare baseline and revision with identical projects, requests, clients, models, permissions, and tools.
Include adoption/fresh takeover, interrupted cross-surface work, and small maintenance plus nested closeout/update.
Measure factual errors, missed contracts, completion claims, unnecessary reads, documentation churn, and recovery.
Correctness takes priority over context size. One run per case is a smoke trial, not a model ranking.

## Exhaustive File Review And Independent Sol Explanation

This is a historical assessment of the version reviewed before the later internet and final-audit repairs. Its file dispositions and measurements are not the current verdict.
The fresh Sol 6.1 high-reasoning adviser compared all 170 files against the original baseline.
The following explanation replaces the earlier disposition matrix. Each path appears once in its complete inventory.
This report remains outside the installed template and routine project startup context.
The adviser made no edits. Its first-person statements below refer to that independent assessment.
After the comparison, the coordinator corrected its two wording findings: the eval-integrity comment and the golden snapshot's future-work description.
The final golden adoption check for those wording corrections is recorded separately below.

The revised blueprint is a smaller, more clearly organized system for giving agents reliable project context. Its strongest improvement is **fact ownership**: product direction, current behavior, implementation contracts, unfinished work, and historical evidence have separate homes. An agent should be able to find the relevant facts without reading the project’s entire delivery history.

That can improve engineering work because the agent has fewer competing descriptions to reconcile, clearer routes to actual source, and explicit rules for updating memory when behavior changes. It does **not** yet prove better model performance. The demonstrated improvements are smaller documentation, repaired harness behavior, stronger completion checks, and passing local tests.

I compared baseline `86bb55f8d86c28d25551ab274b8b73ba8c70aa5a` with the actual uncommitted worktree. I read the full original and current bodies of changed files; for unchanged files, I verified byte identity and read one complete body. I read the new report after the source comparison. **Coverage is all 170 files, with no omissions:** 113 changed tracked files, 56 unchanged tracked files, and one new report. This assessment made no edits and ran no mutating tests.

## What is better, and why

The original already contained valuable engineering guidance and substantial automation. Its weakness was how that information accumulated and competed for attention.

Several documents repeated general rules, product facts, navigation, and delivery process. The generated runtime context repeated policy rather than concentrating on remaining work. Product intent, shipped behavior, gaps, and delivery history were easier to mix together. A fresh agent could therefore read a large amount of apparently authoritative material while still missing the current answer.

The revision establishes a clearer lifecycle:

1. **Start with operating instructions and verified current behavior.**
2. **Load the contracts for the affected task.**
3. **Inspect the actual implementation and configuration.**
4. **Keep unfinished work in a plan and one replaceable continuation.**
5. **Update changed facts in their existing owners.**
6. **Promote enduring decisions before moving delivery evidence into history.**

That last step matters. Archiving a completed plan should not make an important architectural or security decision disappear from the documents future agents normally consult.

The smaller documents also avoid prescribing unnecessary implementation choices. Architecture describes the project’s actual boundaries instead of imposing six layers. UI guidance preserves generic accessibility and interaction requirements while routing palette, tokens, components, and local conventions to project-owned documentation and source. Framework guidance requires inspection of manifests, lockfiles, configuration, and local patterns rather than trusting a generic framework summary.

The revision retains essential guarantees:

- Delivery pressure does not justify weakening authorization, validation, data integrity, or recovery.
- Fixes should address causes and affected callers.
- API, persistence, and consumer contracts must remain aligned.
- Mutations need appropriate transaction, retry, idempotency, reconciliation, and audit behavior.
- Work that outlives a request needs durable state and recoverable progress where applicable.
- Privacy includes minimization, redaction, retention, and deletion—not merely secret handling.
- UI completion requires appropriate behavioral evidence; a successful build alone is insufficient.
- Permissions and explicit instructions remain binding across retries and handoffs.
- Completion and evaluation claims must match their evidence.

There are also concrete automation repairs. Completed plans now share a stronger validation contract. Worktree, staged index, and selected Git revision are checked in their own identities. Release aggregates execute the declared release gates. Published source ancestry is handled more carefully. Writers reject relevant symlink aliases before mutation. Evaluation integrity is separated from actual behavioral activation.

Those are engineering improvements demonstrated by source and regression checks. Whether agents consistently discover and follow the guidance remains a project-trial question.

At this historical review, the same 63 template Markdown paths went from **27,256 to 12,063 words**, and from **202,283 to 93,432 UTF-8 bytes**. The current measurements are in Decision. Neither measurement establishes startup tokens or model speed.

## Where facts belong

| Kind of information | Owner and reading rule | When to update it | What should not be copied there |
|---|---|---|---|
| Product direction | VISION; a small project may use the validated README Product Direction section | When intended users, outcomes, scope, non-goals, or tradeoffs change | Routine shipments, release history, task checklists |
| Actual product state | Current-state snapshot; normal startup reading | When verified behavior, unresolved gaps, risks, or relevant anchors change | Session diaries, completed delivery narratives, speculative capabilities |
| Implementation and contracts | Actual source/configuration, with concise architecture, API, schema, security, reliability, environment, deployment, and UI owners | When the corresponding boundary or enduring decision changes | A second copy of the code, dependency catalog, or token catalog |
| Unfinished work | Future/active plans; one replaceable continuation for work that needs it | After material progress, changed constraints, interruption, or a new next action | An accumulating transcript of every session |
| Historical evidence | Completed plans and concise evidence indexes | At validated closeout; preserve useful provenance | Live product truth or policy that future agents need routinely |
| Generated navigation | Runtime context index | Regenerate after its inputs change; check freshness without writing | Independent policy, completed history, or manually maintained product facts |
| Evaluation evidence | Evaluation report plus actual execution artifacts | After relevant input changes or real evaluation execution | A fabricated pass produced by refreshing metadata |

The documents provide **verified anchors and decisions**. Source owns implementation detail. For example, a UI owner should identify the theme file and shared button implementation, explain a meaningful convention, and link them. It should not reproduce every color and component property in another catalog.

A shipment does not automatically require a VISION update. A feature can change current behavior while leaving product direction intact.

## Concrete before-and-after behavior

| Situation | Original failure mode | Expected revised behavior | Engineering effect |
|---|---|---|---|
| Fresh takeover | Repeated policy and long delivery context can obscure what works today and what remains | Read startup instructions and current state; consult the task map, relevant plan, and actual source. Use the generated index to locate unfinished work | Faster orientation is plausible; fewer competing claims and clearer next actions are explicit |
| A feature ships | A delivery entry can be added while an old “missing feature” gap remains elsewhere | Replace the capability row, remove the resolved gap, update affected contracts, close the plan with evidence, and regenerate the index | Future agents should stop attempting already completed work |
| Framework, security, API, or UI change | Generic guidance or an old framework summary can be treated as the implementation contract | Inspect the owning manifest, lockfile, configuration, source, and applicable domain owners before changing behavior | Reduces version guesses, contract drift, unsafe mutations, and accidental design changes |
| Interrupted cross-surface change | The next agent must reconstruct decisions from a diary or stale generated policy | Replace one continuation with objectives, remaining work, decisions, approvals, paths, checks, blockers, and next action; reconcile it with current files on resume | Better recovery without creating another memory system |
| Routine maintenance | A small README or snapshot correction can trigger plan paperwork solely because of its filename | Use the permitted PR/commit summary on standard branches when the task is low risk; update the existing owner and run affected checks | Less process overhead while retaining real validation |
| Sensitive closeout | A filename heuristic can miss camel-case or authentication forms; prose can claim completion despite incomplete evidence | Apply actual task risk, consult relevant contracts, and validate metadata, acceptance, lanes, approval state, closure, and changed evidence in the correct Git snapshot | Stronger completion guarantees; names remain a conservative aid, not a semantic security detector |
| Existing-project upgrade | Managed generic UI guidance can compete with local design conventions; preserving local files can hide useful upstream changes | Preserve project-owned files, capture upstream advisories, manually merge relevant guidance, verify local facts and anchors, and retain project UI conventions | Adopts the harness improvements without silently replacing the project’s identity |

For a framework/security/API/UI task, “read the relevant owner” is conditional but binding. A privacy-affecting export needs security guidance even if its filename contains no sensitive keyword. A token stylesheet exemption does not exempt authentication code placed in a stylesheet. The current matchers preserve this distinction by suppressing token words only for stylesheet classification while retaining other sensitive words.

## Evidence and practical limits

The coordinator supplied the following final validation evidence:

- The full Node **24.21.0** run passed **61 root, 142 configured harness, 142 installed harness, four application unit, and one application integration tests**.
- That full run preceded only the last narrow authentication-family matcher repair.
- The last repair passed **15 focused classifier, closeout, real-Git closeout, and release tests**.
- Final isolated **gpt-6-astra, high** AutoReview completed both supplied bundles with zero findings, scoped-clean P0–P2, exit 0. The reviewer did not run project tests; unavailable unchanged-source limitations still apply.

I independently verified the source comparison, inventory, and size measurements. I did not independently execute those suites.

The automated adoption path remains specific to the supported **Node 24/package-and-lockfile ecosystem**. Other stacks can use the documentation approach, but their adoption, commands, architecture enforcement, and operational checks require an audit and project-specific configuration. Generic Node/ESLint/TypeScript helpers do not become universal framework support.

Hashes prove that inputs changed or match recorded identity. They cannot prove that a capability description is accurate, an approval actually occurred, a transcript is genuine, or an agent obeyed a rule. Similarly, local workflow tests do not establish that the hosted GitHub OS/version matrix has run successfully.

Path classifiers remain heuristics. Projects must configure their own sensitive boundaries and use semantic task risk. Symlink preflight checks cover observed path components; they do not provide atomic protection against concurrent hostile filesystem changes.

The smallest useful behavioral trial is **three paired cases** in one representative adopted project:

1. Fresh takeover with a shipped feature still recorded as a gap.
2. An interrupted API/UI change requiring recovery and preservation of local conventions.
3. Routine maintenance followed by a sensitive change requiring closeout.

Run each against baseline and revision with the same client, model, reasoning, permissions, tools, and project state. Observe factual mistakes, missed contracts, unnecessary reads, documentation churn, recovery, and unsupported completion claims. Six sessions provide a smoke trial—not a model ranking. Repeat only where outcomes vary or failures need diagnosis.

## Complete file inventory

Each path appears exactly once in this inventory. Numbers identify the verified source inventory; grouping reflects responsibility, not startup reading order.

### Context, policy, project contracts, and documentation

| # | File | Status, purpose, difference, use, and practical effect |
|---:|---|---|
| 3 | `README.md` | **Changed.** Distribution orientation now explains compact context, adoption boundaries, and provider discovery. Humans and adopting agents use it to understand the package. It makes configuration versus actual project-memory adoption clearer; it does not itself migrate a project. |
| 24 | `template/.github/PULL_REQUEST_TEMPLATE/fix.md` | **Unchanged.** Small-fix scope, risk, and evidence template remains useful when a fix uses the lighter delivery route. It preserves reviewable reporting without requiring every fix to become a plan; completing the form does not establish validation. |
| 25 | `template/.github/PULL_REQUEST_TEMPLATE/release.md` | **Unchanged.** Release identity and evidence fields remain the review surface for release PRs. Kept because publication still needs explicit provenance. The template supports the release contract but cannot execute or prove its checks. |
| 26 | `template/.github/PULL_REQUEST_TEMPLATE/slice.md` | **Unchanged.** Planned deliveries retain plan, acceptance, and validation links. Used when work needs a slice. It keeps review connected to durable evidence; unchecked or inaccurate links remain possible and require inspection. |
| 27 | `template/.github/pull_request_template.md` | **Unchanged.** Default PR guidance routes authors to the appropriate lane. Kept to make delivery conventions discoverable in GitHub. It is navigation, not another source of task authorization or proof of completion. |
| 32 | [template/AGENTS.md](/Users/hendrik/Code/paseo-worktrees/1pwdo01c/blueprint-context-refresh/template/AGENTS.md) | **Changed.** Repeated startup/process material becomes a short entrypoint: current state, binding conditional task routes, code invariants, scope, continuation, and truthful evidence. Agents use it at startup. It reduces competing instructions while retaining essential boundaries; discovery and compliance still need trials. |
| 33 | `template/ARCHITECTURE.md` | **Changed.** The top-level architecture document becomes a concise route to project-owned architecture detail. Used during orientation and architectural changes. It preserves the familiar entrypoint without repeating topology or imposing generic implementation structure. |
| 34 | `template/PLACEHOLDERS.md` | **Unchanged.** Documents bootstrap substitutions and verification. Kept for initial configuration and troubleshooting. It helps resolve template tokens consistently; completing placeholders does not establish accurate product, architecture, or operational facts. |
| 35 | [template/README.md](/Users/hendrik/Code/paseo-worktrees/1pwdo01c/blueprint-context-refresh/template/README.md) | **Changed.** Project orientation is shorter and requires verified canonical facts and source anchors during adoption. It explains truthful gate exemptions. Humans and agents use it for setup and project entry. Configuration alone is explicitly insufficient; populated facts still require verification. |
| 36 | [template/VISION.md](/Users/hendrik/Code/paseo-worktrees/1pwdo01c/blueprint-context-refresh/template/VISION.md) | **Changed.** Direction is separated from current behavior and history. A small project may use a metadata-bearing pointer to a nonempty README Product Direction section. Used for product decisions; update only when direction changes. It does not authorize speculative features. |
| 37 | `template/docs/BACKEND.md` | **Changed.** Long generic guidance becomes a concise contract for authority, input/output alignment, persistence, compatibility, transactions, idempotency, derived state, recovery, and redacted audit trails. Backend agents use it with actual handlers and schemas. It preserves correctness without mandating layers or technology. |
| 38 | `template/docs/DESIGN.md` | **Changed.** Design orientation becomes a route to relevant design owners. Used when a change affects engineering or interaction decisions. It prevents a second broad design catalog; detailed project facts belong in their specific owner and source. |
| 39 | `template/docs/FRONTEND.md` | **Changed.** Retains state ownership, shared components, canonical values, query/mutation ownership, optimistic reconciliation, accessibility, responsive behavior, and destructive-action safety in less prose. Frontend agents inspect actual framework/configuration anchors. It protects behavior and conventions; builds alone do not prove UI correctness. |
| 40 | `template/docs/MANIFEST.md` | **Unchanged.** Installed documentation inventory remains a useful compatibility and navigation reference. Agents and maintainers can locate supplied owners. Kept because paths remain supported; it is not a requirement to read the whole tree for every task. |
| 41 | [template/docs/PLANS.md](/Users/hendrik/Code/paseo-worktrees/1pwdo01c/blueprint-context-refresh/template/docs/PLANS.md) | **Changed.** Planning becomes proportional: permitted low-risk work uses PR/commit evidence, sustained or sensitive work uses plans and one replacement continuation. Enduring decisions move to live owners before archive. It reduces diary accumulation while preserving scope, recovery, and closeout. |
| 42 | `template/docs/PRODUCT_SENSE.md` | **Changed.** Product guidance now routes decisions through direction and verified current state. Used when deciding outcomes, scope, or tradeoffs. It reduces confusion between desired and delivered behavior; it remains judgment guidance rather than permission to expand scope. |
| 43 | `template/docs/QUALITY_SCORE.md` | **Changed.** A compact, evidence-based six-dimension rubric replaces broader process prose. Used for an optional quality assessment. Routine verification no longer needs a score update for every edit. Scores remain assessments, not proof that the product or validation is correct. |
| 44 | [template/docs/README.md](/Users/hendrik/Code/paseo-worktrees/1pwdo01c/blueprint-context-refresh/template/docs/README.md) | **Changed.** The documentation entrypoint becomes a binding conditional task map, including API/persistence, privacy, environment, deployment, reliability, and UI. Agents use it before affected work. It makes applicable contracts discoverable without making every document mandatory. |
| 45 | `template/docs/RELIABILITY.md` | **Changed.** Focuses on observable effects, partial failure, timeouts, safe replay, resumable durable work, progress, terminal status, and recovery. Used for operations, jobs, integrations, and failure handling. It preserves reliability obligations without prescribing a queue or custom runtime. |
| 46 | `template/docs/SECURITY.md` | **Changed.** Retains trusted authority and least privilege, and explicitly covers product-data minimization, redaction, retention, and deletion across storage and outputs. Used for sensitive work and privacy-affecting surfaces. It restores practical privacy coverage; filename checks cannot replace this review. |
| 47 | `template/docs/agent-hardening/AGENT_LOOP.md` | **Changed.** The work loop is condensed around authorized outcome, source inspection, proportional execution, evidence, and interruption. Agents use it for sustained work. It gives a durable procedure without duplicating native orchestration or introducing a custom scheduler. |
| 48 | `template/docs/agent-hardening/EVALS.md` | **Changed.** Separates honest report integrity from behavioral activation requiring real execution evidence. Used when configuring or assessing autonomous behavior. It removes the ordinary-checks deadlock while retaining strict activation requirements; small fixture sets do not establish general confidence. |
| 49 | `template/docs/agent-hardening/MEMORY_CONTEXT.md` | **Changed.** Memory is defined through existing owners, plans, and replaceable continuation, with source reconciliation on resume. Used before interruption and takeover. It supports continuity without a speculative memory database; stale content still needs human or agent verification. |
| 50 | `template/docs/agent-hardening/OBSERVABILITY.md` | **Changed.** Ordinary work uses concise plan/PR evidence; sensitive effects need appropriate provenance and redaction. Used when recording actions and validation. It avoids mandatory trace paperwork while retaining accountable evidence where risk warrants it. |
| 51 | `template/docs/agent-hardening/README.md` | **Changed.** Hardening orientation now explains applicable discovery/import routes and the current owners. Used during adoption and client changes. It helps keep one instruction authority; effective client discovery must still be checked rather than assumed. |
| 52 | `template/docs/agent-hardening/RUN_CONTROL.md` | **Changed.** Native orchestration is optional, while durable repository state owns continuation. Used for long work, interruption, and supported runtime controls. It prevents parallel custom runtime machinery; availability of a tool does not grant permission to use it. |
| 53 | `template/docs/agent-hardening/TOOL_POLICY.md` | **Changed.** Tool guidance is shorter but retains concrete authorization, untrusted-content, target/effect, and denial boundaries. Agents use it before consequential tool actions. It preserves scope across retries and prevents denial bypass; prose cannot prove that approval occurred. |
| 62 | `template/docs/architecture/DEPENDENCY-RULES.md` | **Changed.** Dependency rules now describe actual ownership and available enforcement rather than a universal structure. Used when dependencies or boundaries change. It encourages project-native checks and honest unsupported areas; heuristic scanning is not complete dependency analysis. |
| 63 | `template/docs/architecture/LAYERS.md` | **Changed.** Removes the fixed six-layer prescription in favor of documenting actual responsibilities and allowed dependencies. Used for architectural reasoning. It avoids adding layers merely to satisfy a template; projects must supply their real boundaries. |
| 64 | `template/docs/architecture/README.md` | **Changed.** A concise architecture map replaces repeated detail. Used to locate topology, boundaries, and enforcement owners. It improves retrieval while leaving implementation detail in actual source and focused project documents. |
| 65 | `template/docs/architecture/TOPOLOGY.md` | **Changed.** Centers actual components, runtime boundaries, ownership, and relevant source anchors. Used for cross-component and operational work. It reduces generic architecture fiction; useful topology still requires verified project-specific population. |
| 66 | `template/docs/deploy/README.md` | **Changed.** Requires actual targets, deployment evidence, recovery, and operational anchors. Used for deployment-related changes and adoption. It makes operational memory actionable; the blueprint cannot infer production targets or health checks from configuration alone. |
| 67 | `template/docs/design-docs/CORE-BELIEFS.md` | **Changed.** General principles are condensed and remain subordinate to concrete contracts. Used when a design tradeoff needs guidance. It retains useful values without turning them into a second detailed policy layer. |
| 68 | [template/docs/design-docs/ENGINEERING-INVARIANTS.md](/Users/hendrik/Code/paseo-worktrees/1pwdo01c/blueprint-context-refresh/template/docs/design-docs/ENGINEERING-INVARIANTS.md) | **Changed.** A mandatory short code contract preserves root-cause investigation, affected callers, framework/config inspection, integrity, recovery, useful tests, diff review, and measured performance work. Agents read it for code changes. It retains core engineering discipline without broad repeated guidance. |
| 69 | `template/docs/design-docs/GIT-SAFETY.md` | **Changed.** Removes unsafe blanket unstaging advice and emphasizes explicit paths, preservation of unrelated work, publication scope, and native controls. Used for Git operations. It better protects shared work; destructive actions still need applicable authorization. |
| 70 | `template/docs/design-docs/README.md` | **Changed.** Design-document navigation is condensed to relevant owners. Used when selecting engineering, Git, or UI guidance. It preserves discoverability without requiring the entire design folder as routine startup context. |
| 71 | `template/docs/design-docs/UI-STANDARDS.md` | **Changed.** Managed guidance now contains generic accessibility, interaction, mutation-state, and evidence requirements; project palette/layout facts move to the project-owned UI owner. Used for UI work. It avoids imposing universal dashboard or form design conventions. |
| 72 | `template/docs/env/README.md` | **Changed.** Focuses on actual environment/configuration ownership and secret separation. Used for environment-dependent changes and deployment. It makes configuration boundaries explicit; secret values and operational credentials do not belong in project memory. |
| 73 | `template/docs/exec-plans/README.md` | **Changed.** Documents the supported metadata, lifecycle, continuation, and completion contract more concisely; unsupported optional Tags guidance is removed. Used to create or close plans. It aligns documentation with validators rather than expanding the grammar. |
| 74 | `template/docs/exec-plans/TECH-DEBT-TRACKER.md` | **Changed.** Keeps current debt ownership and next action separate from delivery history, removing resolved entries. Used when recording genuine residual debt. It prevents an ever-growing closed-work catalog; entries still need evidence and prioritization. |
| 75 | `template/docs/exec-plans/active/README.md` | **Changed.** Defines active statuses and a bounded replacement continuation. Used for authorized sustained work and takeover. It makes remaining work explicit without daily log accumulation; status alone does not prove actual progress. |
| 76 | `template/docs/exec-plans/active/evidence/README.md` | **Changed.** Current evidence is bounded, relevant, and redacted. Used when retaining artifacts during active work. It preserves useful proof while reducing unnecessary data capture; receipts are excluded from plan catalogs. |
| 77 | `template/docs/exec-plans/completed/README.md` | **Changed.** Completed plans are clearly historical evidence, with validated acceptance and closure. Used during closeout or historical investigation. It keeps delivery memory available without treating it as current product truth. |
| 78 | `template/docs/exec-plans/evidence-index/README.md` | **Changed.** Requires thin durable links to plan validation and artifacts instead of duplicated reports. Used at planned closeout and release analysis. It improves provenance with less repetition; links and regular-file checks do not establish semantic correctness. |
| 79 | `template/docs/future/README.md` | **Changed.** Future proposals and readiness are separated from active authorization and current capability. Used when considering or promoting later work. It prevents plans from being mistaken for shipped behavior or automatic permission. |
| 80 | [template/docs/generated/AGENT-RUNTIME-CONTEXT.md](/Users/hendrik/Code/paseo-worktrees/1pwdo01c/blueprint-context-refresh/template/docs/generated/AGENT-RUNTIME-CONTEXT.md) | **Changed.** The large repeated-policy prompt becomes a source-derived, bounded unfinished-work index with hashes and omission notices. Used for navigation and takeover. It excludes completed history and is not a new fact owner or independent instruction authority. |
| 81 | `template/docs/generated/README.md` | **Changed.** Explains generated artifacts, regeneration, and freshness without treating generation as product truth. Used when maintaining generated context, schema, or evaluation records. It prevents derived output from competing with its source owner. |
| 83 | `template/docs/generated/db-schema.md` | **Changed.** Makes placeholder status and actual schema provenance explicit. Used for persistence and migration work after adoption. It directs agents to the real schema/migration owner; an empty template cannot establish a project’s data contract. |
| 85 | `template/docs/governance/GOLDEN-PRINCIPLES.md` | **Changed.** Principles are shortened and aligned with specific owners. Used for cross-cutting decisions. It keeps useful constraints visible without another broad prompt; concrete project contracts still govern implementation. |
| 86 | `template/docs/governance/README.md` | **Changed.** Governance navigation and command ownership are condensed. Used to locate policies and checks. It reduces repeated instruction material while preserving the path to binding rules and project configuration. |
| 87 | `template/docs/governance/RULES.md` | **Changed.** Clarifies canonical ownership, live-state updates, proportional closeout, and truthful baseline gate exemptions. Used for governed changes and adoption. It aligns policy with executable checks; an exemption is not evidence that a check passed. |
| 94 | `template/docs/ops/README.md` | **Changed.** Operations navigation explicitly includes environment, deployment, recovery, API, automation, and release owners. Used for operational changes. It repairs missing discovery routes without turning every operations document into mandatory startup reading. |
| 95 | `template/docs/ops/api/README.md` | **Changed.** API memory focuses on actual contracts, authority, failures, compatibility, and source anchors. Used for producers, consumers, and public API changes. It keeps enduring contracts discoverable without duplicating every route implementation. |
| 96 | `template/docs/ops/automation/INTEROP_GITHUB.md` | **Changed.** Runtime, pinned-action, cache, credential, and workflow guidance matches the revised workflows. Used for CI adoption and maintenance. It documents intentional security settings; local checks do not prove hosted execution. |
| 97 | `template/docs/ops/automation/LITE_QUICKSTART.md` | **Changed.** The short workflow now requires completed acceptance and checks before closeout. Used for quick onboarding. It fixes misleading lightweight completion guidance while remaining a route to the full applicable contract. |
| 98 | `template/docs/ops/automation/OUTCOMES.md` | **Changed.** Automation outcomes require observable evidence rather than command or prose claims alone. Used when reporting verification and delivery. It improves reporting discipline; observable artifacts still need interpretation. |
| 99 | `template/docs/ops/automation/README.md` | **Changed.** Current commands and owners are presented more concisely. Used to choose verification, context, and release operations. It reduces competing command catalogs while preserving the supported interfaces. |
| 100 | `template/docs/ops/releases/README.md` | **Changed.** Retains release identity, evidence, retry, and recovery guarantees while clarifying aggregate release-profile execution. Used at release boundaries. It prevents a focused range checker from being mistaken for all required project gates. |
| 101 | `template/docs/ops/releases/release-mapping.md` | **Unchanged.** Project-owned mapping ledger remains the durable link between relevant commits and accepted delivery evidence. Used by release tooling and maintainers. Kept for provenance and small-fix releases; a ledger entry alone cannot prove implementation correctness. |
| 102 | [template/docs/product-specs/CURRENT-STATE.md](/Users/hendrik/Code/paseo-worktrees/1pwdo01c/blueprint-context-refresh/template/docs/product-specs/CURRENT-STATE.md) | **Changed.** Separates shipped/partial/unavailable capabilities, unresolved gaps, risks, and verified anchors. Startup agents use it to understand actual behavior. Updates replace obsolete facts and remove resolved gaps; dates and structure cannot establish semantic accuracy. |
| 103 | `template/docs/product-specs/README.md` | **Changed.** Current specifications are separated from future intent and delivery history. Used to locate product contracts. It makes current behavior easier to retrieve without copying plans or release narratives into product specifications. |
| 104 | `template/docs/references/README.md` | **Changed.** References are supporting detail outside routine startup, subordinate to canonical owners. Used when a task needs deeper background. It preserves useful material without making archives another live policy authority. |
| 105 | `template/docs/ui/INTENTS.md` | **Changed.** Removes the generic large action registry unless the implementation actually consumes one. Used for meaningful intended interactions. It avoids a duplicate catalog while distinguishing intended behavior from implementation evidence. |
| 106 | [template/docs/ui/README.md](/Users/hendrik/Code/paseo-worktrees/1pwdo01c/blueprint-context-refresh/template/docs/ui/README.md) | **Changed.** Project-owned UI memory now identifies actual theme/token, component, and interaction anchors and conventions. Used for UI adoption and changes. It preserves local design through harness upgrades without duplicating the full source catalog. |

### Configuration, workflows, ownership records, and generated reports

| # | File | Status, purpose, difference, use, and practical effect |
|---:|---|---|
| 1 | `.github/workflows/ci.yml` | **Changed.** Distribution CI retains its OS/Node matrix while pinning actions and making read permissions, checkout credentials, and package-cache behavior explicit. Used on repository CI events. It strengthens wiring and supply-chain configuration; hosted jobs were not executed in this assessment. |
| 2 | `.gitignore` | **Unchanged.** Excludes local dependencies and generated/local artifacts. Used by Git throughout development. Kept because these exclusions remain appropriate; ignoring a file neither removes it nor protects sensitive data already tracked. |
| 4 | `distribution/bootstrap-questionnaire.json` | **Unchanged.** Defines required configuration decisions, scope/domain choices, and actual commands. Used by bootstrap and decision helpers. It preserves explicit project choices; absent domains should be marked appropriately rather than invented. |
| 8 | `distribution/harness-ownership-manifest.json` | **Unchanged.** Defines managed, project-owned, bootstrap-only, and excluded boundaries. Used by installation, sync, reconciliation, and placeholder checks. It is central to preserving local context and UI conventions; ownership classification does not validate the facts inside a file. |
| 9 | `package.json` | **Unchanged.** Declares supported Node 24 and distribution test partitions without runtime dependencies. Used by package tooling and CI. Kept because the commands and ecosystem scope remain valid; it does not imply support for arbitrary stacks. |
| 23 | `template/.github/CODEOWNERS` | **Unchanged.** Supplies review routing placeholders for adopted projects. Used by GitHub and adoption. Kept to retain explicit ownership; review routing is not task authorization and requires real project owners. |
| 28 | `template/.github/workflows/ci-candidate.yml` | **Changed.** Candidate CI keeps exact-revision evidence while updating action pins/cache settings. Used for candidate validation. Required fetch authentication remains intentional; workflow tests establish wiring rather than hosted execution. |
| 29 | `template/.github/workflows/ci.yml` | **Changed.** Project CI updates pinned actions, cache/auth settings, and executes the release aggregate at the release boundary. Used for classified project changes. It closes the missing release-profile execution path; project gate declarations still need accurate commands. |
| 30 | `template/.github/workflows/release-tag.yml` | **Changed.** Publication workflow updates action pins/cache behavior while retaining required push authentication. Used for release tagging and publication. It preserves the publication mechanism; local mocks cannot establish live GitHub permissions or service behavior. |
| 31 | `template/.gitignore` | **Unchanged.** Adopted-project exclusions cover bootstrap and local artifacts. Used by Git after installation. Kept for compatibility; projects may need additional stack-specific exclusions. |
| 61 | `template/docs/agent-hardening/evals.config.json` | **Unchanged.** Defines required suites, fixtures, freshness, exact runtime identity, and thresholds. Used by evaluation tooling. Kept because integrity and activation can share this contract; the configuration supplies no agent runner and proves no observed behavior. |
| 82 | `template/docs/generated/article-conformance.json` | **Unchanged.** Structural capability record identifies implementation status and evidence references. Used by the conformance checker. Kept as a compatibility contract; “implemented” and existing paths are not measured behavioral success. |
| 84 | `template/docs/generated/evals-report.json` | **Changed.** Input identity is refreshed while the template remains honestly not-run with zero execution evidence. Used by integrity and activation checks. It avoids manufactured readiness; refresh is not a model evaluation. |
| 88 | `template/docs/governance/architecture-rules.json` | **Unchanged.** Configures generic dependency checks and their limits. Used by architecture verification after project configuration. Kept to support existing enforcement hooks; an empty or heuristic configuration is not complete architecture enforcement. |
| 89 | `template/docs/governance/doc-checks.config.json` | **Changed.** Adds/aligns canonical routes, VISION recognition, UTF-8 live-document budgets, exclusions, and snapshot freshness policy. Used by governance checks. It catches structural drift and oversize live context; it cannot identify inaccurate product claims. |
| 90 | `template/docs/governance/policy-manifest.json` | **Changed.** The large repeated policy index becomes a smaller compatibility/ownership and command map. Used by alignment and policy tooling. It retains machine-readable contracts without becoming a second prompt containing every rule. |
| 91 | `template/docs/governance/policy-manifest.schema.json` | **Unchanged.** Validates the policy manifest’s supported shape. Used by governance tooling. Kept to preserve compatibility; schema validity does not establish that referenced prose or commands are correct. |
| 92 | `template/docs/governance/project-gates.json` | **Unchanged.** Declares project checks, profiles, and permitted statuses. Used by gate execution and adoption. Kept because truthful exemptions are handled by the repaired verifier; actual project commands still must be supplied. |
| 93 | `template/docs/governance/project-gates.schema.json` | **Unchanged.** Validates gate declaration structure. Used before semantic execution checks. Kept for stable configuration; baseline restrictions and meaningful exemptions are enforced by code beyond this schema. |
| 107 | `template/package.scripts.fragment.json` | **Changed.** Adds/aligns evaluation integrity, read-only context freshness, and aggregate release commands. Used when merging package scripts during bootstrap. It exposes the repaired interfaces while preserving project command conflicts for explicit resolution. |

### Installation, runtime, verification, and maintenance tools

| # | File | Status, purpose, difference, use, and practical effect |
|---:|---|---|
| 10 | `scripts/bootstrap-configure.mjs` | **Unchanged.** Configures supported projects from explicit decisions, checks manifests/locks/template identity, preserves choices, and preflights collisions. Used for initial adoption. Kept because it already protects configuration boundaries; it cannot populate verified product memory automatically. |
| 20 | `scripts/harness-sync.mjs` | **Changed.** Adds upstream project-owned change advisories based on recorded source baselines while retaining local-file protection. Used for drift/update/reconcile workflows. It makes useful upstream guidance visible without overwriting project facts; capture advisories before advancing the baseline. |
| 108 | `template/scripts/agent-hardening/check-agent-hardening.mjs` | **Changed.** Checks required structural guidance rather than broad exact prose and accepts a validated nonempty README direction pointer. Used in verification/adoption. It supports concise owners; passing structural checks does not prove agent discovery or compliance. |
| 109 | `template/scripts/agent-hardening/check-evals.mjs` | **Changed.** Adds integrity-only validation for truthful unrun reports, while preserving strict real-execution requirements and current input hashes in both freshness modes. Used by routine verification versus activation. It separates software maintenance from behavioral readiness without accepting fabricated passes. |
| 111 | `template/scripts/agent-hardening/eval-input-hash.mjs` | **Changed.** Includes README, VISION, and current state in evaluation identity; task-specific conventions remain explicit additional inputs. Used during refresh/verification. It catches changes to required context, but cannot infer every project convention automatically. |
| 113 | `template/scripts/agent-hardening/refresh-evals-report.mjs` | **Changed.** Changed inputs reset runtime results to honest not-run, and report/parent symlinks are rejected before access. Used after context changes. It preserves external targets and avoids false freshness; it never executes a model. |
| 115 | `template/scripts/architecture/check-dependencies.mjs` | **Unchanged.** Relative TypeScript import heuristics, pattern scanning, and native command hooks remain available. Used for configured architecture checks. Kept for practical enforcement; it is not a complete framework dependency analyzer and honestly handles unsupported/empty enforcement. |
| 117 | `template/scripts/automation/check-harness-alignment.mjs` | **Changed.** Requires current context, integrity, and release aggregate interfaces while checking stable sections instead of exact sentences. Used in verification. It permits clearer prose without losing wiring guarantees; it is still a structural check. |
| 119 | `template/scripts/automation/check-path-policy.mjs` | **Unchanged.** Emits advisory warnings for configured high-review paths. Used during relevant verification. Kept as an attention aid; it does not enforce approval and may skip unavailable Git context. |
| 120 | [template/scripts/automation/check-plan-closeout.mjs](/Users/hendrik/Code/paseo-worktrees/1pwdo01c/blueprint-context-refresh/template/scripts/automation/check-plan-closeout.mjs) | **Changed.** Validates worktree and index independently, with snapshot-specific identities and shared completion requirements. Used before planned delivery boundaries. It prevents one valid snapshot from masking another incomplete one and preserves legitimate inherited history. |
| 121 | `template/scripts/automation/check-plan-metadata.mjs` | **Changed.** Reuses shared metadata/completion validation instead of maintaining duplicated rules. Used to check future/active plans and explicitly selected history. It reduces validator disagreement while avoiding blanket retrospective rewriting of historical records. |
| 123 | `template/scripts/automation/check-pr-contract.mjs` | **Unchanged.** CLI applies branch, PR, and history rules when relevant environment exists. Used in PR/full verification. Kept as the stable entrypoint; non-PR execution can legitimately skip PR-only checks. |
| 124 | `template/scripts/automation/check-project-gates.mjs` | **Changed.** Required baseline declarations can use truthful, concrete exemptions; selected profile commands execute sequentially and propagate failure. Used by fast/full/release/deploy profiles. It resolves policy/check contradiction without turning an exemption into a successful check. |
| 126 | `template/scripts/automation/check-quality-score.mjs` | **Changed.** Optional assessment understands valid exemptions and reports missing validation honestly. Used when requesting a quality score. It no longer pressures agents to invent successful checks; scores remain evidence-based judgments with their own freshness rules. |
| 128 | `template/scripts/automation/compile-runtime-context.mjs` | **Changed.** Generates a deterministic bounded recursive unfinished-plan index, hashes inputs, excludes receipts/history, rejects relevant symlinks, and supports read-only checking. Used after intentional queue/state updates. It improves navigation and freshness without duplicating policy. |
| 130 | `template/scripts/automation/lib/contracts/index.mjs` | **Unchanged.** Validates harness manifest shape and schema compatibility. Used by installation/sync callers. Kept as a shared contract; callers remain responsible for containment, actual source identity, and ownership semantics. |
| 132 | `template/scripts/automation/lib/plan-document-state.mjs` | **Unchanged.** Metadata/section mutation helpers remain for compatibility. No live repository caller was found. Kept pending downstream usage assessment; its delivery-log append helper is not the revised continuation mechanism or evidence of active memory behavior. |
| 134 | `template/scripts/automation/lib/plan-metadata.mjs` | **Changed.** Shared validation now covers completed metadata, raw validation lanes, resolved approval, checked deliverables, closure, evidence, targets, and identities. Used by metadata, closeout, and release owners. It closes inconsistent validation paths without adding another parser. |
| 136 | `template/scripts/automation/lib/repo-paths.mjs` | **Changed.** Adds shared repository-contained component symlink preflight for relevant writers. Used before report/bootstrap mutations. It protects observed external aliases; lexical containment and lstat checks do not provide atomic hostile-filesystem isolation. |
| 137 | `template/scripts/automation/lint-changed-lib.mjs` | **Unchanged.** Filters and deduplicates changed JavaScript/TypeScript paths. Used by changed-file linting. Kept because this small helper remains sufficient; other languages require project-native checks. |
| 138 | `template/scripts/automation/lint-changed.mjs` | **Unchanged.** Runs configured ESLint over relevant changed files, with appropriate missing-config/base handling. Used by JS/TS verification. Kept as a scoped helper; it does not replace full project checks or support every toolchain. |
| 140 | `template/scripts/automation/plan-closeout-lib.mjs` | **Changed.** Strengthens completion/evidence/identity checks, excludes nested receipts, and repairs bounded camel-case sensitive-name matching. Routine README/current-state filenames no longer escalate alone. Used by closeout. It reduces paperwork and missed names; semantic task risk remains authoritative. |
| 142 | `template/scripts/automation/pr-contract-lib.mjs` | **Unchanged.** Implements branch, release-title/date, command-marker, and linear-history contracts. Used by PR verification. Kept for stable delivery conventions; body markers cannot establish that commands actually ran. |
| 144 | `template/scripts/automation/release-notes.mjs` | **Unchanged.** CLI delegates to shared release analysis and propagates failures. Used to generate release notes. Kept because shared repairs improve its behavior without duplicating logic; correctness depends on mappings and selected range. |
| 146 | `template/scripts/automation/release-support-lib.mjs` | **Changed.** Repairs published source ancestry, mapped plan-free fixes, selected-head completion/evidence validation, nested receipt exclusions, and evidence-summary parsing. Used by release verification/notes. It prevents redundant source auditing and missing proof while preserving unmapped-code blocking. |
| 148 | `template/scripts/automation/release-verify.mjs` | **Unchanged.** Focused range-verification CLI remains a leaf using shared release analysis. Used inside release aggregates or explicitly for range inspection. Kept to avoid duplicated orchestration; invoking it alone is not all release-profile validation. |
| 150 | `template/scripts/automation/verify-deploy.mjs` | **Unchanged.** Runs full verification and declared deploy hooks. Used before configured deployment. Kept as the orchestration owner; it has no built-in discovery of production targets, credentials, or health checks. |
| 151 | `template/scripts/automation/verify-fast.mjs` | **Changed.** Checks context without rewriting it, uses evaluation integrity, and removes mandatory quality scoring while retaining scoped real project checks and applicable governance. Used for routine verification. It reduces unnecessary mutations/process without claiming behavioral activation. |
| 153 | `template/scripts/automation/verify-full.mjs` | **Unchanged.** Owns fast verification as a prerequisite, then broader conformance, architecture, and project checks. Used for full validation. Kept because its orchestration already supports one fast pass; skip-fast is appropriate only when that prerequisite is already established. |
| 155 | `template/scripts/bootstrap-verify.sh` | **Changed.** Runs full verification once instead of fast followed by full repeating fast. Used at bootstrap completion. It removes redundant execution while preserving failure-stop behavior and later cleanup ordering. |
| 157 | `template/scripts/check-article-conformance.mjs` | **Unchanged.** Checks capability record structure/status and evidence references. Used by full verification. Kept for compatibility and structural integrity; existing references do not prove implemented behavior. |
| 158 | `template/scripts/check-template-placeholders.mjs` | **Unchanged.** Scans governed installed-template paths and tokens according to ownership. Used during bootstrap and verification. Kept to catch unresolved template decisions while avoiding unrelated dependency/project placeholders; it cannot verify semantic adoption quality. |
| 159 | `template/scripts/check-template-placeholders.sh` | **Unchanged.** Quoted shell wrapper invokes the Node placeholder checker. Used by shell-facing bootstrap commands. Kept as a simple compatibility entrypoint; it adds no separate validation behavior. |
| 161 | `template/scripts/ci/classify-change.mjs` | **Changed.** Sensitive identity/tenancy/persistence/database and authentication-family names select broad checks; camel boundaries and limited stylesheet token exemptions avoid harmless author/design-token matches. Used for CI scope selection. Unknown/mixed changes stay conservative; project configuration and semantic risk remain necessary. |
| 163 | `template/scripts/cleanup-bootstrap-artifacts.mjs` | **Changed.** Preflights package, manifest, artifact, and removal paths before cleanup mutations. Used after successful bootstrap. It retains ownership-based pruning while rejecting symlinked external targets before partial cleanup begins. |
| 165 | `template/scripts/docs/check-governance.mjs` | **Unchanged.** Read-only governance CLI reports warnings/errors and propagates failure. Used by verification. Kept because the shared core owns the changing behavior; it does not repair documents automatically. |
| 166 | `template/scripts/docs/lib/governance-core.mjs` | **Changed.** Adds live UTF-8 budgets, snapshot warnings, VISION recognition, finished-queue rejection, recursive historical checks, and receipt exclusions. Used by governance verification. It catches structural lifecycle drift while preserving history; inaccurate unchecked claims remain undetectable. |
| 168 | `template/scripts/docs/repair-plan-references.mjs` | **Changed.** Catalog and lifecycle reference handling recurse into nested plans, exclude receipts, and preserve query/hash suffixes. Used after plan moves; check mode is read-only. It prevents nested closeout from breaking links without rewriting already-correct references. |

### Tests, fixtures, runners, and test support

| # | File | Status, purpose, difference, use, and practical effect |
|---:|---|---|
| 11 | `scripts/bootstrap-configure.test.mjs` | **Changed.** Existing configuration, escaping, preservation, and preflight cases now own fixture teardown. Used in root tests. It retains adoption regression coverage and reduces leaked temporary repositories; most changes improve test hygiene rather than configuration behavior. |
| 12 | `scripts/bootstrap-questionnaire.test.mjs` | **Unchanged.** Checks questionnaire decisions against the actual placeholder inventory. Used in root tests. Kept to prevent incomplete bootstrap packets; it establishes coverage of required decisions, not accuracy of the answers. |
| 13 | `scripts/bootstrap-test-helpers.mjs` | **Unchanged.** Supplies test decisions from the real questionnaire. Used by bootstrap tests. Kept to avoid a separate invented decision catalog; fixture values are synthetic and do not establish real project adoption. |
| 14 | `scripts/ci-test-ownership.test.mjs` | **Unchanged.** Independently discovers test coverage and partition ownership. Used in root tests. Kept to catch omitted or unnecessarily duplicated suites; source wiring assertions prove inclusion rather than runtime product quality. |
| 15 | `scripts/ci/run-fixture-evals.mjs` | **Unchanged.** Records observed harness-fixture execution with explicit limits. Used by CI harness evaluation. Kept as honest deterministic evidence; its results are not real agent behavior trials. |
| 16 | `scripts/ci/run-golden-adopted-repo.mjs` | **Changed.** Fresh/existing adoption and Reading List verification remain; release aggregates run, context is prepared, and both fixtures are cleaned in finally blocks. Used for installed-consumer validation. It exercises real adoption, though one snapshot sentence conflicts with its future plan. |
| 17 | `scripts/ci/run-root-tests.mjs` | **Unchanged.** Runs the defined root/bootstrap partition. Used by npm/CI. Kept as a simple ownership boundary that avoids repeating configured harness work; it is not the complete test system by itself. |
| 18 | `scripts/ci/run-template-smoke.mjs` | **Changed.** Configured-template validation gains owned cleanup and positive/negative README direction-pointer cases. Used for consumer smoke testing. It catches configuration and pointer regressions; synthetic command success is not application-quality evidence. |
| 19 | `scripts/harness-reconcile.test.mjs` | **Unchanged.** Checks scoped reconciliation approval, hash identity, coverage, and modified-file protection. Used in root tests. Kept to defend managed customizations; hashes establish identity, not the desirability of an approved change. |
| 21 | `scripts/harness-sync.test.mjs` | **Changed.** Adds upstream advisory behavior, fixture cleanup, and a retirement case that restores the file before proving removal. Used in root tests. It now observes actual retirement rather than pre-deleting the subject; preservation/collision cases remain useful. |
| 22 | `scripts/release-workflow.test.mjs` | **Changed.** Workflow assertions account for named steps, active options, comments, inherited permissions, pins, cache/auth settings, and release aggregates. Used in root tests. It catches insecure wiring changes more reliably; shell/source checks do not execute hosted GitHub. |
| 54 | `template/docs/agent-hardening/eval-fixtures/bad-delegation-no-integration-review.json` | **Unchanged.** Defines a delegation/integration-review failure scenario. Used by evaluation configuration and future behavioral trials. Kept because isolated work still needs integration accountability; the fixture is an input, not proof an agent was tested. |
| 55 | `template/docs/agent-hardening/eval-fixtures/fake-tests-final-claim.json` | **Unchanged.** Defines fabricated validation reporting. Used to test evidence honesty in a configured agent evaluation. Kept because completion claims are a core risk; merely validating this JSON does not test model honesty. |
| 56 | `template/docs/agent-hardening/eval-fixtures/missed-plan-closeout.json` | **Unchanged.** Defines missed lifecycle closeout. Used by evaluations. Kept to test whether delivery updates durable state; deterministic plan validators complement it but do not establish agent compliance. |
| 57 | `template/docs/agent-hardening/eval-fixtures/prompt-injection-tool-output.json` | **Unchanged.** Defines untrusted tool-content injection. Used for behavioral evaluation. Kept to exercise the trust boundary; the scenario and written policy alone do not demonstrate resistance. |
| 58 | `template/docs/agent-hardening/eval-fixtures/runtime-orchestration-overreach.json` | **Unchanged.** Defines unauthorized runtime orchestration. Used in evaluations. Kept because tool availability is not authority; fixture presence does not establish safe actual tool use. |
| 59 | `template/docs/agent-hardening/eval-fixtures/stale-context-after-resume.json` | **Unchanged.** Defines stale-state recovery failure. Used in interruption/resume trials. Kept to test reconciliation against current source; it does not prove the new continuation works until executed with an agent. |
| 60 | `template/docs/agent-hardening/eval-fixtures/unsafe-tool-use-without-approval.json` | **Unchanged.** Defines missing-authorization tool use. Used in evaluations. Kept to preserve permission-boundary coverage; actual permission settings remain external and unchanged by the blueprint. |
| 110 | `template/scripts/agent-hardening/check-evals.test.mjs` | **Changed.** Adds truthful unrun integrity versus activation, fabricated execution, stale hashes, and time-bound cases. Used in harness tests. It observes report acceptance/rejection, retaining evidence-path and identity checks; it does not run an agent. |
| 112 | `template/scripts/agent-hardening/eval-input-hash.test.mjs` | **Changed.** Explicitly tests current-state and README-owned direction invalidation alongside existing input containment. Used in harness tests. It proves particular required inputs affect identity rather than merely looping over whatever the implementation returns. |
| 114 | `template/scripts/agent-hardening/refresh-evals-report.test.mjs` | **Changed.** Adds owned cleanup and report/parent symlink cases preserving external contents. Used in harness tests. It observes safe failure before writes and honest refresh behavior; it does not prove protection against concurrent path races. |
| 116 | `template/scripts/architecture/check-dependencies.test.mjs` | **Changed.** Fixture cleanup is added while configuration, TSX scanning, rationale, and obsolete-hook cases remain. Used in harness tests. Kept to verify supported enforcement behavior; cleanup changes do not expand framework coverage. |
| 118 | `template/scripts/automation/check-harness-alignment.test.mjs` | **Changed.** Adds cleanup and validates stable domain headings instead of freezing an exact quality sentence. Used in harness tests. It preserves interface checks while allowing prose improvements; structural alignment is not semantic completeness. |
| 122 | `template/scripts/automation/check-plan-metadata.test.mjs` | **Changed.** Adds cleanup and reconciles fixtures with the shared metadata grammar. Used in harness tests. It retains dependency/status/unsupported-field checks; parser acceptance does not establish that a plan describes useful authorized work. |
| 125 | `template/scripts/automation/check-project-gates.test.mjs` | **Changed.** Exercises exemptions, missing declarations, selected profiles, actual failing commands, exit propagation, and skipped later gates. Used in harness tests. Real exit-7 versus unselected exit-9 behavior establishes execution semantics beyond dry-run wiring. |
| 127 | `template/scripts/automation/check-quality-score.test.mjs` | **Changed.** Adds cleanup and truthful exemption distinctions while retaining rubric, owner, freshness, and evidence checks. Used in harness tests. It prevents fabricated validation credit; a passing rubric test does not establish product quality. |
| 129 | `template/scripts/automation/compile-runtime-context.test.mjs` | **Changed.** Covers nested unfinished plans, source freshness, finished work, receipts, symlinks, determinism, and nonwriting checks. Used in harness tests. It verifies index lifecycle behavior, not whether its linked plans are semantically current. |
| 131 | `template/scripts/automation/lib/contracts/index.test.mjs` | **Unchanged.** Checks supported manifest shape, fields, and schema stamping. Used in harness tests. Kept for contract compatibility; shape tests cannot establish source provenance or filesystem safety. |
| 133 | `template/scripts/automation/lib/plan-document-state.test.mjs` | **Unchanged.** Tests section and metadata mutation compatibility helpers. Used in harness tests. Kept with the retained helper surface; no live caller was found, so these tests do not establish current continuation behavior. |
| 135 | `template/scripts/automation/lib/plan-metadata.test.mjs` | **Unchanged.** Tests parser identities, statuses, lanes, setters, and filename inference. Used in harness tests. Kept to protect shared grammar; setter coverage also supports compatibility code and does not prove downstream use. |
| 139 | `template/scripts/automation/plan-closeout-git.test.mjs` | **Changed.** Real Git cases cover worktree/index separation, nested completion, historical identity, inherited work, sensitive changes, and missing completion fields. Used in harness tests. It observes actual snapshot behavior rather than only fabricated diff summaries. |
| 141 | `template/scripts/automation/plan-closeout-lib.test.mjs` | **Changed.** Tables cover genuine sensitive names, authentication families, OAuth/plural schemas, harmless authors/design-token stylesheets, maintenance branches, and nested receipts. Used in focused/harness tests. It proves specified classifier outcomes; unnamed semantic risks remain possible. |
| 143 | `template/scripts/automation/pr-contract-lib.test.mjs` | **Unchanged.** Checks branch/date/title and manager-command contracts. Used in harness tests. Kept for stable PR conventions; these cases should not be described as comprehensive execution of every history or validation path. |
| 145 | `template/scripts/automation/release-publication.test.mjs` | **Changed.** Existing mocked publication/retry/conflict cases gain finally-owned cleanup. Used in harness tests. Observable publication behavior remains covered; mocks do not prove hosted GitHub authentication, availability, or permissions. |
| 147 | `template/scripts/automation/release-support-lib.test.mjs` | **Changed.** Real Git cases exercise mapped plan-free fixes, published companion ancestry, selected-head completion, evidence integrity, and retained summary bullets. Used in harness tests. It validates repaired release analysis against actual Git identities and negative cases. |
| 149 | `template/scripts/automation/test-helpers.mjs` | **Changed.** Consumers provide test context, and teardown registers before setup writes. Used throughout configured/installed harness tests. It gives temporary repositories clear ownership on success and failure; it is test support, not product runtime. |
| 152 | `template/scripts/automation/verify-fast.test.mjs` | **Changed.** Expected scope wiring now uses context checks and evaluation integrity without mandatory quality scoring; cleanup is owned. Used in harness tests. Dry-run checks establish command selection, not actual command success or nonmutation. |
| 154 | `template/scripts/automation/verify-full.test.mjs` | **Changed.** Adds fixture cleanup while retaining wrapper execution/failure checks. Used in harness tests. It protects orchestration without proving stubbed project owners’ behavior; its “strict eval” comment remains stale relative to fast verification. |
| 156 | `template/scripts/bootstrap-verify.test.mjs` | **Changed.** Covers full-only ordering, nested invocation, early failure, cleanup routing, and owned fixtures. Used in harness tests. It proves duplicate fast invocation was removed and later actions stop on failure; command stubs limit application conclusions. |
| 160 | `template/scripts/check-template-placeholders.test.mjs` | **Changed.** Adds fixture cleanup while preserving token inventory and installed scan-boundary cases. Used in harness tests. It protects placeholder scope; it does not validate real project facts or expand supported ecosystems. |
| 162 | `template/scripts/ci/classify-change.test.mjs` | **Changed.** Explicit path tables cover repaired bounded/camel authentication names, harmless authors, stylesheet tokens, conservative categories, and release/event routing. Used in focused/harness tests. It documents observable routing expectations without claiming semantic risk detection. |
| 164 | `template/scripts/cleanup-bootstrap-artifacts.test.mjs` | **Changed.** Adds cleanup and symlink preservation cases before mutation, retaining bootstrap ownership/manifest checks. Used in harness tests. It verifies external targets survive rejected cleanup; concurrent filesystem races remain outside the guarantee. |
| 167 | `template/scripts/docs/lib/governance-core.test.mjs` | **Changed.** Covers UTF-8 rather than character budgets, freshness warnings, receipt exclusions, completed-history recursion, and schema behavior, with cleanup. Used in harness tests. It proves structural policies while leaving semantic product accuracy untested. |
| 169 | `template/scripts/docs/repair-plan-references.test.mjs` | **Changed.** Adds nested lifecycle movement, receipt exclusions, suffix preservation, correct-reference no-ops, and read-only checking. Used in harness tests. It verifies repaired link handling without claiming every historical narrative remains accurate. |

### Historical reports and the new audit record

| # | File | Status, purpose, difference, use, and practical effect |
|---:|---|---|
| 5 | `distribution/ci-budget-completion.md` | **Unchanged historical report.** Records an earlier CI-budget completion and its evidence. Maintainers use it for provenance. Kept because history can explain existing partition choices; it is neither live policy nor evidence of the current revision’s tests. |
| 6 | `distribution/ci-budget-followup.md` | **Unchanged historical report.** Records follow-up CI-budget work. Used when investigating earlier decisions. Kept outside startup to preserve context without competing with current commands, contracts, or validation evidence. |
| 7 | `distribution/ci-budget-phase-one.md` | **Unchanged historical report.** Records the first CI-budget phase and rationale. Used for historical investigation. Kept because the earlier reasoning remains useful; old results must not be presented as current validation. |
| 170 | `distribution/context-refresh.md` | **New.** Records rationale, measured size, migration guidance, repairs, chronological validation, limits, and exhaustive audit inventory. Used by maintainers planning project trials or adoption. It is not installed startup policy, independent behavioral proof, or authorization to migrate downstream projects. |

## Concrete inconsistencies and smallest fixes

I found two limited inconsistencies. Neither calls for another broad rewrite.

1. **Stale evaluation comment.** Inventory item 154 says, “Fast verification owns strict eval and agent checks.” Fast verification now owns evaluation **integrity**, while strict evaluation remains the activation requirement. Change the comment to name integrity and agent checks accurately. Runtime behavior is already aligned.

2. **Golden-fixture snapshot wording.** Inventory item 16 writes “No unfinished product work in this fixture,” then creates a `ready-for-promotion` persistence plan with unchecked deliverables. Persistence can remain outside the delivered core’s scope, but the absolute snapshot sentence conflicts with the queued work. Replace it with: “No unfinished work in the delivered core; persistence is a proposed future slice,” linking that plan.

The revision otherwise supports a coherent approach: maintain verified facts in place, retrieve applicable contracts, preserve source authority, and retain history without loading it into every new session. Its next meaningful evidence should come from adopted-project trials, rather than another clean review verdict.

## Coordinator Validation After The Explanation

The two adviser wording findings are corrected. No product-runtime behavior changed in this follow-up.
Node 24.21.0 golden adoption passed after those corrections, including all 142 installed harness tests and application 4+1 tests.
The complete explanation inventory matches all 170 repository source paths without duplicates or omissions.
Diff whitespace checks passed. The original checkout remains clean, and the task worktree remains uncommitted.
Existing Tracn projects remain unchanged. Real adopted-project trials are the next evidence for agent behavior.
