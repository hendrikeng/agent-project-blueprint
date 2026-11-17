## Fix Contract

Use this only for `fix/*` small fixes: small, isolated, low-risk changes
that do not need future planning, active execution-plan closeout, or durable
plan evidence. High-risk workflow, harness, CI, release, governance,
environment, identity, payments, database, security, and privileged-write paths still
require completed plan closeout. Use the slice template for normal planned
implementation work and the release template for release promotion to `main`.

- Branch: `fix/...`
- External issue: URL or `N/A`
- Target branch: `dev`
- Merge strategy: `Squash and merge`
- Small-fix rationale:
- Why no execution plan is needed:
- Reviewer context:

## Small-Fix Bounds

- [ ] The change is small, isolated, low risk, and expected to fit in one PR
- [ ] No future planning or active execution contract is needed for another engineer to review or resume the work
- [ ] No architecture boundary, critical invariant, data model, dependency, configuration, workflow, security, privacy-rights decision, privileged write, staged rollout, or complex product behavior change is included
- [ ] If the change stopped fitting the small-fix lane, it was converted to a `slice/*` PR before merge

## Checklist

- [ ] Recorded the small-fix rationale and review context above
- [ ] Linked the external issue, or marked it `N/A` when no tracker is used
- [ ] Updated canonical docs for any behavior or documentation-only correction that requires docs alignment
- [ ] Confirmed the changed behavior is covered by focused validation, or documented why no stable harness exists
- [ ] Removed introduced dead code, duplicate helpers, unused props/imports, and unnecessary wrappers
- [ ] Confirmed this implementation PR targets `dev`
- [ ] Confirmed the merge strategy is `Squash and merge`

## Engineering Quality Review

- Correctness and data contract:
- Boundary, auth, and permission impact:
- Reliability and failure-state handling:
- UI/UX, accessibility, and scanability impact:
- Test or evidence that covers the risky behavior:

## Docs Touched

- Canonical docs:
- Non-canonical docs:

## Validation Summary

Write the local gate command, the commit SHA, and the result. If you ran no local gate, write `none`.

- Local verification:

```text
Paste the commands you ran and the pass/fail outcome.
```

## Risks and Review Notes

- Open questions:
- Deferred follow-ons:
