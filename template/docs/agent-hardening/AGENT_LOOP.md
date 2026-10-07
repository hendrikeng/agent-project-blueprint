# Working Loop

Status: canonical
Owner: {{DOC_OWNER}}
Last Updated: {{LAST_UPDATED_ISO_DATE}}
Source of Truth: This document.

## Loop Contract

1. Identify the requested outcome and current constraints.
2. Read current product state, relevant code, and tests.
3. Maintain a compact plan when risk or session length requires it.
4. Implement the smallest complete change.
5. Run focused checks and fix observed failures.
6. Update current facts and unfinished work in place.
7. Report evidence, skipped checks, and remaining risks.

## Loop Inputs

Use `AGENTS.md`, `docs/product-specs/CURRENT-STATE.md`, the requested plan, and nearest live code.
Read `VISION.md` only for product-direction decisions. Load specialized policy only for applicable work.

## Checks That Can Say No

Tests, type checks, lint, builds, targeted manual observations, and required delivery gates can reject a claim.
Self-review alone does not prove behavior.

## Evidence And Closeout

Record concise commands, outcomes, and artifact references in the plan or PR.
Move a completed plan to completed and refresh context. Do not create duplicate evidence narratives.

## Stop Rules

Stop dependent work for missing authorization or facts that materially change the outcome.
Name the blocker and continue independent authorized work.
Routine reversible implementation choices do not require another approval.
