import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { metadataValue, parseMetadata, parseMustLandChecklist } from "./lib/plan-metadata.mjs";

export const ACTIVE_PLAN_DIR = "docs/exec-plans/active/";
export const COMPLETED_PLAN_DIR = "docs/exec-plans/completed/";
export const EVIDENCE_INDEX_DIR = "docs/exec-plans/evidence-index/";
export const STANDARD_CHANGE_BRANCH_PREFIXES = ["fix/"];
export const HIGH_RISK_STANDARD_CHANGE_PREFIXES = [
  ".github/",
  "config/",
  "docs/agent-hardening/",
  "docs/architecture/",
  "docs/deploy/",
  "docs/env/",
  "docs/governance/",
  "docs/ops/releases/",
  "src/auth/",
  "src/security/",
  "src/payments/",
  "src/db/",
  "src/database/",
  "src/migrations/",
  "lib/auth/",
  "lib/security/",
  "lib/payments/",
  "lib/db/",
  "lib/database/",
  "migrations/",
  "scripts/agent-hardening/",
  "scripts/architecture/",
  "scripts/automation/",
  "scripts/docs/",
  "src/config/",
];

export const HIGH_RISK_STANDARD_CHANGE_SEGMENTS = [
  "/auth/",
  "/security/",
  "/identity/",
  "/tenancy/",
  "/payments/",
  "/billing/",
  "/db/",
  "/database/",
  "/persistence/",
  "/migrations/",
];

export const HIGH_RISK_STANDARD_CHANGE_FILES = [
  ".nvmrc",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "eslint.config.mjs",
  "prettier.config.mjs",
  "tsconfig.build.json",
  "tsconfig.json",
  "vitest.config.ts",
  "AGENTS.md",
  "ARCHITECTURE.md",
  "README.md",
  "docs/PLANS.md",
  "docs/SECURITY.md",
  "docs/product-specs/CURRENT-STATE.md",
];

const PLAN_SURFACE_DIRS = [
  "docs/future/",
  ACTIVE_PLAN_DIR,
  COMPLETED_PLAN_DIR,
  EVIDENCE_INDEX_DIR,
];

function isMarkdownPlanDoc(filePath) {
  return filePath.endsWith(".md") && path.basename(filePath) !== "README.md";
}

export function isActivePlanPath(filePath) {
  return filePath.startsWith(ACTIVE_PLAN_DIR) && !filePath.startsWith(`${ACTIVE_PLAN_DIR}evidence/`) && isMarkdownPlanDoc(filePath);
}

export function isCompletedPlanPath(filePath) {
  return filePath.startsWith(COMPLETED_PLAN_DIR) && isMarkdownPlanDoc(filePath);
}

export function isEvidenceIndexPath(filePath) {
  return filePath.startsWith(EVIDENCE_INDEX_DIR) && isMarkdownPlanDoc(filePath);
}

export function isPlanSurfacePath(filePath) {
  return PLAN_SURFACE_DIRS.some((prefix) => filePath.startsWith(prefix));
}

export function isStandardChangeBranch(branchName) {
  return STANDARD_CHANGE_BRANCH_PREFIXES.some((prefix) =>
    String(branchName ?? "").startsWith(prefix),
  );
}

export function isHighRiskStandardChangePath(filePath) {
  const rootedPath = `/${String(filePath).replaceAll("\\", "/")}`;
  return HIGH_RISK_STANDARD_CHANGE_FILES.includes(filePath)
    || HIGH_RISK_STANDARD_CHANGE_PREFIXES.some((prefix) => filePath.startsWith(prefix))
    || HIGH_RISK_STANDARD_CHANGE_SEGMENTS.some((segment) => rootedPath.includes(segment));
}

export function summarizePlanCloseoutDiff(changedFiles, { branchName = "" } = {}) {
  const normalizedFiles = changedFiles
    .map((filePath) => filePath.trim())
    .filter(Boolean);
  const implementationFiles = normalizedFiles.filter(
    (filePath) => !isPlanSurfacePath(filePath),
  );
  const standardChangeBranch = isStandardChangeBranch(branchName) || ['dev', 'main'].includes(branchName);
  const highRiskStandardChangeFiles = standardChangeBranch
    ? implementationFiles.filter(isHighRiskStandardChangePath)
    : [];

  return {
    touchesImplementation: implementationFiles.length > 0,
    requiresPlanCloseout: implementationFiles.length > 0 && (!standardChangeBranch || highRiskStandardChangeFiles.length > 0),
    standardChangeBranch,
    highRiskStandardChangeFiles,
    implementationFiles,
    activePlanFiles: normalizedFiles.filter(isActivePlanPath),
    completedPlanFiles: normalizedFiles.filter(isCompletedPlanPath),
    evidenceIndexFiles: normalizedFiles.filter(isEvidenceIndexPath),
  };
}

export function assertMergeReadyPlanCloseout(changedFiles, options = {}) {
  const summary = summarizePlanCloseoutDiff(changedFiles, options);

  if (summary.activePlanFiles.length > 0) {
    throw new Error(
      `merge-ready changes cannot leave plan docs in active/: ${summary.activePlanFiles.join(", ")}`,
    );
  }

  if (summary.requiresPlanCloseout && summary.completedPlanFiles.length === 0) {
    if (summary.highRiskStandardChangeFiles.length > 0) {
      throw new Error(
        `fix/* standard changes touching high-risk workflow, security, identity, payment, database, or governance paths require completed plan closeout: ${summary.highRiskStandardChangeFiles.join(", ")}`,
      );
    }
    throw new Error(
      "merge-ready non-trivial implementation changes must include a completed execution plan under docs/exec-plans/completed/",
    );
  }

  const readPlan = options.readPlan ?? ((file) => {
    const real = realpathSync(file);
    const relative = path.relative(realpathSync(process.cwd()), real);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error(`plan or Done-Evidence escapes repository root: ${file}`);
    }
    return readFileSync(real, "utf8");
  });
  const completedIds = new Set();
  for (const planFile of summary.completedPlanFiles) {
    const content = readPlan(planFile);
    const metadata = parseMetadata(content);
    const checklist = parseMustLandChecklist(content);
    const id = metadataValue(metadata, 'Plan-ID');
    if (!id || metadataValue(metadata, 'Status') !== 'completed' ||
        checklist.length === 0 || checklist.some((item) => !item.checked || !item.id) ||
        !['approved', 'not-required'].includes(metadataValue(metadata, 'Security-Approval'))) {
      throw new Error(`changed completed plan needs completed status, checked must-land IDs, and resolved required approval: ${planFile}`);
    }
    const evidence = metadataValue(metadata, 'Done-Evidence').replace(/^`|`$/g, '');
    if (!isEvidenceIndexPath(evidence) || path.posix.normalize(evidence) !== evidence ||
        !summary.evidenceIndexFiles.includes(evidence) || !(options.readEvidence ?? readPlan)(evidence).trim()) {
      throw new Error(`completed plan must name its nonempty changed Done-Evidence index: ${planFile}`);
    }
    completedIds.add(id);
  }
  for (const file of options.removedActivePlanFiles ?? []) {
    const id = metadataValue(parseMetadata(options.readBaseline(file)), 'Plan-ID');
    if (!id || !completedIds.has(id)) throw new Error(`removed active plan requires matching completed Plan-ID and evidence: ${file}`);
  }
  return summary;
}

export function assertProtectedBranchHasNoActivePlans(activePlanFiles, branchName, inherited = null) {
  const rejected = activePlanFiles.filter((file) => {
    if (!inherited) return true;
    const baseline = inherited.readBaseline(file);
    return !baseline || [inherited.readWorktree(file), inherited.readIndex(file)]
      .some((value) => value === null || !baseline.equals(value));
  });
  if (rejected.length) throw new Error(`${branchName} cannot retain new or changed active execution plans: ${rejected.join(', ')}`);
}

export function changedFilesFromNameStatus(output) {
  const text = String(output ?? '');
  const tokens = text.includes('\0') ? text.split('\0') : text.split('\n').filter(Boolean).flatMap(line => line.split('\t'));
  const changed = [];
  for (let index = 0; index < tokens.length;) {
    const status = tokens[index++];
    if (!status) continue;
    const first = tokens[index++];
    const renamed = /^[RC]/.test(status);
    if (first && !((status === 'D' || renamed) && isActivePlanPath(first)) &&
        !(renamed && isCompletedPlanPath(first))) changed.push(first);
    if (renamed) {
      const destination = tokens[index++];
      if (destination) changed.push(destination);
    }
  }
  return [...new Set(changed)];
}

export function isCandidateDispatch(head, env, event) {
  const trustedRef = `refs/heads/${event?.repository?.default_branch}`;
  return env.GITHUB_ACTIONS === 'true' && env.GITHUB_EVENT_NAME === 'workflow_dispatch' &&
    /^[a-f0-9]{40}$/.test(head) && event?.inputs?.revision === head &&
    Boolean(event?.repository?.default_branch) && event?.repository?.full_name === env.GITHUB_REPOSITORY &&
    env.GITHUB_REF === trustedRef && event?.ref === trustedRef &&
    (!env.PLAN_CLOSEOUT_BRANCH_NAME || env.PLAN_CLOSEOUT_BRANCH_NAME.replace(/^refs\/heads\//, '') === 'dev') &&
    env.GITHUB_WORKFLOW_REF === `${env.GITHUB_REPOSITORY}/.github/workflows/ci-candidate.yml@${trustedRef}`;
}

export function resolveCloseoutBranch(actualBranch, head, env, event = null) {
  if (actualBranch && env.GITHUB_ACTIONS !== 'true') return actualBranch;
  // The caller also proves origin/dev ancestry before accepting this selected checkout.
  if (!actualBranch && isCandidateDispatch(head, env, event)) return 'dev';
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_SHA !== head) {
    throw new Error('Detached closeout requires GitHub event context matching the checked-out commit.');
  }
  let branch;
  if (env.GITHUB_EVENT_NAME === 'pull_request' && env.GITHUB_REF === `refs/pull/${event?.number}/merge` &&
      event?.pull_request?.merge_commit_sha === head) {
    branch = event.pull_request.base?.ref;
  } else if (env.GITHUB_EVENT_NAME === 'push' && event?.after === head && event?.ref === env.GITHUB_REF) {
    branch = event.ref.startsWith('refs/heads/') ? event.ref.slice('refs/heads/'.length) : null;
  } else if (env.GITHUB_EVENT_NAME === 'merge_group' && event?.merge_group?.head_sha === head &&
      event.merge_group.head_ref === env.GITHUB_REF) {
    const ref = event.merge_group.base_ref;
    branch = ref?.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : null;
  } else if (env.GITHUB_EVENT_NAME === 'workflow_dispatch' && event?.ref === env.GITHUB_REF) {
    branch = event.ref.startsWith('refs/heads/') ? event.ref.slice('refs/heads/'.length) : null;
  }
  const checkoutBranch = env.GITHUB_EVENT_NAME === 'merge_group'
    ? event?.merge_group?.head_ref?.replace(/^refs\/heads\//, '') : branch;
  if (!branch || (actualBranch && actualBranch !== checkoutBranch) || (env.PLAN_CLOSEOUT_BRANCH_NAME && env.PLAN_CLOSEOUT_BRANCH_NAME.replace(/^refs\/heads\//, '') !== branch)) {
    throw new Error('Detached closeout branch does not match verified GitHub event context.');
  }
  return branch;
}

export function isLocalFeatureIteration(actualBranch, env, mergeHeads) {
  return Boolean(actualBranch) && !['dev', 'main'].includes(actualBranch) &&
    !env.PLAN_CLOSEOUT_BASE_REF && env.GITHUB_ACTIONS !== 'true' && mergeHeads.length === 0;
}

export function resolveCloseoutBase({ head, parents, mergeHeads, event = null, eventName, explicitBase }) {
  if (mergeHeads.length > 1) throw new Error('Ambiguous closeout baseline: multiple pending merge heads.');
  const base = explicitBase || (mergeHeads.length ? head :
    eventName === 'pull_request' ? event?.pull_request?.base?.sha :
    eventName === 'merge_group' ? event?.merge_group?.base_sha :
    eventName === 'push' ? event?.before : parents[0]);
  if (!base || /^0+$/.test(base)) throw new Error('Missing closeout baseline; provide the real pre-change commit.');
  return base;
}
