# Git Safety

Status: canonical
Owner: {{DOC_OWNER}}
Last Updated: {{LAST_UPDATED_ISO_DATE}}
Source of Truth: This document.

## File and Git Safety Rules

- Preserve unrelated work, including the user's index and untracked files.
- Inspect status and diffs before staging. Stage only explicit task-owned paths.
- Never use git add . or git commit -am for a shared dirty checkout.
- Do not clear the entire index before committing new files.
- Never revert or delete another person's work without explicit authorization.
- Do not stash, rewrite shared history, or force-push without explicit authorization.
- Create or switch a branch or worktree only when authorized by the task.
- Edit environment files only when explicitly requested. Never commit secret values.
- Use --body-file for multiline GitHub text.

## Commit Readiness

Inspect the staged diff and required evidence. Commit only when the user or workflow requests it.
Publication approval covers only its stated action, target, and scope.

## Recovery Rules

If a command changes unexpected state, inspect it before continuing.
Use a forward fix when it preserves user-owned work. Report unresolved conflicts with exact paths and state.
