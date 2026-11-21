## Release Contract

- Release ID: `YYYY.MM.DD.N`
- Release branch: `release/YYYY.MM.DD.N`
- Release PR title: `Release YYYY.MM.DD.N`
- Release tag: `vYYYY.MM.DD.N` at the landed revision
- Source tag: `source-vYYYY.MM.DD.N` at the release head; both tags are created automatically after merge
- Release class: standard / hotfix / platform
- Source branch: `release/YYYY.MM.DD.N`
- Target branch: `main`
- Merge strategy confirmed: merge commit, squash, or rebase
- Project-specific deployment or test evidence, if applicable:
- Included completed Plan-IDs:
- Release notes generated: `node --run release:notes`
- Release completeness verified: `node --run release:verify`
- Release-branch fixes mirrored to `dev`: yes / none
- Required release gates passed: Fast Gate / Full Gate / Release Candidate Gate
- Additional project-specific gates and results, if applicable:
- Database migrations, backfills, or data repairs:
- Environment or configuration changes:
- Rollback or fix-forward plan:
- Known validation gaps accepted for this release:

## Release Scope

- Release class:
- Included completed slices:
- Production-facing behavior changes:
- Operational changes:

## Release Quality Review

- Highest-risk included behavior:
- Completed evidence covering that behavior:
- Security, privacy, data, payment, or privileged-operation impact:
- Operator recovery or fix-forward readiness:

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
