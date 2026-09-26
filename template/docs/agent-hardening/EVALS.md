# Eval Policy

Status: canonical
Owner: {{DOC_OWNER}}
Last Updated: {{LAST_UPDATED_ISO_DATE}}
Source of Truth: This document.

## Eval Lifecycle

- Define stable golden tasks for high-risk and high-value workflows: planning, code edits, tool use, delegation/run control, memory recovery, review, and closeout.
- Add targeted regression tasks for every repeated failure mode, incident, or escaped defect.
- Run the required suite on model, prompt, tool policy, runtime, or canonical-doc changes before treating the change as merge-ready.
- Track provider, model, prompt/runtime version, tool policy version, input fixture, output artifact, and evidence path for every run.
- Treat eval regressions as defects. They must be fixed, mitigated, or explicitly accepted with owner, expiry, and follow-up.
- Keep eval fixtures deterministic unless the test is explicitly measuring nondeterminism, retry behavior, or degraded-provider handling.

## Failure Taxonomy

- `hallucination`: output invents facts or behavior.
- `policy_violation`: output or action breaks explicit policy.
- `tool_misuse`: invalid tool choice, sequence, or parameter use.
- `delegation_misuse`: agent handoff, subagent, background run, or runtime-native goal loop has unclear ownership, excessive tool scope, missing integration review, or no repo-local evidence.
- `workflow_incomplete`: task stops before required completion criteria.
- `context_loss`: agent drops active scope, prior validated state, constraints, or required evidence after interruption or compaction.
- `unsafe_write`: edit, command, API call, or external side effect exceeds user intent or approved risk tier.
- `verification_gap`: final claim is not backed by the required command, test, review, screenshot, trace, or manual evidence.
- `regression_escape`: known previous failure mode reappears without detection by the required suite.

## Failure Fixture Contract

- Required failure fixtures are declared in `docs/agent-hardening/evals.config.json` under `requiredFailureFixtures`.
- Fixture files live under `docs/agent-hardening/eval-fixtures/` and must be deterministic JSON objects with `id`, `suiteId`, `failureClass`, `severity`, `prompt`, `badOutcome`, `expectedDetection`, and `requiredEvidence`.
- Every required fixture must map to a required suite and one taxonomy class so downstream reports prove the failure mode is covered, not just named.
- Add a fixture when an agent repeatedly fails by delegating badly, claiming fake tests, resuming from stale context, missing plan closeout, or using unsafe tools.
- Keep fixture prompts small and adversarial enough to reproduce the failure without depending on runtime-specific behavior.

## Release Gates

- Required suites must pass at the status declared in `docs/agent-hardening/evals.config.json`.
- Open critical and high regressions must be at or below configured maximums.
- New critical or high failure classes block release until mitigated or explicitly accepted in writing with owner and expiry.
- Changes to critical flows require updated eval coverage in the same change.
- The generated eval report must point to repository-local evidence for every required suite.
- A pass is valid only when the evidence proves the behavior under the relevant policy, model/runtime, and tool boundary.
- Manual eval evidence is acceptable only when automation is not yet available and the evidence names the reviewer, fixture, observed result, and follow-up automation path.

## Generated Artifact Contract

- Config source of truth: `docs/agent-hardening/evals.config.json`.
- Generated report artifact: `docs/generated/evals-report.json`.
- Refresh command: `npm run eval:refresh`. This command does not run evaluations.
- New reports start with `status: not-run` and zero results. Bootstrap cannot convert these defaults into a passing run.
- Verifier and agent activation command: `npm run eval:verify`.
- Required report fields:
  - `status`: `pass` only after the required suites complete successfully
  - `generatedAtUtc` (provenance only in content-addressed mode)
  - `inputSha256` when `freshnessMode` is `content-addressed`
  - `runtime` with `provider`, `model`, `runtimeVersion`, `promptVersion`, and `toolConfigVersion`, matching the config
  - `summary.total`, `summary.passed`, `summary.failed`, `summary.passRate`
  - `regressions.criticalOpen`, `regressions.highOpen`
  - `suites[]` with `id`, `status`, `total`, `passed`, `failed`, and `execution`
  - Each `execution` names `runner`, `executedAtUtc`, `inputSha256`, `fixtureIds`, and a repository-local `evidence` path.
  - `evidence[]` repository-local references
- Recommended report fields:
  - suite-level `evidence` and failure class counts when the runner supports them
  - links to incident, plan, PR, or evidence-index entries for accepted exceptions
- Gate policy:
  - Content-addressed reports must match the agent-hardening docs, `AGENTS.md`, planning rules, governance rules, Git safety, engineering invariants, policy manifest, config, and fixtures.
  - The config declares the current `runtime` identity. A change to its provider, model, runtime version, prompt version, or tool configuration version invalidates evidence.
  - `additionalInputPaths` lists repo-local files for prompts, tools, runtime configuration, or other behavior rules. Changes to these files also invalidate evidence.
  - If inputs change, `npm run eval:refresh` resets results to `not-run` and removes execution references. It preserves the previous timestamp.
  - Refreshing unchanged inputs preserves results. It never creates execution evidence or grants a pass.
  - Time-bound reports, when configured, must satisfy `maxAgeDays`.
  - Pass-rate must satisfy `minimumPassRate`.
  - Open critical/high regressions must be at or below configured maximums.
  - Required suite IDs/statuses must be present and valid.
  - Execution evidence must contain observed output, not the report itself, a policy document, or an input fixture.
  - Each execution hash must match the current inputs. Its fixture IDs must cover all required fixtures for that suite.
  - Counts must be non-negative integers. Summary totals must equal suite totals, and passing suites must have no failed cases.
  - Evidence paths must stay inside the repository and must not contain unresolved placeholders outside template mode.

## Record A Run

1. Run `npm run eval:refresh` to calculate the current input hash.
2. Run each required suite against the configured model, runtime, and tools, or perform the documented manual evaluation.
3. Save observed output in a repository-local evidence file. For manual evaluations, include the reviewer, observations, and automation follow-up.
4. Record the runner, execution timestamp, input hash, covered fixture IDs, and evidence path in each suite's `execution` object.
5. Record the evaluated `runtime`, counts, and report timestamp from the completed run. Set `status` to `pass` only for a successful run.
6. Run `npm run eval:verify`.

The verifier checks evidence structure, scope, and input freshness. It cannot prove that a transcript is genuine or judge its meaning.
The operator remains responsible for accurate observations, outcome assessment, and the runtime identity.
Before a model, runtime, prompt, or tool change, update the config identity or its declared input files. Then rerun the evaluations.
The verifier cannot detect external runtime changes that the operator does not record.
CI fixtures can define harness-only suites. Passing those suites does not prove agent behavior or satisfy the default safety suites.
