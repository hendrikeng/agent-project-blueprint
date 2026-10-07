# Agent Evaluations

Status: canonical
Owner: {{DOC_OWNER}}
Last Updated: {{LAST_UPDATED_ISO_DATE}}
Source of Truth: This document.

## Eval Lifecycle

Evaluate the exact provider, model, prompt, runtime, and tools on representative project tasks before relying on autonomous behavior.
Use small golden tasks and regressions for observed failures. Model recommendations and structural checks are not behavioral evidence.
For model or harness changes, compare the same representative tasks and starting state. Track correctness, recovery, context use, time, and cost; remove one instruction or workflow component at a time and check for regressions.
The blueprint supplies fixture contracts and evidence verification. It does not ship a provider-specific agent runner.

## Failure Taxonomy

Use hallucination, policy_violation, tool_misuse, delegation_misuse, workflow_incomplete, context_loss, unsafe_write, verification_gap, and regression_escape.
Prioritize task completion, safe boundaries, recovery after interruption, stale-context reconciliation, and honest final claims.

## Failure Fixture Contract

`docs/agent-hardening/evals.config.json` declares suites, required fixtures, runtime identity, and additional input paths.
JSON fixtures under `docs/agent-hardening/eval-fixtures/` have id, suiteId, failureClass, severity, prompt, badOutcome, expectedDetection, and requiredEvidence.
Use reproducible inputs. Add a focused fixture when a recurring failure warrants it.

## Release Gates

Ordinary software checks run `npm run eval:integrity`. This accepts a fresh, honest not-run report, or validates an existing passing report.
It does not grant agent activation or claim that behavior was evaluated.
Before activating a new agent configuration, run the required suites and `npm run eval:verify`.
Strict verification requires passing counts, valid runtime identity, current input hashes, required fixture coverage, execution records, local observed-output evidence, and configured regression limits.
A small pass-rate sample is not statistical confidence. Choose representative tasks and repeat stochastic runs when the risk needs it.

## Generated Artifact Contract

`docs/generated/evals-report.json` records status, generatedAtUtc, inputSha256, runtime, summary, regressions, suites, and evidence.
Each executed suite names its runner, executedAtUtc, inputSha256, fixtureIds, and evidence path.
`npm run eval:refresh` calculates the input hash. Changed inputs reset results to not-run and remove execution evidence; unchanged inputs preserve results.
Refresh does not execute a model. Hashes establish input identity, not transcript authenticity or behavioral correctness.
Declare external runtime changes in config or additionalInputPaths. The verifier cannot observe undeclared provider changes.
Required startup sources are hashed by default. Add task-relevant framework, domain, and surface conventions to additionalInputPaths. If a task deliberately varies product state, record that variation as an evaluation input. Input hashes do not prove that an agent read or followed the instructions.

## Record A Run

1. Refresh the input hash and select the configured runtime.
2. Execute each required suite. Manual evaluation names the reviewer, fixture, observations, and automation follow-up.
3. Save observed output in repository-local evidence, with secrets removed.
4. Record suite execution identity, fixture coverage, truthful counts, and the run timestamp.
5. Set pass only after successful evaluation. Run `npm run eval:verify`.

Harness-only CI fixtures prove harness behavior. They do not prove the default agent safety suites.
