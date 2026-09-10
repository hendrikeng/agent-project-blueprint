import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import {
  ACTIVE_PLAN_DIR,
  assertMergeReadyPlanCloseout,
  assertProtectedBranchHasNoActivePlans,
  changedFilesFromNameStatus,
  isActivePlanPath,
  isCandidateDispatch,
  isLocalFeatureIteration,
  resolveCloseoutBase,
  resolveCloseoutBranch,
} from './plan-closeout-lib.mjs';

const root = process.cwd();
function gitBytes(args, { allowFailure = false } = {}) {
  try {
    return execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    if (allowFailure && error.status !== 126) return null;
    throw error;
  }
}
function gitOutput(args, options) {
  return gitBytes(args, options)?.toString('utf8').trim() ?? null;
}

try {
  if (gitOutput(['rev-parse', '--is-inside-work-tree'], { allowFailure: true }) !== 'true') {
    console.log('plans:verify:closeout skipped because this directory is not a git repository.');
    process.exit(0);
  }
  const actualBranch = gitOutput(['branch', '--show-current']);
  const [head, ...parents] = gitOutput(['rev-list', '--parents', '-n', '1', 'HEAD']).split(/\s+/);
  const event = (process.env.GITHUB_ACTIONS === 'true' || !actualBranch) && process.env.GITHUB_EVENT_PATH
    ? JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')) : null;
  if (isCandidateDispatch(head, process.env, event)) {
    gitBytes(['merge-base', '--is-ancestor', head, 'origin/dev']);
  }
  const branchName = resolveCloseoutBranch(actualBranch, head, process.env, event);
  const changeBranchName = event && process.env.GITHUB_EVENT_NAME === 'pull_request'
    ? event.pull_request.head?.ref || branchName : branchName;
  const mergeHeadPath = gitOutput(['rev-parse', '--git-path', 'MERGE_HEAD']);
  const mergeHeads = (existsSync(mergeHeadPath) ? readFileSync(mergeHeadPath, 'utf8') : '').trim().split(/\s+/).filter(Boolean);
  if (isLocalFeatureIteration(actualBranch, process.env, mergeHeads)) {
    console.log('plans:verify:closeout skipped during local feature iteration; CI or an explicit baseline checks delivery.');
    process.exit(0);
  }
  const requestedBase = resolveCloseoutBase({ head, parents, mergeHeads, event,
    eventName: event ? process.env.GITHUB_EVENT_NAME : null,
    explicitBase: process.env.PLAN_CLOSEOUT_BASE_REF });
  const base = gitOutput(['rev-parse', '--verify', `${requestedBase}^{commit}`]);
  if (event) {
    const eventBase = resolveCloseoutBase({ head, parents, mergeHeads, event, eventName: process.env.GITHUB_EVENT_NAME });
    if (base !== gitOutput(['rev-parse', '--verify', `${eventBase}^{commit}`])) {
      throw new Error('Explicit closeout baseline conflicts with the verified CI event.');
    }
  }
  const ancestors = gitOutput(['rev-list', head]).split('\n');
  if (!ancestors.includes(base) || (base === head && mergeHeads.length === 0)) {
    throw new Error('Closeout baseline must be a real pre-change ancestor, not an empty HEAD comparison.');
  }
  const baselineActive = gitOutput(['ls-tree', '-r', '--name-only', '-z', base, '--', ACTIVE_PLAN_DIR])
    .split('\0').filter(isActivePlanPath);
  const indexedActive = gitOutput(['ls-files', '-z', '--', ACTIVE_PLAN_DIR]).split('\0').filter(isActivePlanPath);
  const worktreeActive = readdirSync(ACTIVE_PLAN_DIR, { recursive: true })
    .map(name => `${ACTIVE_PLAN_DIR}${name.replaceAll('\\', '/')}`).filter(file => isActivePlanPath(file) && statSync(file).isFile());
  const readBaseline = file => gitBytes(['show', `${base}:${file}`], { allowFailure: true });
  const readIndex = file => gitBytes(['show', `:${file}`], { allowFailure: true });
  const readWorktree = file => existsSync(file) ? readFileSync(file) : null;
  if (['dev', 'main'].includes(branchName)) {
    assertProtectedBranchHasNoActivePlans([...new Set([...worktreeActive, ...indexedActive])], branchName,
      { readBaseline, readIndex, readWorktree });
  }
  const indexedChanges = changedFilesFromNameStatus(gitOutput(['diff', '--cached', '--name-status', base, '-z']));
  const changedFiles = [...new Set([
    ...changedFilesFromNameStatus(gitOutput(['diff', '--name-status', base, '-z'])),
    ...indexedChanges,
    ...changedFilesFromNameStatus(gitOutput(['diff', '--name-status', '-z'])),
    ...gitOutput(['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean),
  ])];
  assertMergeReadyPlanCloseout(changedFiles, { branchName: changeBranchName,
    removedActivePlanFiles: baselineActive.filter(file => readWorktree(file) === null),
    readBaseline: file => readBaseline(file).toString('utf8') });
  const readIndexedFile = file => {
    const entry = gitOutput(['ls-files', '--stage', '--', file]);
    if (!/^100(?:644|755) [a-f0-9]+ 0\t/.test(entry)) throw new Error(`Closeout requires a regular staged file: ${file}`);
    return readIndex(file).toString('utf8');
  };
  assertMergeReadyPlanCloseout(indexedChanges, { branchName: changeBranchName,
    readPlan: readIndexedFile, readEvidence: readIndexedFile,
    removedActivePlanFiles: baselineActive.filter(file => readIndex(file) === null),
    readBaseline: file => readBaseline(file).toString('utf8') });
  console.log(`plans:verify:closeout passed (baseline=${base}).`);
} catch (error) {
  console.error(`plans:verify:closeout failed: ${error.message}`);
  process.exit(1);
}
