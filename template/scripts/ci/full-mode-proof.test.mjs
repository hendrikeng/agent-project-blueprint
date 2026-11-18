import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fullModeProblems, lightModeEnv, lightModeTests, runFullMode } from './full-mode-proof.mjs';

const tests = [{ file: 'tests/load.test.mjs', name: 'holds the lock under load' }, { file: 'tests/sweep.test.mjs', name: 'reverses each value' }];
const testcase = (name, body = '') => `<testcase name="${name}" classname="t" time="1"${body ? `>${body}</testcase>` : '/>'}`;
const report = (...cases) => `<?xml version="1.0"?><testsuites><testsuite name="s">${cases.join('')}</testsuite></testsuites>`;
const passing = report(testcase('holds the lock under load'), testcase('reverses each value'), testcase('other'));

test('a report where each declared test passed once proves the full mode', () => {
  assert.deepEqual(fullModeProblems(passing, tests), []);
  // Names are XML-escaped in reports.
  assert.deepEqual(fullModeProblems(report(testcase('a &lt;b&gt; &amp; &#99;')), [{ file: 'x', name: 'a <b> & c' }]), []);
});

test('a skipped, failed, missing, or repeated test, or any other failure, proves nothing', () => {
  for (const [name, xml, problem] of [
    ['skipped', report(testcase('holds the lock under load', '<skipped/>'), testcase('reverses each value')), /load.test.mjs did not pass/],
    ['failed', report(testcase('holds the lock under load', '<failure message="x"/>'), testcase('reverses each value')), /1 test\(s\) failed/],
    ['error', report(testcase('holds the lock under load'), testcase('reverses each value', '<error/>')), /sweep.test.mjs did not pass/],
    ['missing', report(testcase('holds the lock under load')), /sweep.test.mjs did not pass/],
    ['repeated', report(testcase('holds the lock under load'), testcase('holds the lock under load'), testcase('reverses each value')), /load.test.mjs did not pass/],
    ['other test failed', report(testcase('holds the lock under load'), testcase('reverses each value'), testcase('other', '<failure/>')), /1 test\(s\) failed/],
    ['empty report', '', /did not pass/]
  ]) {
    assert.match(fullModeProblems(xml, tests).join('\n'), problem, name);
  }
});

test('the run removes the light mode and fails without a passing report', () => {
  const write = (body) => `node -e 'require("fs").writeFileSync(process.env.FULL_MODE_REPORT, ${JSON.stringify(body)}.replace("MODE", process.env.${lightModeEnv} ?? "full"))'`;
  const env = { ...process.env, [lightModeEnv]: 'true' };
  const declared = [{ file: 'tests/load.test.mjs', name: 'full' }];
  assert.deepEqual(runFullMode({ tests: declared, command: write(report(testcase('MODE'))), env }), []);
  assert.match(runFullMode({ tests: declared, command: 'exit 0', env }).join('\n'), /wrote no report/);
  assert.match(runFullMode({ tests: declared, command: `${write(report(testcase('MODE')))} && exit 3`, env }).join('\n'), /ended with 3/);
  assert.match(runFullMode({ tests: declared, command: '', env }).join('\n'), /fullModeCommand is empty/);
  assert.deepEqual(runFullMode({ tests: [], command: 'exit 1', env }), []);
});

// An undeclared reader would let a candidate accept a PR Full run that used only its light mode.
test('every file that reads the light mode is declared', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const readers = [];
  const walk = (directory) => {
    for (const entry of readdirSync(path.join(root, directory), { withFileTypes: true })) {
      const file = path.posix.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules' && !['docs', 'scripts/ci'].includes(file)) walk(file);
      } else if (entry.isFile() && !file.endsWith('.md') && readFileSync(path.join(root, file), 'utf8').includes(lightModeEnv)) {
        readers.push(file);
      }
    }
  };
  walk('');
  assert.deepEqual(readers.sort(), [...new Set(lightModeTests.map((item) => item.file))].sort());
});
