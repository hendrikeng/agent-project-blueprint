#!/usr/bin/env node
// Project-owned. ci-candidate.yml runs this from the dispatch commit, not from the revision under test.
// It finds a green PR Full run of the exact tree of REVISION, so the candidate does not repeat it.
// It writes `run_id` to GITHUB_OUTPUT. An empty `run_id`, or any doubt or error, runs Full.
// Each miss reason goes to the job summary. The reasons never change the decision.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { classifyChanges } from './classify-change.mjs';

// Files that decide which checks run. A change to one of them needs a Full run under the new gates.
export const gateFile = (file) =>
  /^(?:\.github\/workflows\/|scripts\/ci\/)|^package\.json$|^docs\/governance\/project-gates\.json$|^scripts\/automation\/verify-(?:fast|full)\.mjs$/.test(file);

// The PR files API lists at most 3,000 files. A longer list can hide a gate file.
const fileLimit = 3000;

export function reusableFullRun({ repository, revision, tree, gateDrift, pulls, filesOf, runsOf, artifactsOf, jobsOf, reasons = [] }) {
  if (gateDrift.length > 0) {
    reasons.push(`gate files differ between ${revision} and this workflow: ${gateDrift.join(', ')}`);
    return null;
  }
  const pull = pulls.find((item) => item.merged_at && item.merge_commit_sha === revision && item.base?.ref === 'dev');
  if (!pull || pull.head?.repo?.full_name !== repository) {
    reasons.push(pull ? `PR #${pull.number} comes from another repository` : `no PR merged into dev has the merge commit ${revision}`);
    return null;
  }
  const files = filesOf(pull.number);
  if (files.length === 0 || files.length >= fileLimit) {
    reasons.push(`PR #${pull.number} lists ${files.length} files: no complete file list`);
    return null;
  }
  const paths = files.flatMap((file) => [file.filename, file.previous_filename].filter(Boolean));
  const scope = classifyChanges(files.map((file) => ({ status: file.status === 'added' ? 'A' : file.status === 'modified' ? 'M' : 'D', path: file.filename })));
  if (!['broad', 'harness', 'full'].includes(scope)) {
    reasons.push(`PR #${pull.number} has the ${scope} scope, so its PR run had no Full tier`);
    return null;
  }
  const gates = paths.filter(gateFile);
  if (gates.length > 0) {
    reasons.push(`PR #${pull.number} changes gate files: ${gates.join(', ')}`);
    return null;
  }
  const runs = runsOf(pull.head.sha);
  if (runs.length === 0) reasons.push(`PR #${pull.number} head ${pull.head.sha} has no CI run`);
  for (const run of runs) {
    if (run.path !== '.github/workflows/ci.yml' || run.event !== 'pull_request' || run.conclusion !== 'success' ||
        run.head_sha !== pull.head.sha || run.head_repository?.full_name !== repository) {
      reasons.push(`run ${run.id}: ${run.event} ${run.path} ended as ${run.conclusion}`);
      continue;
    }
    // ci.yml uploads this artifact only after verify:full passed on the tested merge tree.
    if (!artifactsOf(run.id).some((item) => item.name === `full-tree-${tree}` && !item.expired)) {
      reasons.push(`run ${run.id}: no current full-tree-${tree} artifact`);
      continue;
    }
    const jobs = jobsOf(run.id);
    const failed = ['Fast Gate', 'Full Gate'].filter((name) => jobs.find((job) => job.name === name)?.conclusion !== 'success');
    if (failed.length === 0) return run.id;
    reasons.push(`run ${run.id}: ${failed.join(', ')} did not succeed`);
  }
  return null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { GITHUB_REPOSITORY: repository, REVISION: revision } = process.env;
  const reasons = [];
  let runId = null;
  try {
    const api = (endpoint, jq) => execFileSync('gh', ['api', '--paginate', `repos/${repository}/${endpoint}`, '--jq', jq], { encoding: 'utf8' })
      .split('\n').filter(Boolean).map((line) => JSON.parse(line));
    const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
    runId = reusableFullRun({
      repository,
      revision,
      tree: git('rev-parse', `${revision}^{tree}`).trim(),
      // `-z` output: a path can contain a newline.
      gateDrift: git('diff', '--name-only', '-z', '--no-renames', revision, process.env.GITHUB_SHA ?? 'HEAD').split('\0').filter(Boolean).filter(gateFile),
      pulls: api(`commits/${revision}/pulls`, '.[] | tojson'),
      filesOf: (pull) => api(`pulls/${pull}/files?per_page=100`, '.[] | {filename, status, previous_filename} | tojson'),
      runsOf: (head) => api(`actions/workflows/ci.yml/runs?event=pull_request&head_sha=${head}&per_page=100`, '.workflow_runs[] | tojson'),
      artifactsOf: (run) => api(`actions/runs/${run}/artifacts?per_page=100`, '.artifacts[] | tojson'),
      jobsOf: (run) => api(`actions/runs/${run}/jobs?per_page=100`, '.jobs[] | tojson'),
      reasons
    });
  } catch (error) {
    reasons.push(`lookup failed: ${error instanceof Error ? error.message.split('\n')[0] : 'unknown error'}`);
  }
  appendFileSync(process.env.GITHUB_OUTPUT, `run_id=${runId ?? ''}\n`);
  console.log(runId ? `Reusing Full run ${runId} of this exact tree.` : 'No Full run of this exact tree. Running Full.');
  if (!runId && process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `No Full reuse for ${revision}:\n${reasons.map((reason) => `- ${reason}`).join('\n')}\n`);
  }
}
