# Security

Status: canonical
Owner: {{DOC_OWNER}}
Last Updated: {{LAST_UPDATED_ISO_DATE}}
Source of Truth: This document.

## Security Model

Enforce privileged actions at the trusted server or data boundary. Name each actor's resource and scope.
Use the existing identity and authorization modules. Jobs, scripts, webhooks, and service accounts have explicit permissions too.
Treat uploads, callbacks, feeds, retrieved text, and user content as untrusted input.
Keep secrets out of source, client bundles, docs, fixtures, logs, and evidence.
Minimize sensitive product data in storage, logs, analytics, exports, and support tools. Redact private payloads and free text.
For retained sensitive data, define retention and deletion against actual product, audit, and recovery needs.

## Security Review Checklist

For a changed trust boundary, check authorization, cross-account isolation, validation, replay, and external effects.
Use least-privilege credentials. Validate webhook signatures and replay handling when applicable.
For dependency changes, review relevant advisories and the application's exposure. Use the declared security checks; document unresolved exposure, mitigation, and an owner rather than treating scanner output as proof of safety.
Add a focused regression check for a security defect when a stable harness exists. Record any remaining exposure and recovery path.
Project-specific threats and controls belong here. Remove descriptions of retired controls rather than appending a new status paragraph.
