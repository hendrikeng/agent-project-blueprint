import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnHeavy } from "./lib/agent-heavy.mjs";
import { collectLintableChangedFiles, collectPythonChangedFiles } from "./lint-changed-lib.mjs";

function runGit(args, { allowFailure = false } = {}) {
  try {
    const output = execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    // -z output keeps file names exact, also leading or trailing spaces.
    return args.includes("-z") ? output : output.trim();
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

// --report-unused-disable-directives-severity exists since ESLint 8.56. If the version is unknown, the flag is not passed.
function eslintSupportsDirectiveSeverity() {
  try {
    const [major, minor] = JSON.parse(readFileSync(path.join("node_modules", "eslint", "package.json"), "utf8")).version.split(".").map(Number);
    return major > 8 || (major === 8 && minor >= 56);
  } catch {
    return false;
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
  // bun fmt (a [fmt] section in bunfig.toml) comes first: it was faster than oxfmt with the same output on 90 of 91 files.
  const bunFormat = existsSync("bunfig.toml") && /^\s*(?:\[\s*fmt\s*[\].]|fmt\.)/m.test(readFileSync("bunfig.toml", "utf8"));
  const formatter = bunFormat
    ? { id: "bun-fmt", name: "bun", binary: "bun", args: ["fmt", "--check", "--no-error-on-unmatched-pattern"] }
    : existsSync(".oxfmtrc.json") || existsSync(".oxfmtrc.jsonc") || dependsOn(packageJson, "oxfmt")
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
      // Ruff ignores its exclude settings for named files unless --force-exclude is set.
      { id: "ruff-format", name: "ruff", binary, args: ["format", "--check", "--force-exclude"], python: true },
      { id: "ruff-check", name: "ruff", binary, args: ["check", "--force-exclude"], python: true },
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
  console.log("lint:changed skipped because neither bun fmt, oxfmt, oxlint, ESLint, nor Ruff is configured in this repository.");
  process.exit(0);
}

const hookMode = process.env.LINT_CHANGED_TRACKED_ONLY === "1";
// PRE_PUSH_FAST lets the ESLint configuration drop type-aware rules. Only the pre-push hook (hook mode) can set it.
if (!hookMode) delete process.env.PRE_PUSH_FAST;
// Without the type-aware rules, their eslint-disable directives look unused, and --max-warnings 0 would block the push.
// CI lints without PRE_PUSH_FAST and still reports unused directives. Older ESLint versions reject the flag.
const eslintTool = tools.find((tool) => tool.id === "eslint");
if (process.env.PRE_PUSH_FAST === "1" && eslintTool && eslintSupportsDirectiveSeverity()) {
  eslintTool.args.push("--report-unused-disable-directives-severity", "off");
}
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
  ? runGit(["ls-files", "-z"], { allowFailure: true })
  : runGit(["diff", "--name-only", "-z", "--diff-filter=ACMR", comparisonBase], { allowFailure: true });
if (hookMode && changedFilesDiff === null) {
  console.error(`lint:changed: git could not list the changed files, so no files were checked.`);
  process.exit(1);
}
const changedFilesOutput = changedFilesDiff ?? "";

// The pre-push hook checks only committed files: an untracked scratch file is not part of the push.
const untrackedFilesOutput = hookMode
  ? ""
  : runGit(["ls-files", "-z", "--others", "--exclude-standard"], { allowFailure: true }) ?? "";

// Optional: validationPolicy.changedFileObserve in docs/governance/policy-manifest.json lists tool ids
// (bun-fmt, oxfmt, oxlint, eslint, ruff-format, ruff-check) that report findings without failing, for example during a formatter adoption.
// In hook mode the policy manifest comes from the pushed commit (HEAD), so an untracked manifest cannot weaken the push
// checks. Tool configuration files still come from the working tree.
function validationPolicy() {
  try {
    const source = hookMode
      ? runGit(["show", "HEAD:docs/governance/policy-manifest.json"])
      : readFileSync("docs/governance/policy-manifest.json", "utf8");
    return JSON.parse(source).validationPolicy ?? {};
  } catch {
    return {};
  }
}

function observedTools() {
  const ids = validationPolicy().changedFileObserve;
  return new Set(Array.isArray(ids) ? ids : []);
}

// Optional: validationPolicy.changedFileNodeOptions maps a tool id to Node options,
// for example { "eslint": ["--max-old-space-size=4096"] } for a type-aware ESLint run.
function nodeOptions(id) {
  const options = validationPolicy().changedFileNodeOptions?.[id];
  return Array.isArray(options) ? options.filter((option) => typeof option === "string" && option.startsWith("--")) : [];
}

const changedFiles = collectLintableChangedFiles(
  changedFilesOutput,
  untrackedFilesOutput,
);
const pythonFiles = collectPythonChangedFiles(changedFilesOutput, untrackedFilesOutput);

if (changedFiles.length + pythonFiles.length === 0) {
  console.log(
    checkAll ? "lint:changed found no lintable tracked files." : `lint:changed found no lintable files changed since ${comparisonBase}.`,
  );
  process.exit(0);
}

console.log(
  `lint:changed checking ${checkAll ? "all " : ""}${changedFiles.length + pythonFiles.length} file(s)${checkAll ? "" : ` against ${baseRef}`} with ${[...new Set(tools.map((tool) => tool.name))].join(", ")}.`,
);

let status = 0;
const observed = observedTools();
const FILES_PER_RUN = 200;
for (const tool of tools) {
  const files = tool.python ? pythonFiles : changedFiles;
  if (files.length === 0) continue;
  // Node runs the package bin directly: faster than a package-manager runner, the same on every OS, and
  // without a shell, so file names stay arguments. Yarn Plug'n'Play has no node_modules, so Yarn runs the tool.
  let command = tool.binary;
  let prefix = [];
  if (!command) {
    const bin = packageBin(tool.name);
    if (bin) [command, prefix] = [process.execPath, [...nodeOptions(tool.id), bin]];
    else if (existsSync(".pnp.cjs")) [command, prefix] = ["yarn", [tool.name]];
    else {
      console.error(`lint:changed: ${tool.name} is configured, but node_modules/${tool.name} is missing. Install the dependencies.`);
      process.exit(1);
    }
  }
  const observe = observed.has(tool.id);
  // Chunks keep each command line short: all tracked files can exceed the OS argument limit.
  for (let start = 0; start < files.length; start += FILES_PER_RUN) {
    // `--` ends the options, so a file named like `--fix.js` stays a file. oxfmt, oxlint, ESLint, and Ruff accept it.
    // Observe mode reads the output: oxlint and oxfmt also exit with 1 when their configuration is broken.
    const result = spawnHeavy(command, [...prefix, ...tool.args, "--", ...files.slice(start, start + FILES_PER_RUN)], observe
      ? { stdio: ["inherit", "pipe", "pipe"], encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }
      : { stdio: "inherit" });
    if (observe) {
      process.stdout.write(result.stdout ?? "");
      process.stderr.write(result.stderr ?? "");
    }
    if (result.error) {
      console.error(result.error.code === "ENOBUFS"
        ? `lint:changed: ${tool.id} printed more than 256 MB, so its result is unknown.`
        : `lint:changed: ${tool.name} is configured, but ${command} did not start: ${result.error.message}`);
      process.exit(1);
    }
    if (result.status === 0) continue;
    // Observe mode accepts only findings: exit code 1 without a fatal tool message at the start of a line.
    // Code frames of findings are indented, so source text cannot match.
    // Bun prints fatal errors as `error: ...` at the start of a line. Its format findings do not.
    const broken = /^(?:Failed to (?:parse|load) (?:oxlint )?configuration|Error \[ERR_MODULE_NOT_FOUND\]|Error: Cannot find module|error: )/m.test(`${result.stdout}\n${result.stderr}`);
    if (observe && result.status === 1 && !broken) console.log(`lint:changed: ${tool.id} found problems. Observe mode: the check does not fail.`);
    else {
      if (observe && broken) console.error(`lint:changed: ${tool.id} did not run: configuration error or missing module. Observe mode does not hide this.`);
      status = result.status ?? 1;
    }
  }
}

process.exit(status);
