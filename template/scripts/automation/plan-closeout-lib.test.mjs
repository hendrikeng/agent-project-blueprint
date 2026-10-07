import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isHighRiskStandardChangePath,
  isCandidateDispatch,
  resolveCloseoutBranch,
  summarizePlanCloseoutDiff
} from './plan-closeout-lib.mjs';

test('selected candidate closeout binds exact revision to trusted workflow identity', () => {
  const head = 'a'.repeat(40);
  const event = { ref: 'refs/heads/main', inputs: { revision: head }, repository: { default_branch: 'main', full_name: 'acme/app' } };
  const env = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_SHA: 'b'.repeat(40),
    GITHUB_REF: event.ref, GITHUB_REPOSITORY: 'acme/app', GITHUB_WORKFLOW_REF: 'acme/app/.github/workflows/ci-candidate.yml@refs/heads/main' };
  assert.equal(isCandidateDispatch(head, env, event), true);
  assert.equal(resolveCloseoutBranch('', head, env, event), 'dev');
  for (const invalid of [{ GITHUB_REF: 'refs/heads/feature' }, { GITHUB_EVENT_NAME: 'push' },
    { GITHUB_WORKFLOW_REF: 'acme/app/.github/workflows/other.yml@refs/heads/main' }, { PLAN_CLOSEOUT_BRANCH_NAME: 'main' }]) {
    assert.equal(isCandidateDispatch(head, { ...env, ...invalid }, event), false);
    assert.throws(() => resolveCloseoutBranch('', head, { ...env, ...invalid }, event), /Detached closeout/);
  }
  assert.equal(isCandidateDispatch('c'.repeat(40), env, event), false);
  assert.throws(() => resolveCloseoutBranch('feature', head, env, event), /Detached closeout/);
});

test('fix-lane closeout recognizes sensitive paths across workspace roots', () => {
  for (const filePath of [
    'apps/api/src/auth/auth.controller.ts',
    'apps/api/src/persistence/drizzle/schema.ts',
    'apps/api/src/persistence/drizzle/migrations/0020_example.sql',
    'packages/types/src/auth/session.ts',
    'packages/validators/src/tenancy/scope.ts',
    'apps/api/src/billing/credits.service.ts',
    'src/identity.ts',
    'src/auth0.ts', 'src/lib/auth0Client.ts',
    'src/lib/nextauth.ts', 'src/authprovider.ts', 'src/authority.ts',
    'src/securityheaders.ts', 'src/accesstoken.ts',
    'apps/api/src/tenancy.ts',
    'apps/api/src/persistence.ts',
    'src/user-token.ts',
    'src/db-client.ts',
    'src/authenticate.ts', 'src/authorize.ts', 'src/authenticator.ts', 'src/unauthorized.ts', 'src/isAuthenticated.ts',
    'src/authentication.ts',
    'apps/api/src/services/authorization.ts',
    'src/sessionToken.ts', 'src/oauth/callback.ts', 'src/schemas/user.ts', 'src/auth/tokens.css'
  ]) {
    assert.equal(isHighRiskStandardChangePath(filePath), true, filePath);
    for (const branchName of ['fix/boundary', 'dev', 'main']) {
      assert.equal(summarizePlanCloseoutDiff([filePath], { branchName }).requiresPlanCloseout, true, `${branchName}: ${filePath}`);
    }
  }

  const summary = summarizePlanCloseoutDiff(
    ['apps/api/src/auth/auth.controller.ts'],
    { branchName: 'fix/session-boundary' }
  );
  assert.equal(summary.requiresPlanCloseout, true);
  assert.deepEqual(summary.highRiskStandardChangeFiles, ['apps/api/src/auth/auth.controller.ts']);
});

test('fix-lane closeout still permits an isolated low-risk implementation path', () => {
  for (const filePath of ['apps/agent-web/components/empty-state.tsx', 'src/components/AuthorCard.tsx', 'src/components/AuthorsList.tsx',
    'src/components/AuthoringPanel.tsx',
    'src/ui/tokens.css', 'src/ui/designTokens.scss', 'src/ui/tokens.module.css', 'src/ui/tokenColors.scss',
    'src/ui/tokens.dark.css', 'README.md', 'docs/product-specs/CURRENT-STATE.md']) {
    for (const branchName of ['fix/maintenance', 'dev', 'main']) {
      const summary = summarizePlanCloseoutDiff([filePath], { branchName });
      assert.equal(summary.requiresPlanCloseout, false, `${branchName}: ${filePath}`);
      assert.deepEqual(summary.highRiskStandardChangeFiles, []);
    }
  }
  assert.equal(summarizePlanCloseoutDiff(['README.md', 'src/authentication.ts'],
    { branchName: 'fix/security' }).requiresPlanCloseout, true);

});

test('closeout excludes nested evidence receipts from active and completed plan delivery', () => {
  const summary = summarizePlanCloseoutDiff([
    'docs/exec-plans/active/payments/evidence/receipt.md',
    'docs/exec-plans/completed/payments/evidence/receipt.md',
    'docs/exec-plans/active/payments/recovery.md'
  ], { branchName: 'slice/recovery' });
  assert.deepEqual(summary.activePlanFiles, ['docs/exec-plans/active/payments/recovery.md']);
  assert.deepEqual(summary.completedPlanFiles, []);
});
