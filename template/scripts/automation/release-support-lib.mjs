import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

const RELEASE_TAG_REGEX = /^v\d{4}\.\d{2}\.\d{2}\.\d+$/;
const RELEASE_BRANCH_REGEX = /^release\/\d{4}\.\d{2}\.\d{2}\.\d+$/;
const PLAN_ID_REGEX = /Plan-ID:\s*`?([a-z0-9]+(?:-[a-z0-9]+)*)`?/g;
const RELEASE_MAPPING_FILE = "docs/ops/releases/release-mapping.md";
const STANDARD_CHANGE_MAPPING_REGEX = /^-\s+Commit:\s+`([a-f0-9]{12,40})`\s+\|\s+Type:\s+`standard-change`\s+\|\s+Rationale:\s+(.+)$/gm;
const PLAN_COMMIT_MAPPING_REGEX = /^-\s+Commit:\s+`([a-f0-9]{12,40})`\s+\|\s+Plan-ID:\s+`([a-z0-9]+(?:-[a-z0-9]+)*)`\s+\|\s+Rationale:\s+(.+)$/gm;

export const root = process.cwd();

export function isValidReleaseVersion(value) {
  const match = String(value ?? "").match(/^(\d{4})\.(\d{2})\.(\d{2})\.([1-9]\d*)$/);
  if (!match) return false;
  const [, year, month, day] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === `${year}-${month}-${day}`;
}

function git(args, { trim = true } = {}) {
  const output = execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return trim ? output.trim() : output;
}

function gitMaybe(args) {
  try {
    return git(args);
  } catch {
    return "";
  }
}

function splitLines(value) {
  return value ? value.split("\n").filter(Boolean) : [];
}

function fileAtRef(ref, filePath) {
  try {
    return git(["show", `${ref}:${filePath}`], { trim: false });
  } catch {
    return "";
  }
}

export function metadataValue(content, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(new RegExp(`^(?:-\\s+)?${escaped}:\\s*(.+)$`, "m"));
  return match ? match[1].trim().replace(/^`|`$/g, "") : "";
}

function extractPlanIds(content) {
  const ids = new Set();
  for (const match of content.matchAll(PLAN_ID_REGEX)) {
    ids.add(match[1]);
  }
  return [...ids];
}

function extractEvidenceBullets(content) {
  const match = content.match(/^## Evidence Summary\n([\s\S]*?)(?=^##\s|$)/m);
  if (!match) return [];
  return match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.replace(/^- /, ""));
}

export function parseReleaseCommitMappings(content) {
  const mappings = [];
  for (const match of content.matchAll(PLAN_COMMIT_MAPPING_REGEX)) {
    mappings.push({
      hash: match[1],
      planId: match[2],
      rationale: match[3].trim(),
      type: "plan",
    });
  }
  for (const match of content.matchAll(STANDARD_CHANGE_MAPPING_REGEX)) {
    mappings.push({
      hash: match[1],
      rationale: match[2].trim(),
      type: "standard-change",
    });
  }
  return mappings;
}

export function parseStandardChangeMappings(content) {
  return parseReleaseCommitMappings(content).filter((mapping) => mapping.type === "standard-change");
}

function releaseCommitMappings(head) {
  const content = fileAtRef(head, RELEASE_MAPPING_FILE);
  return content ? parseReleaseCommitMappings(content) : [];
}

function findCommitMapping(mappings, hash) {
  return mappings.find((mapping) => hash.startsWith(mapping.hash));
}

function listMarkdownFiles(directory) {
  const fullDir = path.join(root, directory);
  if (!existsSync(fullDir)) return [];

  return readdirSync(fullDir)
    .filter((entry) => entry.endsWith(".md") && entry !== "README.md")
    .map((entry) => path.join(directory, entry))
    .filter((relativePath) => statSync(path.join(root, relativePath)).isFile())
    .sort();
}

function currentBranch() {
  return process.env.GITHUB_HEAD_REF || gitMaybe(["branch", "--show-current"]);
}

function latestReleaseTag() {
  const output = gitMaybe(["tag", "--list", "v[0-9]*", "--sort=-version:refname"]);
  return splitLines(output).find((tag) => RELEASE_TAG_REGEX.test(tag) && isValidReleaseVersion(tag.slice(1))) ?? "";
}

function refExists(ref) {
  return Boolean(gitMaybe(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]));
}

export function releaseSourceBoundary(base, hasRef = refExists) {
  const sourceTag = RELEASE_TAG_REGEX.test(base) ? `source-${base}` : "";
  return sourceTag && hasRef(sourceTag) ? sourceTag : base;
}

function parseArgs(argv) {
  const options = {
    allowAnyBranch: false,
    base: process.env.RELEASE_BASE_REF || "",
    head: process.env.RELEASE_HEAD_REF || "HEAD",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--allow-any-branch") {
      options.allowAnyBranch = true;
    } else if (arg === "--base") {
      options.base = argv[index + 1] ?? "";
      index += 1;
    } else if (arg.startsWith("--base=")) {
      options.base = arg.slice("--base=".length);
    } else if (arg === "--head") {
      options.head = argv[index + 1] ?? "";
      index += 1;
    } else if (arg.startsWith("--head=")) {
      options.head = arg.slice("--head=".length);
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.base) {
    options.base = latestReleaseTag() || (refExists("origin/main") ? "origin/main" : "");
  }

  return options;
}

function changedFiles(base, head) {
  return splitLines(git(["diff", "--name-only", `${base}..${head}`]));
}

function commitHashes(base, head) {
  return splitLines(git(["rev-list", "--reverse", `${base}..${head}`]));
}

function commitDetails(hash) {
  const message = git(["show", "-s", "--format=%B", hash], { trim: false });
  const files = splitLines(git(["diff-tree", "--no-commit-id", "--name-only", "-r", hash]));
  return { hash, message, files };
}

function buildPlanFromFile(head, filePath) {
  const content = fileAtRef(head, filePath);
  const planId = metadataValue(content, "Plan-ID");
  const doneEvidence = metadataValue(content, "Done-Evidence");
  const title = content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? planId;
  return {
    filePath,
    content,
    planId,
    title,
    doneEvidence,
    riskTier: metadataValue(content, "Risk-Tier"),
    deliveryClass: metadataValue(content, "Delivery-Class"),
    validationLanes: metadataValue(content, "Validation-Lanes"),
  };
}

function migrationFiles(files) {
  return files.filter((file) => (
    file.startsWith("migrations/") ||
    file.startsWith("db/migrations/") ||
    file.startsWith("lib/db/migrations/") ||
    file.startsWith("src/db/migrations/") ||
    file.includes("/migrations/")
  ));
}

function configFiles(files) {
  return files.filter((file) => (
    file.startsWith(".github/workflows/") ||
    file === "package.json" ||
    file.endsWith(".config.js") ||
    file.endsWith(".config.mjs") ||
    file.endsWith(".config.ts") ||
    file.endsWith(".config.json")
  ));
}

function isDocumentationOnly(files) {
  return files.length > 0 && files.every((file) => (
    file.endsWith(".md") ||
    file === ".github/pull_request_template.md"
  ));
}

function treeFiles(ref, directory) {
  const output = gitMaybe(["ls-tree", "-r", "--name-only", ref, directory]);
  return splitLines(output)
    .filter((filePath) => filePath.endsWith(".md") && !filePath.endsWith("/README.md"))
    .sort();
}

function activePlanIds(head) {
  const result = new Map();
  const files = head ? treeFiles(head, "docs/exec-plans/active") : listMarkdownFiles("docs/exec-plans/active");

  for (const filePath of files) {
    const content = head ? fileAtRef(head, filePath) : readFileSync(path.join(root, filePath), "utf8");
    const planId = metadataValue(content, "Plan-ID");
    if (planId) result.set(planId, filePath);
  }
  return result;
}

export function analyzeReleaseRange(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);

  if (options.help) {
    return { options, help: true };
  }

  const findings = [];
  const warnings = [];
  const branch = currentBranch();
  const requestedBase = options.base;
  const base = releaseSourceBoundary(requestedBase);
  const head = options.head || "HEAD";

  if (!requestedBase) {
    findings.push("No release base ref, release tag, or origin/main is available.");
  } else if (!refExists(requestedBase)) {
    findings.push(`Release base ref does not exist: ${requestedBase}`);
  } else if (!refExists(base)) {
    findings.push(`Release source boundary does not exist: ${base}`);
  }

  if (!head || !refExists(head)) {
    findings.push(`Release head ref does not exist: ${head}`);
  }

  if (!options.allowAnyBranch && branch &&
      (!RELEASE_BRANCH_REGEX.test(branch) || !isValidReleaseVersion(branch.slice('release/'.length)))) {
    findings.push(
      `release:verify must run on release/YYYY.MM.DD.N branches; current branch is ${branch}. Use --allow-any-branch only for local dry runs.`,
    );
  }

  if (findings.length > 0) {
    return {
      options,
      branch,
      base,
      head,
      findings,
      warnings,
      plans: [],
      files: [],
      commits: [],
      migrationFiles: [],
      configFiles: [],
      mappedStandardChanges: [],
    };
  }

  const files = changedFiles(base, head);
  const commits = commitHashes(base, head).map(commitDetails);
  const completedPlanFiles = files.filter((file) => (
    file.startsWith("docs/exec-plans/completed/") &&
    file.endsWith(".md") &&
    !file.endsWith("/README.md")
  ));
  const releaseCommitMappingsForHead = releaseCommitMappings(head);
  const mappedStandardChanges = [];

  const plans = completedPlanFiles
    .map((filePath) => buildPlanFromFile(head, filePath))
    .filter((plan) => plan.planId);

  const plansById = new Map(plans.map((plan) => [plan.planId, plan]));
  const activeIds = activePlanIds(head);

  for (const filePath of completedPlanFiles) {
    const plan = buildPlanFromFile(head, filePath);
    if (!plan.planId) {
      findings.push(`Completed plan is missing Plan-ID: ${filePath}`);
      continue;
    }

    if (!plan.doneEvidence || plan.doneEvidence.toLowerCase() === "pending") {
      findings.push(`Completed plan ${plan.planId} is missing Done-Evidence.`);
    } else if (!plan.doneEvidence.startsWith("docs/exec-plans/evidence-index/")) {
      findings.push(`Completed plan ${plan.planId} has Done-Evidence outside the evidence index: ${plan.doneEvidence}`);
    } else if (!fileAtRef(head, plan.doneEvidence)) {
      findings.push(`Completed plan ${plan.planId} points to missing evidence: ${plan.doneEvidence}`);
    }

    if (activeIds.has(plan.planId)) {
      findings.push(`Completed plan ${plan.planId} still has an active plan: ${activeIds.get(plan.planId)}`);
    }
  }

  for (const commit of commits) {
    if (commit.files.length === 0) continue;
    const commitPlanIds = new Set(extractPlanIds(commit.message));
    for (const filePath of commit.files) {
      if (filePath.startsWith("docs/exec-plans/completed/") && filePath.endsWith(".md")) {
        const content = fileAtRef(commit.hash, filePath);
        for (const planId of extractPlanIds(content)) commitPlanIds.add(planId);
      }
    }
    const releaseCommitMapping = findCommitMapping(releaseCommitMappingsForHead, commit.hash);
    if (releaseCommitMapping?.type === "plan") {
      commitPlanIds.add(releaseCommitMapping.planId);
    }

    if (commitPlanIds.size === 0) {
      const message = `Commit ${commit.hash.slice(0, 12)} has no Plan-ID mapping. Ensure the slice completed plan is included in the squash commit or mention Plan-ID in the commit body.`;
      if (releaseCommitMapping?.type === "standard-change") {
        mappedStandardChanges.push({
          hash: commit.hash,
          title: commit.message.split("\n").find(Boolean)?.trim() ?? commit.hash.slice(0, 12),
          rationale: releaseCommitMapping.rationale,
        });
        continue;
      }
      if (isDocumentationOnly(commit.files)) {
        warnings.push(`${message} This commit changes only markdown or PR-template documentation, so it is reported for release-note review rather than blocking the release.`);
      } else {
        findings.push(message);
      }
      continue;
    }

    for (const planId of commitPlanIds) {
      if (!plansById.has(planId)) {
        findings.push(`Commit ${commit.hash.slice(0, 12)} references Plan-ID ${planId}, but no completed plan for that ID is included in this release range.`);
      }
    }
  }

  for (const plan of plans) {
    const evidenceContent = plan.doneEvidence ? fileAtRef(head, plan.doneEvidence) : "";
    plan.evidenceBullets = evidenceContent ? extractEvidenceBullets(evidenceContent) : [];
  }

  const hasNonDocumentationCommit = commits.some((commit) => !isDocumentationOnly(commit.files));

  if (plans.length === 0 && hasNonDocumentationCommit) {
    findings.push("Release range contains commits but no completed slice plans.");
  }

  return {
    options,
    branch,
    base,
    head,
    files,
    commits,
    plans,
    findings,
    warnings,
    migrationFiles: migrationFiles(files),
    configFiles: configFiles(files),
    mappedStandardChanges,
  };
}

export function renderReleaseNotes(report) {
  const lines = [];
  lines.push("# Release Notes");
  lines.push("");
  lines.push(`Base: \`${report.base}\``);
  lines.push(`Head: \`${report.head}\``);
  if (report.branch) lines.push(`Branch: \`${report.branch}\``);
  lines.push("");
  if (report.warnings.length > 0) {
    lines.push("## Release Mapping Warnings");
    lines.push("");
    for (const warning of report.warnings) lines.push(`- ${warning}`);
    lines.push("");
  }
  lines.push("## Operator-Visible Changes");
  lines.push("");
  if (report.configFiles.length > 0) {
    for (const filePath of report.configFiles) lines.push(`- Changed configuration or workflow: \`${filePath}\``);
  } else {
    lines.push("- none identified automatically");
  }
  lines.push("");
  lines.push("## Standard Change Commit Mappings");
  lines.push("");
  if (report.mappedStandardChanges.length > 0) {
    for (const change of report.mappedStandardChanges) {
      lines.push(`- \`${change.hash.slice(0, 12)}\` - ${change.title}`);
      lines.push(`  - Rationale: ${change.rationale}`);
    }
  } else {
    lines.push("- none identified automatically");
  }
  lines.push("");
  lines.push("## Database, Migration, And Data Notes");
  lines.push("");
  if (report.migrationFiles.length > 0) {
    for (const filePath of report.migrationFiles) lines.push(`- Changed database-related file: \`${filePath}\``);
  } else {
    lines.push("- none identified automatically");
  }
  lines.push("");
  lines.push("## Included Slices");
  lines.push("");
  if (report.plans.length === 0) {
    lines.push("- none identified");
  } else {
    for (const plan of report.plans) {
      lines.push(`- \`${plan.planId}\` - ${plan.title}`);
      lines.push(`  - Completed plan: \`${plan.filePath}\``);
      lines.push(`  - Evidence: \`${plan.doneEvidence || "missing"}\``);
      if (plan.evidenceBullets.length > 0) {
        for (const bullet of plan.evidenceBullets.slice(0, 4)) {
          lines.push(`  - ${bullet}`);
        }
      }
    }
  }
  lines.push("");
  lines.push("## Validation");
  lines.push("");
  lines.push("See the included evidence indexes for validation results. Release publication does not verify deployment health.");
  lines.push("");
  lines.push("## Rollback Or Fix-Forward Notes");
  lines.push("");
  lines.push("See the release PR and included plan evidence for rollback or fix-forward guidance.");
  return `${lines.join("\n")}\n`;
}

export function usage(commandName) {
  return [
    `Usage: npm run ${commandName} -- [--base <ref>] [--head <ref>] [--allow-any-branch]`,
    "",
    "Defaults:",
    "- --base uses RELEASE_BASE_REF, then the latest vYYYY.MM.DD.N tag, then origin/main for the first release.",
    "- A release-tag base uses its companion source-vYYYY.MM.DD.N tag when available.",
    "- --head uses RELEASE_HEAD_REF, then HEAD.",
    "- release verification expects the current branch to match release/YYYY.MM.DD.N unless --allow-any-branch is set.",
  ].join("\n");
}
