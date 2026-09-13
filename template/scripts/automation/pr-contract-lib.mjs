import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { isValidReleaseVersion } from "./release-support-lib.mjs";

const RELEASE_COMMAND_FIELDS = [
  ["- Release notes generated:", "release:notes"],
  ["- Release completeness verified:", "release:verify"],
];

const RELEASE_CONTRACT_MARKERS = [
  "## Release Contract",
  "- Release ID:",
  ...RELEASE_COMMAND_FIELDS.map(([label]) => label),
  "- Required release gates passed: Fast Gate / Full Gate / Release Candidate Gate",
];

const SLICE_CONTRACT_MARKERS = [
  "## Slice Contract",
  "- Plan-ID:",
  "- Merge-ready plan file:",
  "- Done-Evidence:",
  "- Target branch:",
];

const FIX_CONTRACT_MARKERS = [
  "## Fix Contract",
  "- Branch:",
  "- Small-fix rationale:",
  "- Why no execution plan is needed:",
  "- Reviewer context:",
  "- Target branch:",
];

const SLICE_ONLY_MARKERS = [
  "## Slice Contract",
  "- Plan-ID:",
  "- Merge-ready plan file:",
  "- Done-Evidence:",
];

const FIX_ONLY_MARKERS = [
  "## Fix Contract",
  "Standard-change rationale, if using `fix/*`:",
  "- Standard-change rationale:",
  "- Small-fix rationale:",
  "- Why no execution plan is needed:",
  "## Standard-Change Bounds",
  "## Small-Fix Bounds",
];

function normalizeText(value) {
  return String(value ?? "").replace(/\r\n/g, "\n");
}

function missingMarkers(body, markers) {
  const normalized = normalizeText(body);
  return markers.filter((marker) => !normalized.includes(marker));
}

function invalidReleaseCommandFields(body) {
  const lines = normalizeText(body).split("\n").map((line) => line.trim());
  return RELEASE_COMMAND_FIELDS.filter(([label, script]) => {
    const line = lines.find((candidate) => candidate.startsWith(label));
    const command = line?.slice(label.length).trim().replace(/^`|`$/g, "") ?? "";
    return !new RegExp(`^(?:npm run|pnpm(?: run)?|yarn(?: run)?|bun run) ${script}$`).test(command);
  });
}

function branchClass(headRef) {
  if (headRef.startsWith("release/")) return "release";
  if (headRef.startsWith("slice/")) return "slice";
  if (headRef.startsWith("fix/")) return "fix";
  return "other";
}

export function validatePrContract({ headRef, baseRef, title, body }) {
  const head = String(headRef ?? "").trim();
  const base = String(baseRef ?? "").trim();
  const normalizedTitle = String(title ?? "").trim();
  const normalizedBody = normalizeText(body);
  const kind = branchClass(head);
  const findings = [];

  if (!head || !base) {
    findings.push("PR contract check requires both head and base branch names.");
    return findings;
  }

  if (kind === "release") {
    if (base !== "main") {
      findings.push(`release PRs must target main; got ${head} -> ${base}.`);
    }

    const releaseVersion = head.slice('release/'.length);
    if (!isValidReleaseVersion(releaseVersion)) {
      findings.push("release branch must use release/YYYY.MM.DD.N with a real date and positive sequence.");
    }
    const expectedTitle = `Release ${releaseVersion}`;
    if (normalizedTitle !== expectedTitle) {
      findings.push(`release PR title must be '${expectedTitle}'; got '${normalizedTitle || '(empty)'}'.`);
    }

    const missing = missingMarkers(normalizedBody, RELEASE_CONTRACT_MARKERS);
    for (const marker of missing) {
      findings.push(`release PR body is missing required marker: ${marker}`);
    }
    for (const [label, script] of invalidReleaseCommandFields(normalizedBody)) {
      findings.push(`release PR body field '${label}' must reference ${script}.`);
    }

    return findings;
  }

  if (base === "main") {
    findings.push(`PRs targeting main must use a release/* source branch; got ${head}.`);
  }

  if (base === "dev" && kind === "other") {
    findings.push(`PRs targeting dev must use a slice/* or fix/* source branch; got ${head}.`);
  }

  if (kind === "slice") {
    if (base !== "dev") {
      findings.push(`slice PRs must target dev; got ${head} -> ${base}.`);
    }

    if (normalizedBody.includes("## Release Contract")) {
      findings.push("slice PR body must not include the release-only Release Contract section.");
    }

    for (const marker of FIX_ONLY_MARKERS) {
      if (normalizedBody.includes(marker)) {
        findings.push(`slice PR body must not include fix-only marker: ${marker}`);
      }
    }

    const missing = missingMarkers(normalizedBody, SLICE_CONTRACT_MARKERS);
    for (const marker of missing) {
      findings.push(`slice PR body is missing required slice marker: ${marker}`);
    }
  }

  if (kind === "fix") {
    if (base !== "dev") {
      findings.push(`fix PRs must target dev; got ${head} -> ${base}.`);
    }

    if (normalizedBody.includes("## Release Contract")) {
      findings.push("fix PR body must not include the release-only Release Contract section.");
    }

    for (const marker of SLICE_ONLY_MARKERS) {
      if (normalizedBody.includes(marker)) {
        findings.push(`fix PR body must not include slice-only marker: ${marker}`);
      }
    }

    const missing = missingMarkers(normalizedBody, FIX_CONTRACT_MARKERS);
    for (const marker of missing) {
      findings.push(`fix PR body is missing required fix marker: ${marker}`);
    }
  }

  return findings;
}

function runGit(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function gitRefExists(ref) {
  try {
    runGit(["rev-parse", "--verify", `${ref}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

function prHeadTip() {
  return gitRefExists("HEAD^2") ? "HEAD^2" : "HEAD";
}

export function implementationMergeCommits({ headRef, baseRef, baseSha }) {
  const head = String(headRef ?? "").trim();
  const base = String(baseRef ?? "").trim();
  const kind = branchClass(head);

  if ((kind !== "slice" && kind !== "fix") || base !== "dev") {
    return [];
  }

  const baseRefName = gitRefExists(`origin/${base}`) ? `origin/${base}` : String(baseSha ?? "").trim();
  if (!baseRefName || !gitRefExists(baseRefName)) {
    throw new Error(
      `Cannot verify implementation branch history because origin/${base} and the PR base SHA are not available.`,
    );
  }

  const output = runGit([
    "log",
    "--merges",
    "--format=%h %s",
    `${baseRefName}..${prHeadTip()}`,
  ]);

  return output ? output.split("\n") : [];
}

export function validateImplementationBranchHistory({ headRef, baseRef, mergeCommits }) {
  const head = String(headRef ?? "").trim();
  const base = String(baseRef ?? "").trim();
  const kind = branchClass(head);
  const findings = [];

  if ((kind !== "slice" && kind !== "fix") || base !== "dev") {
    return findings;
  }

  if (mergeCommits.length > 0) {
    findings.push(
      `${kind} PRs into dev must keep a linear work-branch history. Rebase ${head} onto origin/dev instead of merging dev or another branch into it. Merge commits found: ${mergeCommits.join("; ")}`,
    );
  }

  return findings;
}

export function readPrContractFromEnv(env = process.env) {
  const eventPath = env.PR_CONTRACT_EVENT_PATH || env.GITHUB_EVENT_PATH;
  let event = {};

  if (eventPath) {
    event = JSON.parse(readFileSync(eventPath, "utf8"));
  }

  const pullRequest = event.pull_request ?? {};

  return {
    headRef: env.PR_CONTRACT_HEAD_REF || env.GITHUB_HEAD_REF || pullRequest.head?.ref || "",
    baseRef: env.PR_CONTRACT_BASE_REF || env.GITHUB_BASE_REF || pullRequest.base?.ref || "",
    baseSha: env.PR_CONTRACT_BASE_SHA || pullRequest.base?.sha || "",
    title: env.PR_CONTRACT_TITLE ?? pullRequest.title ?? "",
    body: env.PR_CONTRACT_BODY ?? pullRequest.body ?? "",
  };
}
