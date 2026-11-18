import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fullModeProblems, lightModeEnv, lightModeTests, runFullMode } from './full-mode-proof.mjs';

const tests = [{ file: 'tests/load.test.mjs', name: 'holds the lock under load' }, { file: 'tests/sweep.test.mjs', name: 'reverses each value' }];
const files = { 'holds the lock under load': 'tests/load.test.mjs', 'reverses each value': 'tests/sweep.test.mjs' };
const testcase = (name, body = '', source = `classname="${files[name] ?? 'tests/other.test.mjs'}"`) => `<testcase name="${name}" ${source} time="1"${body ? `>${body}</testcase>` : '/>'}`;
const report = (...cases) => `<?xml version="1.0"?><testsuites><testsuite name="s">${cases.join('')}</testsuite></testsuites>`;
const passing = report(testcase('holds the lock under load'), testcase('reverses each value'), testcase('other'));

test('a report where each declared test passed once proves the full mode', () => {
  assert.deepEqual(fullModeProblems(passing, tests), []);
  // Names are XML-escaped. node:test names the file in `file`, pytest in a dotted `classname`.
  assert.deepEqual(fullModeProblems(report(testcase('a &lt;b&gt; &amp; &#99; &#x110000; &constructor;', '', 'classname="x"')), [{ file: 'x', name: 'a <b> & c &#x110000; &constructor;' }]), []);
  assert.deepEqual(fullModeProblems(report(testcase('holds the lock under load', '<system-out><![CDATA[<skipped/> <failure/>]]></system-out>'), testcase('reverses each value')), tests), []);
  assert.deepEqual(fullModeProblems(report(testcase('t', '', 'classname="t" file="/w/tests/load.test.mjs"')), [{ file: 'tests/load.test.mjs', name: 't' }]), []);
  assert.deepEqual(fullModeProblems(report(testcase('t', '', 'classname="tests.test_load.TestLock"')), [{ file: 'tests/test_load.py', name: 't' }]), []);
  // Two declared files can share a test name.
  assert.deepEqual(fullModeProblems(report(testcase('t', '', 'classname="a/x.test.ts"'), testcase('t', '', 'classname="a/y.test.ts"')), [{ file: 'a/x.test.ts', name: 't' }, { file: 'a/y.test.ts', name: 't' }]), []);
});

test('a skipped, failed, missing, or repeated test, or any other failure, proves nothing', () => {
  for (const [name, xml, problem] of [
    ['skipped', report(testcase('holds the lock under load', '<skipped/>'), testcase('reverses each value')), /load.test.mjs did not pass/],
    ['failed', report(testcase('holds the lock under load', '<failure message="x"/>'), testcase('reverses each value')), /1 test\(s\) failed/],
    ['error', report(testcase('holds the lock under load'), testcase('reverses each value', '<error/>')), /sweep.test.mjs did not pass/],
    ['missing', report(testcase('holds the lock under load')), /sweep.test.mjs did not pass/],
    ['same name in another file', report(testcase('holds the lock under load', '', 'classname="tests/overload.test.mjs"'), testcase('reverses each value')), /load.test.mjs did not pass/],
    ['same name in another directory', report(testcase('holds the lock under load', '', 'classname="tests/integration/load.test.mjs"'), testcase('reverses each value')), /load.test.mjs did not pass/],
    ['same name in another pytest module', report(testcase('holds the lock under load', '', 'classname="tests.test_load_extra"'), testcase('reverses each value')), /load.test.mjs did not pass/],
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
  const declared = [{ file: 'other.test.mjs', name: 'full' }];
  assert.deepEqual(runFullMode({ tests: declared, command: write(report(testcase('MODE'))), env }), []);
  assert.match(runFullMode({ tests: declared, command: 'exit 0', env }).join('\n'), /wrote no report/);
  assert.match(runFullMode({ tests: declared, command: `${write(report(testcase('MODE')))} && exit 3`, env }).join('\n'), /ended with 3/);
  assert.match(runFullMode({ tests: declared, command: '', env }).join('\n'), /fullModeCommand is empty/);
  assert.match(runFullMode({ tests: declared, command: `${write(report(testcase('MODE')))} && sleep 5`, env, timeout: 300 }).join('\n'), /ended with SIGTERM/);
  assert.deepEqual(runFullMode({ tests: [], command: 'exit 1', env }), []);
});

// An undeclared reader would let a candidate accept a PR Full run that used only its light mode.
test('every file that reads the light mode is declared', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  // Tracked and unignored files. Outside Git, for example in a fixture copy, walk the tree.
  const grep = spawnSync('git', ['grep', '-lzF', '--untracked', '--exclude-standard', lightModeEnv], { cwd: root, encoding: 'utf8' });
  const walk = (directory) => readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const file = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) return ['.git', 'node_modules'].includes(entry.name) ? [] : walk(file);
    return entry.isFile() && readFileSync(path.join(root, file)).includes(lightModeEnv) ? [file] : [];
  });
  // git grep exits 1 when no file matches.
  const matches = grep.status === 0 || grep.status === 1 ? grep.stdout.split('\0').filter(Boolean) : walk('');
  // Only ci.yml sets the variable. ci-candidate.yml names it in a comment. This script checks it, and docs describe it.
  const readers = matches.filter((file) => !/^docs\/|^\.github\/workflows\/ci(?:-candidate)?\.yml$|^scripts\/ci\/full-mode-proof\.(?:test\.)?mjs$|\.md$/.test(file));
  const code = (file) => readFileSync(path.join(root, file), 'utf8').split('\n').filter((line) => line.includes(lightModeEnv) && !/^\s*#/.test(line));
  assert.deepEqual(code('.github/workflows/ci.yml').map((line) => line.trim().split(':')[0]), [lightModeEnv]);
  assert.deepEqual(code('.github/workflows/ci-candidate.yml'), []);
  assert.deepEqual(readers.sort(), [...new Set(lightModeTests.map((item) => item.file))].sort());
});
