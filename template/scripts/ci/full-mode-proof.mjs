#!/usr/bin/env node
// Project-owned. Light test mode: a test whose full mode is expensive can read CI_LIGHT_MODE.
// Only ci.yml sets it to 'true', for PRs whose base is not main. Treat any other value as full mode.
// ci-candidate.yml runs this script when it reuses a PR Full run, because that run used the light mode.
// It runs only the declared tests in full mode and fails unless each one passed once and no test failed.
// With no declared test, it does nothing. See docs/ops/automation/INTEROP_GITHUB.md#light-test-mode.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const lightModeEnv = 'CI_LIGHT_MODE';

// One entry for each test that reads CI_LIGHT_MODE: { file, name }, where `name` is its JUnit testcase name.
export const lightModeTests = [];

// Runs only the files above in full mode and writes a JUnit XML report to "$FULL_MODE_REPORT".
// Example: 'npx vitest run --reporter=junit --outputFile="$FULL_MODE_REPORT" tests/load.test.ts'
export const fullModeCommand = '';

const entities = { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' };
const unescape = (value) => value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (token, code) =>
  code[0] !== '#' ? entities[code] ?? token : String.fromCodePoint(Number(code[1].toLowerCase() === 'x' ? `0${code.slice(1)}` : code.slice(1))));

export function junitCases(xml) {
  return [...xml.matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)].map(([, attributes, body = '']) => ({
    name: unescape(attributes.match(/\sname="([^"]*)"/)?.[1] ?? ''),
    status: /<(?:failure|error)\b/.test(body) ? 'failed' : /<skipped\b/.test(body) ? 'skipped' : 'passed'
  }));
}

export function fullModeProblems(xml, tests = lightModeTests) {
  const cases = junitCases(xml);
  const problems = [];
  const failed = cases.filter((item) => item.status === 'failed').length;
  if (failed > 0) problems.push(`${failed} test(s) failed`);
  for (const { file, name } of tests) {
    const found = cases.filter((item) => item.name === name);
    if (found.length !== 1 || found[0].status !== 'passed') problems.push(`${file} did not pass "${name}" once`);
  }
  return problems;
}

export function runFullMode({ tests = lightModeTests, command = fullModeCommand, env = process.env } = {}) {
  if (tests.length === 0) return [];
  if (!command.trim()) return ['fullModeCommand is empty'];
  const directory = mkdtempSync(path.join(tmpdir(), 'full-mode-'));
  try {
    const report = path.join(directory, 'report.xml');
    const { [lightModeEnv]: _light, ...fullEnv } = env;
    const result = spawnSync(command, { shell: true, stdio: 'inherit', env: { ...fullEnv, FULL_MODE_REPORT: report } });
    let xml = null;
    try {
      xml = readFileSync(report, 'utf8');
    } catch {
      // A crash or timeout leaves no report, and that fails the proof below.
    }
    return [
      ...(result.status === 0 ? [] : [`the command ended with ${result.status ?? result.signal ?? result.error?.message}`]),
      ...(xml === null ? ['the command wrote no report'] : fullModeProblems(xml, tests))
    ];
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (lightModeTests.length === 0) {
    console.log('No test declares a light mode. Nothing to run.');
  } else {
    const problems = runFullMode();
    for (const problem of problems) console.error(`No full-mode proof: ${problem}.`);
    if (problems.length > 0) process.exit(1);
    console.log('Each light-mode test passed in full mode.');
  }
}
