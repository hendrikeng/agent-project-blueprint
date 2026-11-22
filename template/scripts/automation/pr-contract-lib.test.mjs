import test from 'node:test';
import assert from 'node:assert/strict';
import { localVerificationWarnings, validatePrContract } from './pr-contract-lib.mjs';

test('only release branches can target main', () => {
  for (const headRef of ['dev', 'slice/example', 'fix/example', 'dependabot/npm_and_yarn/npm-minor-patch-1a2b']) {
    assert.match(validatePrContract({ headRef, baseRef: 'main', title: '', body: '' }).join('\n'), /release\/\*/);
  }
});

test('Dependabot updates can target dev, other unknown branches cannot', () => {
  assert.deepEqual(validatePrContract({ headRef: 'dependabot/github_actions/actions-minor-patch-1a2b', baseRef: 'dev', title: 'Bump actions', body: 'Bumps actions.' }), []);
  assert.match(validatePrContract({ headRef: 'feature/x', baseRef: 'dev', title: '', body: '' }).join('\n'), /slice\/\*, fix\/\*, or dependabot\/\*/);
});

const releaseBody = `## Release Contract
- Release ID: 2026.07.13.1
- Release branch: \`release/2026.07.13.1\`
- Target branch: \`main\`
- Included completed Plan-IDs: foundation
- Rollback or fix-forward plan: Revert the release merge commit.
- Release notes generated: \`npm run release:notes\`
- Release completeness verified: \`npm run release:verify\`
- Required release gates: Fast Gate / Full Gate / Release Candidate Gate
`;

test('release PR contract accepts equivalent package-manager commands but rejects missing scripts', () => {
  const input = { headRef: 'release/2026.07.13.1', baseRef: 'main', title: 'Release 2026.07.13.1' };
  assert.deepEqual(validatePrContract({ ...input, body: releaseBody.replaceAll('npm run', 'pnpm') }), []);
  assert.deepEqual(validatePrContract({ ...input, body: releaseBody.replaceAll('npm run', 'node --run') }), []);
  for (const body of [releaseBody.replace('`npm run release:notes`', ''), releaseBody.replace('release:verify', 'not-run'), releaseBody.replace('`npm run release:notes`', '`echo release:notes`'), releaseBody.replace('- Release notes generated:', 'Missing field: - Release notes generated:')]) {
    assert.match(validatePrContract({ ...input, body }).join('\n'), /must reference release:/);
  }
});

test('release PR contract rejects invalid dates before merge', () => {
  for (const version of ['2026.02.29.1', '2026.09.08.0', 'latest']) {
    assert.match(validatePrContract({ headRef: `release/${version}`, baseRef: 'main', title: `Release ${version}`, body: releaseBody }).join('\n'), /real date and positive sequence/);
  }
});

test('release PR contract validates the title and populated fields without mandatory hosted gates', () => {
  const input = { headRef: 'release/2026.07.13.1', baseRef: 'main', title: 'Release 2026.07.13.1' };
  assert.deepEqual(validatePrContract({ ...input, body: releaseBody }), []);
  // Release PRs opened with the older pass claim still validate.
  assert.deepEqual(validatePrContract({ ...input, body: releaseBody.replace('- Required release gates:', '- Required release gates passed:') }), []);
  for (const [field, value] of [['Release ID', '`YYYY.MM.DD.N`'], ['Release branch', '`release/YYYY.MM.DD.N`'],
    ['Included completed Plan-IDs', ''], ['Rollback or fix-forward plan', '...']]) {
    const body = releaseBody.replace(new RegExp(`^- ${field}:.*$`, 'm'), `- ${field}: ${value}`);
    assert.match(validatePrContract({ ...input, body }).join('\n'), new RegExp(`'${field}' must contain a non-template value`));
  }
  assert.match(validatePrContract({ ...input, body: releaseBody.replace('- Target branch: `main`', '- Target branch: `dev`') }).join('\n'),
    /'Target branch' must be 'main'; got 'dev'/);

  assert.match(validatePrContract({
    headRef: 'release/2026.07.13.1',
    baseRef: 'main',
    title: 'Ship it',
    body: releaseBody
  }).join('\n'), /release PR title must be 'Release 2026\.07\.13\.1'/);
});

test('a missing or empty local verification warns without failing the contract', () => {
  for (const body of ['', '- Local verification:', '- Local verification:   \n']) {
    assert.match(localVerificationWarnings(body).join('\n'), /Local verification is missing or empty/);
  }
  for (const value of ['none', '`npm run verify:fast` at abc1234: pass']) {
    assert.deepEqual(localVerificationWarnings(`## Validation Summary\r\n\r\n- Local verification: ${value}\r\n`), []);
  }
  const input = { headRef: 'release/2026.07.13.1', baseRef: 'main', title: 'Release 2026.07.13.1', body: releaseBody };
  assert.deepEqual(validatePrContract(input), []);
  assert.equal(localVerificationWarnings(input.body).length, 1);
});

test('a project can require more release fields, and a project without previews writes not-applicable', () => {
  const input = { headRef: 'release/2026.07.13.1', baseRef: 'main', title: 'Release 2026.07.13.1', extraReleaseFields: ['Preview URL'] };
  assert.match(validatePrContract({ ...input, body: releaseBody }).join('\n'), /'Preview URL' must contain a non-template value/);
  for (const value of ['https://preview.example.test', 'not-applicable']) {
    assert.deepEqual(validatePrContract({ ...input, body: `${releaseBody}- Preview URL: ${value}\n` }), []);
  }
});
