import test from 'node:test';
import assert from 'node:assert/strict';

import {
  inferPlanId,
  metadataValue,
  parseMetadata,
  parseMustLandChecklist,
  setMetadataFields
} from './plan-metadata.mjs';

test('parseMetadata reads bullet metadata from the Metadata section', () => {
  const content = [
    '# Plan',
    '',
    '## Metadata',
    '',
    '- Plan-ID: red-inbox',
    '- Status: queued',
    '- Validation-Lanes: always, host-required'
  ].join('\n');

  const metadata = parseMetadata(content);
  assert.equal(metadataValue(metadata, 'Plan-ID'), 'red-inbox');
  assert.equal(metadataValue(metadata, 'Validation-Lanes'), 'always, host-required');
});

test('parseMustLandChecklist extracts stable must-land identifiers', () => {
  const checklist = parseMustLandChecklist([
    '## Must-Land Checklist',
    '',
    '- [x] `ml-red-inbox` Make the inbox red.',
    '- [ ] `ml-red-inbox-tests` Add tests.'
  ].join('\n'));

  assert.deepEqual(checklist.map((entry) => entry.id), ['ml-red-inbox', 'ml-red-inbox-tests']);
  assert.deepEqual(checklist.map((entry) => entry.checked), [true, false]);
});

test('setMetadataFields updates values and preserves order', () => {
  const updated = setMetadataFields([
    '# Plan',
    '',
    '## Metadata',
    '',
    '- Plan-ID: red-inbox',
    '- Status: draft'
  ].join('\n'), {
    Status: 'queued',
    'Risk-Tier': 'medium'
  });

  assert.match(updated, /- Plan-ID: red-inbox/);
  assert.match(updated, /- Status: queued/);
  assert.match(updated, /- Risk-Tier: medium/);
});

test('inferPlanId falls back to the dated filename stem', () => {
  const planId = inferPlanId('# Plan\n', '/tmp/docs/future/2026-03-17-red-inbox.md');
  assert.equal(planId, 'red-inbox');
});
