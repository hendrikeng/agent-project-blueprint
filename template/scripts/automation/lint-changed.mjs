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

function packageBin(name) {
  try {
    const { bin } = JSON.parse(readFileSync(path.join("node_modules", name, "package.json"), "utf8"));
    const file = typeof bin === "string" ? bin : bin?.[name];
    return file ? path.join("node_modules", name, file) : null;
  } catch {
    return null;
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
      ? { id: "oxfmt", name: "oxfmt", args: ["--check", "--no-error-on-unmatched-pattern"] }
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
    ? { id: "oxlint", name: "oxlint", args: ["--deny-warnings", "--no-error-on-unmatched-pattern"] }
    : null;
  const eslint = eslintConfigs.some((filePath) => existsSync(filePath)) || packageJson.eslintConfig || dependsOn(packageJson, "eslint")
    ? { id: "eslint", name: "eslint", args: ["--max-warnings", "0", "--no-warn-ignored"] }
    : null;
  const tools = [formatter, oxlint, eslint].filter(Boolean);
  // Python projects: Ruff formats and lints. The project virtual environment comes first, then PATH.
  if (existsSync("ruff.toml") || existsSync(".ruff.toml") || /^\[tool\.ruff\b/m.test(existsSync("pyproject.toml") ? readFileSync("pyproject.toml", "utf8") : "")) {
    const binary = [path.join(".venv", "bin", "ruff"), path.join(".venv", "Scripts", "ruff.exe")].find((file) => existsSync(file)) ?? "ruff";
    tools.push(
      { id: "ruff-format", name: "ruff", binary, args: ["format", "--check"], python: true },
      { id: "ruff-check", name: "ruff", binary, args: ["check"], python: true },
    );
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
  // From the pre-push hook a Git failure must not pass the push without a check.
  if (process.env.LINT_CHANGED_TRACKED_ONLY === "1") {
    console.error("lint:changed: Git failed in this repository, so no files were checked.");
    process.exit(1);
  }
  console.log("lint:changed skipped because this directory is not a git repository.");
  process.exit(0);
}

const tools = selectTools();
if (tools.length === 0) {
  console.log("lint:changed skipped because neither oxfmt, oxlint, ESLint, nor Ruff is configured in this repository.");
  process.exit(0);
}

const hookMode = process.env.LINT_CHANGED_TRACKED_ONLY === "1";
const baseRef = resolveBaseRef();

// From the pre-push hook, the HEAD^ fallback would check only the last commit of the push.
// Without a remote base the hook checks every tracked file instead. pre-push.mjs sets VERIFY_LINT_BASE.
const explicitBase = Boolean(baseRef) && baseRef === process.env.VERIFY_LINT_BASE?.trim();
const checkAll = hookMode && (!baseRef || (baseRef === "HEAD^" && !explicitBase));

if (!baseRef && !checkAll) {
  console.log(
    "lint:changed skipped because no comparison base was available. Set VERIFY_LINT_BASE to enable changed-file linting.",
  );
  process.exit(0);
}

const comparisonBase = checkAll ? null :
  baseRef === "HEAD^" ? "HEAD^" : runGit(["merge-base", "HEAD", baseRef], { allowFailure: true });
if (!checkAll && !comparisonBase) {
  console.error(`lint:changed: HEAD has no merge base with ${baseRef}. Fetch more history or set VERIFY_LINT_BASE.`);
  process.exit(1);
}

const changedFilesDiff = checkAll
  ? runGit(["ls-files"], { allowFailure: true })
  : runGit(["diff", "--name-only", "--diff-filter=ACMR", comparisonBase], { allowFailure: true });
if (hookMode && changedFilesDiff === null) {
  console.error(`lint:changed: git could not list the changed files, so no files were checked.`);
  process.exit(1);
}
const changedFilesOutput = changedFilesDiff ?? "";

// The pre-push hook checks only committed files: an untracked scratch file is not part of the push.
const untrackedFilesOutput = hookMode
  ? ""
  : runGit(["ls-files", "--others", "--exclude-standard"], { allowFailure: true }) ?? "";

// Optional: validationPolicy.changedFileObserve in docs/governance/policy-manifest.json lists tool ids
// (oxfmt, oxlint, eslint, ruff-format, ruff-check) that report findings without failing, for example during a formatter adoption.
function observedTools() {
  try {
    const ids = JSON.parse(readFileSync("docs/governance/policy-manifest.json", "utf8")).validationPolicy?.changedFileObserve;
    return new Set(Array.isArray(ids) ? ids : []);
  } catch {
    return new Set();
  }
}

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
const observed = observedTools();
for (const tool of tools) {
  const files = tool.python ? pythonFiles : changedFiles;
  if (files.length === 0) continue;
  // Node runs the package bin directly: faster than a package-manager runner, the same on every OS, and
  // without a shell, so file names stay arguments. Yarn Plug'n'Play has no node_modules, so Yarn runs the tool.
  let command = tool.binary;
  let prefix = [];
  if (!command) {
    const bin = packageBin(tool.name);
    if (bin) [command, prefix] = [process.execPath, [bin]];
    else if (existsSync(".pnp.cjs")) [command, prefix] = ["yarn", [tool.name]];
    else {
      console.error(`lint:changed: ${tool.name} is configured, but node_modules/${tool.name} is missing. Install the dependencies.`);
      process.exit(1);
    }
  }
  const result = spawnHeavy(command, [...prefix, ...tool.args, ...files], { stdio: "inherit" });
  if (result.error) {
    console.error(`lint:changed: ${tool.name} is configured, but ${command} did not start: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status === 0) continue;
  // Observe mode accepts only the findings exit code 1. A crash or a configuration error still fails.
  if (observed.has(tool.id) && result.status === 1) console.log(`lint:changed: ${tool.id} found problems. Observe mode: the check does not fail.`);
  else status = result.status ?? 1;
}

process.exit(status);
