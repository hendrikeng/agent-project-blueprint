# Dependency Direction

Status: canonical
Owner: {{DOC_OWNER}}
Last Updated: {{LAST_UPDATED_ISO_DATE}}
Source of Truth: This document.

Describe actual module responsibilities and permitted dependencies during adoption.
Do not create types, config, repository, service, adapter, and UI layers merely to satisfy this document.
Keep sensitive authority in a trusted runtime. Keep client bundles free of server-only code and secrets.
Pure contracts must not acquire runtime side effects.
Use existing architecture until a concrete requirement justifies changing it.
