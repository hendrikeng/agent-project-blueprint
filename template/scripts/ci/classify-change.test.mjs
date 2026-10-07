import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyChanges, metadataOnly, selectScope } from './classify-change.mjs';

const change = (path, status = 'M') => ({ path, status });

test('explicit categories narrow only recognized non-sensitive changes', () => {
  for (const [path, scope] of [
    ['src/components/Card.vue', 'product'], ['src/components/AuthorCard.tsx', 'product'],
    ['src/ui/tokens.css', 'product'], ['src/ui/designTokens.scss', 'product'], ['src/ui/tokens.module.css', 'product'],
    ['src/ui/tokenColors.scss', 'product'], ['src/ui/tokens.dark.css', 'product'],
    ['src/auth/tokens.css', 'broad'], ['src/oauth/callback.ts', 'broad'], ['src/schemas/user.ts', 'broad'],
    ['docs/product-specs/CURRENT-STATE.md', 'docs'], ['tests/card.test.ts', 'product'],
    ['docs/product-specs/cards.md', 'docs'], ['docs/exec-plans/active/cards.md', 'docs'],
    ['scripts/automation/verify-fast.mjs', 'harness'], ['docs/agent-hardening/EVALS.md', 'harness'],
    ['src/auth/session.ts', 'broad'], ['src/shared/types.ts', 'broad'],
    ['src/auth0.ts', 'broad'], ['src/lib/auth0Client.ts', 'broad'],
    ['src/lib/nextauth.ts', 'broad'], ['src/authprovider.ts', 'broad'], ['src/authority.ts', 'broad'],
    ['src/securityheaders.ts', 'broad'], ['src/accesstoken.ts', 'broad'],
    ['src/components/AuthoringPanel.tsx', 'product'],
    ['src/identity.ts', 'broad'], ['apps/api/src/tenancy.ts', 'broad'],
    ['apps/api/src/persistence.ts', 'broad'], ['src/db-client.ts', 'broad'],
    ['src/authenticate.ts', 'broad'], ['src/authorize.ts', 'broad'], ['src/authenticator.ts', 'broad'],
    ['src/unauthorized.ts', 'broad'], ['src/isAuthenticated.ts', 'broad'],
    ['src/components/AuthorsList.tsx', 'product'], ['src/authentication.ts', 'broad'], ['apps/api/src/services/authorization.ts', 'broad'], ['src/sessionToken.ts', 'broad'],
    ['src/payments/money.ts', 'broad'], ['src/app.config.ts', 'broad'],
    ['package-lock.json', 'broad'], ['.github/workflows/ci.yml', 'broad'],
    ['scripts/ci/classify-change.mjs', 'broad'], ['unexpected.xyz', 'broad']
  ]) assert.equal(classifyChanges([change(path)]), scope, path);
  for (const status of ['D', 'R100', 'T', 'U']) assert.equal(classifyChanges([change('src/card.ts', status)]), 'broad');
  assert.equal(classifyChanges([]), 'broad');
  assert.equal(classifyChanges([change('src/card.ts'), change('scripts/automation/foo.mjs')]), 'broad');
});

test('metadata preserves old code evidence; base edits and release boundaries revalidate', () => {
  assert.equal(metadataOnly('pull_request', { action: 'edited', changes: { body: { from: 'old' } } }), true);
  assert.equal(selectScope('pull_request', { action: 'edited' }, []), 'metadata');
  assert.equal(metadataOnly('pull_request', { action: 'edited', changes: { base: {} } }), false);
  for (const action of ['opened', 'synchronize', 'reopened', 'ready_for_review']) {
    assert.equal(metadataOnly('pull_request', { action }), false);
    assert.equal(selectScope('pull_request', { action, pull_request: { base: { ref: 'dev' } } }, [change('src/card.ts')]), 'product');
    assert.equal(selectScope('pull_request', { action, pull_request: { base: { ref: 'main' } } }, []), 'full');
  }
  const pr = { action: 'edited', changes: { base: {} }, pull_request: { base: { ref: 'main' } } };
  assert.equal(selectScope('pull_request', pr, []), 'full');
  assert.equal(selectScope('pull_request', { action: 'synchronize', pull_request: { base: { ref: 'dev' } } }, [change('src/card.ts')]), 'product');
  assert.equal(selectScope('push', { ref: 'refs/heads/dev' }, []), 'broad');
  assert.equal(selectScope('push', { ref: 'refs/heads/main' }, []), 'full');
  assert.equal(selectScope('merge_group', {}, []), 'full');
});
