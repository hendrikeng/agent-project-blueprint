#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveSafeRepoPath, assertNoRepoSymlinks } from '../automation/lib/repo-paths.mjs';
import { computeEvalInputSha256, evalInputPaths } from './eval-input-hash.mjs';

const rootDir = process.cwd();
const configPath = path.join(rootDir, 'docs', 'agent-hardening', 'evals.config.json');
const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
const reportPath = resolveSafeRepoPath(rootDir, config.reportPath, 'Eval report path');
await assertNoRepoSymlinks(rootDir, reportPath.rel);
const report = JSON.parse(await fs.readFile(reportPath.abs, 'utf8'));
const inputPaths = evalInputPaths(config);
const inputSha256 = await computeEvalInputSha256(rootDir, config);
if (report.inputSha256 !== inputSha256) {
  report.status = 'not-run';
  report.runtime = { ...config.runtime };
  report.summary = { total: 0, passed: 0, failed: 0, passRate: 0 };
  report.suites = (config.requiredSuites ?? []).map((suite) => ({
    id: typeof suite === 'string' ? suite : suite.id,
    status: 'not-run', total: 0, passed: 0, failed: 0
  }));
  report.evidence = [];
}
report.inputSha256 = inputSha256;
await fs.writeFile(reportPath.abs, `${JSON.stringify(report, null, 2)}\n`);
console.log(`[eval-refresh] wrote ${config.reportPath} from ${inputPaths.length} content-addressed input(s). No evaluations were run; changed inputs invalidate previous results.`);
