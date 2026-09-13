import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePrContract } from './pr-contract-lib.mjs';

test('only release branches can target main', () => {
  for (const headRef of ['dev', 'slice/example', 'fix/example']) {
    assert.match(validatePrContract({ headRef, baseRef: 'main', title: '', body: '' }).join('\n'), /release\/\*/);
  }
});

const releaseBody = `## Release Contract
- Release ID: 2026.07.13.1
- Release notes generated: \`npm run release:notes\`
- Release completeness verified: \`npm run release:verify\`
- Required release gates passed: Fast Gate / Full Gate / Release Candidate Gate
`;

test('release PR contract accepts equivalent package-manager commands but rejects missing scripts', () => {
  const input = { headRef: 'release/2026.07.13.1', baseRef: 'main', title: 'Release 2026.07.13.1' };
  assert.deepEqual(validatePrContract({ ...input, body: releaseBody.replaceAll('npm run', 'pnpm') }), []);
  for (const body of [releaseBody.replace('`npm run release:notes`', ''), releaseBody.replace('release:verify', 'not-run'), releaseBody.replace('`npm run release:notes`', '`echo release:notes`'), releaseBody.replace('- Release notes generated:', 'Missing field: - Release notes generated:')]) {
    assert.match(validatePrContract({ ...input, body }).join('\n'), /must reference release:/);
  }
});

test('release PR contract rejects invalid dates before merge', () => {
  for (const version of ['2026.02.29.1', '2026.09.08.0', 'latest']) {
    assert.match(validatePrContract({ headRef: `release/${version}`, baseRef: 'main', title: `Release ${version}`, body: releaseBody }).join('\n'), /real date and positive sequence/);
  }
});

test('release PR contract validates the title without mandatory hosted gates', () => {
  assert.deepEqual(validatePrContract({
    headRef: 'release/2026.07.13.1',
    baseRef: 'main',
    title: 'Release 2026.07.13.1',
    body: releaseBody
  }), []);

  assert.match(validatePrContract({
    headRef: 'release/2026.07.13.1',
    baseRef: 'main',
    title: 'Ship it',
    body: releaseBody
  }).join('\n'), /release PR title must be 'Release 2026\.07\.13\.1'/);
});
