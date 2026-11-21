import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnHeavy } from "./lib/agent-heavy.mjs";
import { collectLintableChangedFiles, collectPythonChangedFiles } from "./lint-changed-lib.mjs";

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

function readPackageJson() {
  try {
    return JSON.parse(readFileSync("package.json", "utf8"));
  } catch {
    return {};
  }
}

function dependsOn(packageJson, name) {
  return Boolean(
    packageJson.dependencies?.[name] ||
    packageJson.devDependencies?.[name] ||
    packageJson.optionalDependencies?.[name],
  );
}

// oxfmt and oxlint are the defaults. ESLint also runs when it is configured: oxlint has no Vue template rules,
// so a Vue project keeps ESLint with the Vue plugin, and an adopted project can switch later.
function selectTools() {
  const packageJson = readPackageJson();
  const formatter =
    existsSync(".oxfmtrc.json") || existsSync(".oxfmtrc.jsonc") || dependsOn(packageJson, "oxfmt")
      ? { name: "oxfmt", args: ["--check"] }
      : null;
  const eslintConfigs = [
    "eslint.config.js",
    "eslint.config.mjs",
    "eslint.config.cjs",
    "eslint.config.ts",
    ".eslintrc",
    ".eslintrc.js",
    ".eslintrc.cjs",
    ".eslintrc.json",
    ".eslintrc.yaml",
    ".eslintrc.yml",
  ];
  const oxlint = existsSync(".oxlintrc.json") || dependsOn(packageJson, "oxlint")
    ? { name: "oxlint", args: ["--deny-warnings"] }
    : null;
  const eslint = eslintConfigs.some((filePath) => existsSync(filePath)) || packageJson.eslintConfig || dependsOn(packageJson, "eslint")
    ? { name: "eslint", args: ["--max-warnings", "0", "--no-warn-ignored"] }
    : null;
  const tools = [formatter, oxlint, eslint].filter(Boolean);
  // Python projects: Ruff formats and lints. The project virtual environment comes first, then PATH.
  if (existsSync("ruff.toml") || existsSync(".ruff.toml") || /^\[tool\.ruff\b/m.test(existsSync("pyproject.toml") ? readFileSync("pyproject.toml", "utf8") : "")) {
    const binary = existsSync(path.join(".venv", "bin", "ruff")) ? path.join(".venv", "bin", "ruff") : "ruff";
    tools.push({ name: "ruff", binary, args: ["format", "--check"], python: true }, { name: "ruff", binary, args: ["check"], python: true });
  }
  return tools;
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

const tools = selectTools();
if (tools.length === 0) {
  console.log("lint:changed skipped because neither oxfmt, oxlint, ESLint, nor Ruff is configured in this repository.");
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
const pythonFiles = collectPythonChangedFiles(changedFilesOutput, untrackedFilesOutput);

if (changedFiles.length + pythonFiles.length === 0) {
  console.log(
    `lint:changed found no lintable files changed since ${comparisonBase}.`,
  );
  process.exit(0);
}

console.log(
  `lint:changed checking ${changedFiles.length + pythonFiles.length} file(s) against ${baseRef} with ${[...new Set(tools.map((tool) => tool.name))].join(", ")}.`,
);

let status = 0;
for (const tool of tools) {
  const files = tool.python ? pythonFiles : changedFiles;
  if (files.length === 0) continue;
  // The local binary starts faster than a package-manager runner and works with every package manager.
  const binary = tool.binary ?? path.join("node_modules", ".bin", process.platform === "win32" ? `${tool.name}.cmd` : tool.name);
  if (!tool.binary && !existsSync(binary)) {
    console.error(`lint:changed: ${tool.name} is configured, but ${binary} is missing. Install the dependencies.`);
    process.exit(1);
  }
  const result = spawnHeavy(binary, [...tool.args, ...files], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) {
    console.error(`lint:changed: ${tool.name} is configured, but ${binary} did not start: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) status = result.status ?? 1;
}

process.exit(status);
