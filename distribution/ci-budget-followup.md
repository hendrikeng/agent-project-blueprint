# CI budget follow-up

Date: 2026-09-10
Scope: blueprint test discovery and fixture execution. No publishing or deployment.

## Changes

- Generated harness commands now discover `scripts/ci/*.test.mjs`. The alignment checker requires the same command.
- Root tests retain distribution and bootstrap coverage. Template smoke owns the configured harness suite.
- The golden application runs standalone full verification without a duplicate fast invocation.
- Golden fixture commands use their own Git history instead of the parent GitHub Actions identity.

## Validation

- `npm run test:root`: 54 tests passed, including bootstrap, adoption, sync, and test ownership checks.
- The discovery regression accounts for every template test and retains the bootstrap-only tests in the root suite.
- The identity regression rejects the inherited parent identity and accepts the fixture's real local release branch.
- Independent review returned `scoped-clean`: `review-cuuu1_0x` under the authorized review root.
- The prior smoke run reached the release fixture, where the runtime guard denied `git checkout -b dev`. The unchanged denied command was not retried.
- The operator subsequently ran both fixture commands in a normal terminal against commit `cc7abfa`. Both passed.
- Verified logs: `/Users/hendrik/Code/.agent-toolkit-scratch/ci-proof.liziMQ/blueprint-smoke.log` and `blueprint-golden.log`.
- All local blueprint test commands now have passing evidence. The agent did not retry the denied fixture Git command.

## Hosted evidence

Run `34282431914` passed root and smoke checks but failed golden closeout at baseline `d6b807c`.
Its log identifies the inherited GitHub identity as the cause. The local fixture fix addresses that cause without changing production closeout.
A hosted run of these new commits and measured savings remain pending. This document does not claim hosted success.
