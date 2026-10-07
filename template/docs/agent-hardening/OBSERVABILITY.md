# Run Evidence

Status: canonical
Owner: {{DOC_OWNER}}
Last Updated: {{LAST_UPDATED_ISO_DATE}}
Source of Truth: This document.

## Required Run Trace Fields

For ordinary work, retain the objective, changed paths, checks and results, unresolved risks, and next action.
A plan or PR can hold this record. Do not create a separate trace file for each task.
For autonomous or sensitive operations, add target, authorization, runtime identity, and consequential tool outcomes.
Detailed token, timing, and per-tool traces are optional runtime capabilities.

## Error Classification

Distinguish validation errors, runtime errors, missing facts, user interruption, and policy denials.
Record the smallest reproduction and unfinished requirement. Passing checks do not erase a separate blocker.

## Retention and Redaction

Keep compact text evidence with the plan: exact commands, observed outcomes, relevant commit references, and unresolved risks.
Do not commit screenshots, images, videos, or other binary files as evidence, including embedded or base64-encoded media.
Use temporary captures for visual checks. Record what you inspected and the result in text.
If retained media is necessary, link an artifact in an existing approved external store. Do not create storage just for evidence.
This restriction applies to evidence, not product assets or test fixtures required by the project.
Link large output instead of copying it.
Redact secrets and private data. Define retention before adding external trace storage.
