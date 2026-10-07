# Quality Score

Status: canonical
Owner: {{DOC_OWNER}}
Last Updated: {{LAST_UPDATED_ISO_DATE}}
Source of Truth: This document.

## Scoring Legend

Scores describe verified enforcement: 1 missing, 2 partial, 3 baseline, 4 implemented with small gaps, 5 continuously enforced.

## Domain Scores

- Domain correctness and invariants: {{SCORE_DOMAIN_CORRECTNESS}}
- Critical-domain safety and auditability: {{SCORE_CRITICAL_SAFETY}}
- Authorization and boundary enforcement: {{SCORE_AUTHZ_BOUNDARIES}}

## Platform Scores

- Architecture boundary enforcement: {{SCORE_ARCH_BOUNDARIES}}
- Documentation governance enforcement: {{SCORE_DOC_GOVERNANCE}}
- Test coverage for critical flows: {{SCORE_CRITICAL_TESTS}}

## Periodic Rubric

Run `npm run quality:score` during scheduled maintenance or after a substantial gate change.
This is an optional maintenance view, not proof that a feature works and not a per-edit requirement.
Update scores only when evidence changes. Link the measured gap and its enforcement surface.
Current product gaps belong in `docs/product-specs/CURRENT-STATE.md`; avoid duplicating their full details here.

## Current Gaps

- {{QUALITY_GAP_1}}
- {{QUALITY_GAP_2}}
