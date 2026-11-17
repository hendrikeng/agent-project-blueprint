import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import slowestTests from './slowest-tests-reporter.mjs';

test('the reporter lists the slowest tests first and ignores suites and other events', async () => {
  const event = (type, name, ms, details = {}) => ({ type, data: { name, file: path.resolve('a.test.mjs'), details: { duration_ms: ms, ...details } } });
  async function* source() {
    yield event('test:pass', 'fast', 10);
    yield event('test:fail', 'slow failure', 3000);
    yield event('test:pass', 'whole suite', 9000, { type: 'suite' });
    yield event('test:start', 'not finished', 99999);
    yield event('test:pass', 'medium', 1500);
  }
  let output = '';
  for await (const chunk of slowestTests(source())) output += chunk;
  assert.equal(output, '\nSlowest 3 tests:\n    3.00 s  a.test.mjs > slow failure\n    1.50 s  a.test.mjs > medium\n    0.01 s  a.test.mjs > fast\n');
});
