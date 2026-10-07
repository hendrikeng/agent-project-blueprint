# Engineering Workflow

Status: canonical
Owner: {{DOC_OWNER}}
Last Updated: {{LAST_UPDATED_ISO_DATE}}
Source of Truth: This document.

## Queue Model

Proposed work lives in docs/future/. Executing work lives in docs/exec-plans/active/.
Completed plans and evidence live in docs/exec-plans/completed/ and docs/exec-plans/evidence-index/.
The generated context index shows unfinished work. It does not authorize execution or infer roadmap priority.

## Quality Review

Inspect correctness, trust boundaries, failure recovery, applicable accessibility, and focused evidence.
Use risk-based reviews at the repository's delivery boundary. Do not create repeated reviews for an unchanged bundle.

## Closeout

Update existing current-state facts and contracts. Remove resolved gaps and superseded limitations.
Move the completed plan once. Keep one concise evidence record and link large artifacts.
Run npm run context:compile and npm run docs:verify.

## References

Use `docs/PLANS.md` for lifecycle, `docs/exec-plans/README.md` for metadata, and `docs/agent-hardening/RUN_CONTROL.md` for delegation.
Use `docs/ops/automation/INTEROP_GITHUB.md` only for GitHub workflow integration.
