# Pull Request Template Selector

Use the template that matches the source branch class. Do not submit this
selector as the PR body.

- `slice/* -> dev`: use `.github/PULL_REQUEST_TEMPLATE/slice.md` for normal planned implementation work.
- `fix/* -> dev`: use `.github/PULL_REQUEST_TEMPLATE/fix.md` only for small, isolated, low-risk fixes that do not need plan closeout.
- `release/YYYY.MM.DD.N -> main`: use `.github/PULL_REQUEST_TEMPLATE/release.md` for release promotion to `main`.

Merge strategy:

- `slice/* -> dev`: `Squash and merge`
- `fix/* -> dev`: `Squash and merge`
- `release/YYYY.MM.DD.N -> main`: merge commit, squash, or rebase; release and source tags preserve both revision boundaries

If this selector appears after opening a PR, replace the full PR body with the
matching branch-class template before marking the PR ready for review. `Fast
Gate` runs `node --run pr:verify` and rejects missing or mixed branch-class
contracts.
