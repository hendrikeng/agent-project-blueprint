import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyChanges, metadataOnly, selectScope } from './classify-change.mjs';

const change = (path, status = 'M') => ({ path, status });

test('explicit categories narrow only recognized non-sensitive changes', () => {
  for (const [path, scope] of [
    ['src/components/Card.vue', 'product'], ['tests/card.test.ts', 'product'],
    ['docs/product-specs/cards.md', 'docs'], ['docs/exec-plans/active/cards.md', 'docs'],
    ['scripts/automation/verify-fast.mjs', 'harness'], ['docs/agent-hardening/EVALS.md', 'harness'],
    ['src/auth/session.ts', 'broad'], ['src/shared/types.ts', 'broad'],
    ['src/payments/money.ts', 'broad'], ['src/app.config.ts', 'broad'],
    ['package-lock.json', 'broad'], ['.github/workflows/ci.yml', 'broad'],
    ['scripts/ci/classify-change.mjs', 'broad'], ['unexpected.xyz', 'broad']
  ]) assert.equal(classifyChanges([change(path)]), scope, path);
  for (const status of ['D', 'R100', 'T', 'U']) assert.equal(classifyChanges([change('src/card.ts', status)]), 'broad');
  assert.equal(classifyChanges([]), 'broad');
  assert.equal(classifyChanges([change('src/card.ts'), change('scripts/automation/foo.mjs')]), 'broad');
});

test('metadata preserves old code evidence; base edits and release boundaries revalidate', () => {
  for (const action of ['edited', 'ready_for_review']) {
    assert.equal(metadataOnly('pull_request', { action }), true);
    assert.equal(selectScope('pull_request', { action }, []), 'metadata');
    assert.equal(metadataOnly('pull_request', { action, changes: { base: {} } }), false);
  }
  const pr = { action: 'edited', changes: { base: {} }, pull_request: { base: { ref: 'main' } } };
  assert.equal(selectScope('pull_request', pr, []), 'full');
  assert.equal(selectScope('pull_request', { action: 'synchronize', pull_request: { base: { ref: 'dev' } } }, [change('src/card.ts')]), 'product');
  assert.equal(selectScope('push', { ref: 'refs/heads/dev' }, []), 'broad');
  assert.equal(selectScope('push', { ref: 'refs/heads/main' }, []), 'full');
  assert.equal(selectScope('merge_group', {}, []), 'full');
});
