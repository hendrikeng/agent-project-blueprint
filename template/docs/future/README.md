# Proposed Work

Status: canonical
Owner: {{DOC_OWNER}}
Last Updated: {{LAST_UPDATED_ISO_DATE}}
Source of Truth: This directory.

Use this directory for scoped work that has not started. Do not create plans for routine small fixes.
`docs/PLANS.md` owns the lifecycle; `docs/exec-plans/README.md` owns the metadata contract.
A draft is a proposal. Its presence is not implementation authorization.

## Promotion

Use `draft` while decisions remain open and `ready-for-promotion` when the next slice has clear acceptance and validation.
Move the selected file to `docs/exec-plans/active/` when authorized implementation starts.
Keep later work concise. Split independent deliverables only when ownership or validation needs separate execution.
Close or remove obsolete proposals after checking code and current product state. Do not leave implemented checklists in this queue.
Run `npm run plans:verify` and regenerate `npm run context:compile` after queue changes.
