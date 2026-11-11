import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import process from "node:process";
import { spawnHeavy } from "./lib/agent-heavy.mjs";
import { collectLintableChangedFiles } from "./lint-changed-lib.mjs";

function runGit(args, { allowFailure = false } = {}) {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    if (allowFailure) {
      return null;
    }

    throw error;
  }
}

function refExists(ref) {
  return runGit(["rev-parse", "--verify", ref], { allowFailure: true }) !== null;
}

function isGitRepository() {
  return runGit(["rev-parse", "--is-inside-work-tree"], { allowFailure: true }) === "true";
}

function hasEslintConfigured() {
  const configFiles = [
    "eslint.config.js",
    "eslint.config.mjs",
    "eslint.config.cjs",
    ".eslintrc",
    ".eslintrc.js",
    ".eslintrc.cjs",
    ".eslintrc.json",
    ".eslintrc.yaml",
    ".eslintrc.yml",
  ];
  if (configFiles.some((filePath) => existsSync(filePath))) {
    return true;
  }

  if (!existsSync("package.json")) {
    return false;
  }

  try {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
    return Boolean(
      packageJson.eslintConfig ||
      packageJson.dependencies?.eslint ||
      packageJson.devDependencies?.eslint ||
      packageJson.optionalDependencies?.eslint,
    );
  } catch {
    return false;
  }
}

function resolveBaseRef() {
  const explicitBase = process.env.VERIFY_LINT_BASE?.trim();
  if (explicitBase && refExists(explicitBase)) {
    return explicitBase;
  }

  const githubBaseRef = process.env.GITHUB_BASE_REF?.trim();
  if (githubBaseRef) {
    const remoteBaseRef = `origin/${githubBaseRef}`;

    if (refExists(remoteBaseRef)) {
      return remoteBaseRef;
    }

    if (refExists(githubBaseRef)) {
      return githubBaseRef;
    }
  }

  const currentBranch = runGit(["branch", "--show-current"], {
    allowFailure: true,
  });
  if (currentBranch && currentBranch !== "dev" && refExists("origin/dev")) {
    return "origin/dev";
  }

  if (refExists("HEAD^")) {
    return "HEAD^";
  }

  return null;
}

if (!isGitRepository()) {
  console.log("lint:changed skipped because this directory is not a git repository.");
  process.exit(0);
}

if (!hasEslintConfigured()) {
  console.log("lint:changed skipped because ESLint is not configured in this repository.");
  process.exit(0);
}

const baseRef = resolveBaseRef();

if (!baseRef) {
  console.log(
    "lint:changed skipped because no comparison base was available. Set VERIFY_LINT_BASE to enable changed-file linting.",
  );
  process.exit(0);
}

const comparisonBase =
  baseRef === "HEAD^" ? "HEAD^" : runGit(["merge-base", "HEAD", baseRef]);

const changedFilesOutput =
  runGit(["diff", "--name-only", "--diff-filter=ACMR", comparisonBase], {
    allowFailure: true,
  }) ?? "";

const untrackedFilesOutput =
  runGit(["ls-files", "--others", "--exclude-standard"], {
    allowFailure: true,
  }) ?? "";

const changedFiles = collectLintableChangedFiles(
  changedFilesOutput,
  untrackedFilesOutput,
);

if (changedFiles.length === 0) {
  console.log(
    `lint:changed found no lintable files changed since ${comparisonBase}.`,
  );
  process.exit(0);
}

console.log(
  `lint:changed checking ${changedFiles.length} file(s) against ${baseRef}.`,
);

const result = spawnHeavy(
  "npx",
  ["eslint", "--max-warnings", "0", "--no-warn-ignored", ...changedFiles],
  {
    stdio: "inherit",
  },
);

process.exit(result.status ?? 1);
