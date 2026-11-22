# Bootstrap Placeholder Contract

Replace all `{{...}}` tokens after installing the blueprint into a repository and before the first merge.

The goal is not to fill blanks mechanically. Each replacement should make the adopted repository's product scope, architecture, quality gates, ownership, and risk boundaries explicit enough for future humans and agents to trust.

## Required Core Placeholders

- `{{PRODUCT}}`
- `{{SUMMARY}}`
- `{{PRODUCT_DIRECTION}}`
- `{{PRIMARY_USERS}}`
- `{{TARGET_OUTCOMES}}`
- `{{DOC_OWNER}}`
- `{{LAST_UPDATED_ISO_DATE}}`
- `{{CURRENT_STATE_DATE}}`
- `{{SCOPE1}}`, `{{SCOPE2}}`, `{{SCOPE3}}`

## Architecture/Stack Placeholders

- `{{FRONTEND_STACK}}`
- `{{BACKEND_STACK}}`
- `{{DATA_STACK}}`
- `{{SHARED_CONTRACT_STRATEGY}}`
- `{{FRONTEND_ENTRYPOINT_1}}`, `{{FRONTEND_ENTRYPOINT_2}}`
- `{{BACKEND_ENTRYPOINT_1}}`, `{{BACKEND_ENTRYPOINT_2}}`

## Invariant/Security Placeholders

- `{{CRITICAL_DOMAIN_SET}}`
- `{{SERVER_AUTHORITY_BOUNDARY_SET}}`
- `{{MONEY_AND_NUMERIC_RULE}}`
- `{{DOMAIN_INVARIANT_AREA_1..3}}`
- `{{DOMAIN_INVARIANT_1A..3B}}`
- `{{CRITICAL_FLOW_1..3}}`

## Quality Placeholders

- `{{SCORE_DOMAIN_CORRECTNESS}}`
- `{{SCORE_CRITICAL_SAFETY}}`
- `{{SCORE_AUTHZ_BOUNDARIES}}`
- `{{SCORE_ARCH_BOUNDARIES}}`
- `{{SCORE_DOC_GOVERNANCE}}`
- `{{SCORE_CRITICAL_TESTS}}`
- `{{QUALITY_GAP_1}}`, `{{QUALITY_GAP_2}}`

## Governance/Architecture Rule Placeholders

- `{{NODE_VERSION}}`
- `{{CI_INSTALL_COMMAND}}`
- `{{PACKAGE_MANAGER_CACHE}}`
- `{{PACKAGE_MANAGER_LOCKFILE}}`
- `{{PROJECT_LINT_COMMAND}}`
- `{{PROJECT_TYPECHECK_COMMAND}}`
- `{{PROJECT_UNIT_TEST_COMMAND}}`
- `{{PROJECT_AFFECTED_TEST_COMMAND}}` (pull requests run only the tests that the diff can reach. Use the unit test command if the runner has no selection.)
- `{{PROJECT_BUILD_COMMAND}}`

## Ownership/Approval Placeholders

- `{{CODEOWNERS_DEFAULT_TEAM}}` (default owner for repository paths, e.g. `@org/platform-engineering`)
- `{{CODEOWNERS_SECURITY_TEAM}}` (security approver for sensitive paths, e.g. `@org/security-ops`)

## Conformance Artifact Placeholders

- `{{GENERATED_AT_UTC_ISO}}`
- `{{CONFORMANCE_SOURCE}}`
- `{{REPOSITORY_PROFILE_SNAKE_CASE}}`
- `{{CONFORMANCE_PURPOSE}}`
- `{{OUT_OF_SCOPE_ITEM_1..3}}`
- `{{CI_WORKFLOW_PATH}}`
- `{{EVAL_PROVIDER}}`
- `{{EVAL_MODEL_ID}}`
- `{{EVAL_RUNTIME_VERSION}}`
- `{{EVAL_PROMPT_VERSION}}`
- `{{EVAL_TOOL_CONFIG_VERSION}}`

## Recommended Defaults

Use these defaults unless the product domain clearly does not apply:

- `{{CRITICAL_DOMAIN_SET}}`: `auth, tenant boundaries, lifecycle transitions, money (if applicable)`
- `{{SERVER_AUTHORITY_BOUNDARY_SET}}`: `auth decisions, lifecycle transitions, inventory/state mutation, billing/credits`
- `{{MONEY_AND_NUMERIC_RULE}}`: `Use fixed-point/minor-unit math for financial values; no floating-point money math.`
- `{{DOMAIN_INVARIANT_AREA_1}}`: `Auth and tenant boundaries`
- `{{DOMAIN_INVARIANT_AREA_2}}`: `Lifecycle/state transitions`
- `{{DOMAIN_INVARIANT_AREA_3}}`: `Financial/accounting behavior (if applicable)`

If a domain does not use billing/credits/payments, keep the placeholder explicit with `not applicable` and remove money-specific rules from runtime code/docs.

- `{{CODEOWNERS_DEFAULT_TEAM}}`: `@your-org/platform-engineering`
- `{{CODEOWNERS_SECURITY_TEAM}}`: `@your-org/security-ops`
- `{{NODE_VERSION}}`: `26` (active LTS). An existing project can keep `24` (maintenance).
- `{{CI_INSTALL_COMMAND}}`: `pnpm install --frozen-lockfile` (default), `bun install --frozen-lockfile`, `npm ci`, or `yarn install --immutable`
- `{{PACKAGE_MANAGER_CACHE}}`: `pnpm` (default), `bun`, `npm`, or `yarn`
- `{{PACKAGE_MANAGER_LOCKFILE}}`: `pnpm-lock.yaml` (default), `bun.lock`, `package-lock.json`, or `yarn.lock`

## Validation Command

Run this command in the initialized repository. It must report no unresolved placeholders:

```bash
./scripts/check-template-placeholders.sh
```

Then run:

```bash
./scripts/bootstrap-verify.sh
```

This is a bootstrap-only guide. `bootstrap-verify.sh` runs `node --run bootstrap:cleanup` after verification; that final cleanup removes this file and `package.scripts.fragment.json` once placeholders are clear and package scripts have been merged.
