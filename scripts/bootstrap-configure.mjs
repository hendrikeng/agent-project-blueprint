#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { collectSourceFiles, writeTextFileAtomic } from './harness-sync.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const questionnairePath = path.join(rootDir, 'distribution', 'bootstrap-questionnaire.json');
const sourceManifestPath = path.join(rootDir, 'distribution', 'harness-ownership-manifest.json');
const secretPattern = /-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16})\b/;

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    if (!key?.startsWith('--') || argv[index + 1] === undefined) throw new Error('Usage: node scripts/bootstrap-configure.mjs --target <path> --decisions <path> [--json true|false] [--baseline-only true|false] [--bootstrap-policy <reviewed ownership manifest>]');
    options[key.slice(2)] = argv[index + 1];
  }
  if (!options.target || !options.decisions) throw new Error('Both --target and --decisions are required.');
  return options;
}

function currentRevision() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: rootDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return result.status === 0 ? result.stdout.trim() : null;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function isWithin(parent, child) {
  const local = path.relative(parent, child);
  return local === '' || (local !== '..' && !local.startsWith(`..${path.sep}`) && !path.isAbsolute(local));
}

async function assertNoSymlink(targetDir, filePath) {
  let current = targetDir;
  for (const segment of path.relative(targetDir, filePath).split(path.sep)) {
    current = path.join(current, segment);
    try {
      if ((await fs.lstat(current)).isSymbolicLink()) throw new Error(`[TARGET_SYMLINK] Refusing symbolic-link path: ${filePath}`);
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }
  }
}

async function collectFiles(directory) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ['.git', 'node_modules'].includes(entry.name)) continue;
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(filePath));
    else if (entry.isFile()) files.push(filePath);
  }
  return files;
}

function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === value;
}

function validateValues(questionnaire, values) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('Decision packet values must be an object.');
  const expected = questionnaire.sections.flatMap((section) => section.questions.flatMap((question) => question.placeholders));
  const expectedSet = new Set(expected);
  const invalid = Object.entries(values).filter(([, value]) => typeof value !== 'string' || !value.trim() || /[\r\n\0]/.test(value) || /\{\{[A-Z0-9_]+\}\}/.test(value));
  const missing = expected.filter((key) => !Object.hasOwn(values, key));
  const unknown = Object.keys(values).filter((key) => !expectedSet.has(key));
  if (missing.length) throw new Error(`Missing placeholder decision(s): ${missing.join(', ')}`);
  if (unknown.length) throw new Error(`Unknown placeholder decision(s): ${unknown.join(', ')}`);
  if (invalid.length) throw new Error(`Decision values must be non-empty single-line strings without placeholder tokens: ${invalid.map(([key]) => key).join(', ')}`);
  for (const key of ['LAST_UPDATED_ISO_DATE', 'CURRENT_STATE_DATE']) {
    if (!isValidIsoDate(values[key])) throw new Error(`${key} must be a valid YYYY-MM-DD calendar date.`);
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(values.GENERATED_AT_UTC_ISO) || !isValidIsoDate(values.GENERATED_AT_UTC_ISO.slice(0, 10)) || Number.isNaN(Date.parse(values.GENERATED_AT_UTC_ISO))) throw new Error('GENERATED_AT_UTC_ISO must be a valid UTC ISO timestamp.');
  for (const key of expected.filter((value) => value.startsWith('SCORE_'))) {
    if (!/^[1-5]$/.test(values[key])) throw new Error(`${key} must be an integer from 1 to 5.`);
  }
  // Node 26 is the active LTS and the default for new projects. Existing projects can stay on the Node 24 maintenance line.
  if (!['24', '26'].includes(values.NODE_VERSION)) throw new Error('NODE_VERSION must be 26 or 24.');
  const lockfilesByCache = {
    bun: new Set(['bun.lock', 'bun.lockb']),
    npm: new Set(['package-lock.json', 'npm-shrinkwrap.json']),
    pnpm: new Set(['pnpm-lock.yaml']),
    yarn: new Set(['yarn.lock'])
  };
  if (!lockfilesByCache[values.PACKAGE_MANAGER_CACHE]?.has(values.PACKAGE_MANAGER_LOCKFILE)) {
    throw new Error('PACKAGE_MANAGER_CACHE and PACKAGE_MANAGER_LOCKFILE must describe the same Bun, npm, pnpm, or yarn toolchain.');
  }
  if (!values.CI_INSTALL_COMMAND.startsWith(`${values.PACKAGE_MANAGER_CACHE} `)) {
    throw new Error('CI_INSTALL_COMMAND must start with the selected package-manager command.');
  }
  const outOfScope = ['OUT_OF_SCOPE_ITEM_1', 'OUT_OF_SCOPE_ITEM_2', 'OUT_OF_SCOPE_ITEM_3'];
  for (const key of [...outOfScope, 'REPOSITORY_PROFILE_SNAKE_CASE']) {
    if (!/^[a-z0-9_]+$/.test(values[key])) throw new Error(`${key} must use snake_case.`);
  }
  if (new Set(outOfScope.map((key) => values[key])).size !== outOfScope.length) {
    throw new Error('OUT_OF_SCOPE_ITEM values must be unique.');
  }
  for (const key of ['CODEOWNERS_DEFAULT_TEAM', 'CODEOWNERS_SECURITY_TEAM']) {
    if (!/^@[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*(?:\/[A-Za-z0-9_.-]+)?$/.test(values[key])) throw new Error(`${key} must use @username or @org/team format.`);
  }
  const secret = Object.entries(values).find(([, value]) => secretPattern.test(value));
  if (secret) throw new Error(`${secret[0]} appears to contain a secret.`);
  return expectedSet;
}

function replaceString(value, values) {
  return value.replace(/\{\{([A-Z0-9_]+)\}\}/g, (token, key) => values[key] ?? token);
}

function replaceText(value, values) {
  return replaceString(
    value.replace(/"\{\{([A-Z0-9_]+)\}\}"/g, (token, key) => values[key] === undefined ? token : JSON.stringify(values[key])),
    values
  );
}

function replaceJsonStrings(value, values) {
  if (typeof value === 'string') return replaceString(value, values);
  if (Array.isArray(value)) return value.map((entry) => replaceJsonStrings(entry, values));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, replaceJsonStrings(entry, values)]));
  }
  return value;
}

export function configureContent(relativePath, source, values) {
  if (path.basename(relativePath) === 'PLACEHOLDERS.md' || ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.sh'].includes(path.extname(relativePath)) || source.includes(0) || !source.includes(Buffer.from('{{'))) return source;
  const content = source.toString('utf8');
  const missing = [...content.matchAll(/\{\{([A-Z0-9_]+)\}\}/g)].map((match) => match[1]).filter((key) => !Object.hasOwn(values, key));
  if (missing.length) throw new Error(`Missing placeholder decision(s) in ${relativePath}: ${[...new Set(missing)].join(', ')}`);
  return Buffer.from(path.extname(relativePath) === '.json'
    ? `${JSON.stringify(replaceJsonStrings(JSON.parse(content), values), null, 2)}\n`
    : replaceText(content, values));
}

export async function loadDecisions(targetDir, decisionFile) {
  const decisionsPath = path.resolve(targetDir, decisionFile);
  if (!isWithin(targetDir, decisionsPath)) throw new Error('Decision packet must be inside the target repository.');
  await assertNoSymlink(targetDir, decisionsPath);
  const questionnaire = JSON.parse(await fs.readFile(questionnairePath, 'utf8'));
  const decisions = JSON.parse(await fs.readFile(decisionsPath, 'utf8'));
  if (decisions.schemaVersion !== 1) throw new Error(`Unsupported decision packet schemaVersion: ${decisions.schemaVersion ?? 'missing'}.`);
  const expected = validateValues(questionnaire, decisions.values);
  if (decisions.evidence && (typeof decisions.evidence !== 'object' || Array.isArray(decisions.evidence))) throw new Error('Decision evidence must be an object.');
  const invalidEvidence = Object.entries(decisions.evidence ?? {}).find(([, value]) => typeof value !== 'string');
  if (invalidEvidence) throw new Error(`${invalidEvidence[0]} evidence must be a string.`);
  const evidenceSecret = Object.entries(decisions.evidence ?? {}).find(([, value]) => secretPattern.test(value));
  if (evidenceSecret) throw new Error(`${evidenceSecret[0]} evidence appears to contain a secret.`);
  return { decisions, expected, decisionsPath };
}

async function replacePlaceholders(targetDir, values, expected) {
  const replacements = [];
  const conflicts = [];
  for (const sourcePath of await collectFiles(path.join(rootDir, 'template'))) {
    const relativePath = path.relative(path.join(rootDir, 'template'), sourcePath);
    if (path.basename(relativePath) === 'PLACEHOLDERS.md' || ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.sh'].includes(path.extname(relativePath))) continue;
    const targetPath = path.join(targetDir, relativePath);
    await assertNoSymlink(targetDir, targetPath);
    let source;
    let target;
    try {
      [source, target] = await Promise.all([fs.readFile(sourcePath), fs.readFile(targetPath)]);
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
    if (source.includes(0) || !source.includes(Buffer.from('{{'))) continue;
    if (!source.equals(target)) {
      const targetContent = target.includes(0) ? '' : target.toString('utf8');
      if ([...targetContent.matchAll(/\{\{([A-Z0-9_]+)\}\}/g)].some((match) => expected.has(match[1]))) conflicts.push(relativePath);
      continue;
    }
    const next = configureContent(relativePath, source, values).toString('utf8');
    const unresolved = [...next.matchAll(/\{\{([A-Z0-9_]+)\}\}/g)]
      .filter((match) => expected.has(match[1]));
    if (unresolved.length) throw new Error(`Unresolved governed placeholders remain in ${relativePath}.`);
    replacements.push({ relativePath, targetPath, next });
  }
  if (conflicts.length) throw new Error(`Edited template files still contain governed placeholders: ${conflicts.join(', ')}`);
  for (const replacement of replacements) await fs.writeFile(replacement.targetPath, replacement.next, 'utf8');
  return replacements.map((entry) => entry.relativePath).sort();
}

async function packagePlan(targetDir, values) {
  const packagePath = path.join(targetDir, 'package.json');
  const fragmentPath = path.join(targetDir, 'package.scripts.fragment.json');
  await assertNoSymlink(targetDir, packagePath);
  await assertNoSymlink(targetDir, fragmentPath);
  const fragment = JSON.parse(await fs.readFile(fragmentPath, 'utf8'));
  let packageJson;
  try {
    packageJson = JSON.parse(await fs.readFile(packagePath, 'utf8'));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    const name = values.PRODUCT.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[._-]+|[._-]+$/g, '');
    if (!name || name.length > 214 || ['node_modules', 'favicon.ico'].includes(name)) throw new Error('PRODUCT must produce a non-empty npm package name of at most 214 characters and must not use a reserved name.');
    if (!['pnpm-lock.yaml', 'bun.lock', 'package-lock.json', 'npm-shrinkwrap.json'].includes(values.PACKAGE_MANAGER_LOCKFILE)) {
      throw new Error('New projects require PACKAGE_MANAGER_LOCKFILE to be pnpm-lock.yaml, bun.lock, package-lock.json, or npm-shrinkwrap.json.');
    }
    const lockPath = path.join(targetDir, values.PACKAGE_MANAGER_LOCKFILE);
    await assertNoSymlink(targetDir, lockPath);
    try {
      await fs.access(lockPath);
      throw new Error(`Refusing to overwrite existing ${values.PACKAGE_MANAGER_LOCKFILE} without package.json.`);
    } catch (lockError) {
      if (lockError?.code !== 'ENOENT') throw lockError;
    }
    packageJson = { name, private: true, version: '0.1.0', type: 'module', engines: { node: `>=${values.NODE_VERSION} <${Number(values.NODE_VERSION) + 1}` } };
    // pnpm and Bun write their lockfile with the first dependency. A frozen install passes without one until then.
    return { packagePath, packageJson, fragment, lockPath: ['pnpm', 'bun'].includes(values.PACKAGE_MANAGER_CACHE) ? null : lockPath, packageManager: values.PACKAGE_MANAGER_CACHE };
  }
  if (!packageJson || typeof packageJson !== 'object' || Array.isArray(packageJson)) throw new Error('package.json must contain an object.');
  if (packageJson.scripts !== undefined && (!packageJson.scripts || typeof packageJson.scripts !== 'object' || Array.isArray(packageJson.scripts))) {
    throw new Error('package.json scripts must be an object.');
  }
  const selectedLockPath = path.join(targetDir, values.PACKAGE_MANAGER_LOCKFILE);
  await assertNoSymlink(targetDir, selectedLockPath);
  let lockStat;
  try {
    lockStat = await fs.stat(selectedLockPath);
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`Selected package-manager lockfile is missing: ${values.PACKAGE_MANAGER_LOCKFILE}`);
    throw error;
  }
  if (!lockStat.isFile()) throw new Error(`Selected package-manager lockfile is not a file: ${values.PACKAGE_MANAGER_LOCKFILE}`);
  return { packagePath, packageJson, fragment, lockPath: null };
}

async function mergePackageScripts(plan) {
  const scripts = { ...(plan.packageJson.scripts ?? {}) };
  const conflicts = [];
  for (const [name, command] of Object.entries(plan.fragment.scripts ?? {})) {
    if (Object.hasOwn(scripts, name) && scripts[name] !== command) conflicts.push(name);
    else scripts[name] = command;
  }
  const packageJson = { ...plan.packageJson, scripts };
  await fs.writeFile(plan.packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
  if (plan.packageManager === 'pnpm') {
    // Supply-chain settings: wait one day for new releases, and fail on peer dependency and engine conflicts.
    await fs.writeFile(path.join(path.dirname(plan.packagePath), 'pnpm-workspace.yaml'), 'minimumReleaseAge: 1440\nstrictPeerDependencies: true\nengineStrict: true\n', { encoding: 'utf8', flag: 'wx' })
      .catch((error) => { if (error?.code !== 'EEXIST') throw error; });
  }
  if (plan.lockPath) {
    await fs.writeFile(plan.lockPath, `${JSON.stringify({
      name: packageJson.name,
      version: packageJson.version,
      lockfileVersion: 3,
      requires: true,
      packages: { '': { name: packageJson.name, version: packageJson.version, engines: packageJson.engines } }
    }, null, 2)}\n`, 'utf8');
  }
  return conflicts;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const baselineOnly = options['baseline-only'] === 'true';
  if (options['bootstrap-policy'] && !baselineOnly) throw new Error('--bootstrap-policy is only supported with --baseline-only true.');
  const targetDir = await fs.realpath(path.resolve(options.target));
  const decisionsPath = await fs.realpath(path.resolve(options.decisions));
  if (!isWithin(targetDir, decisionsPath)) throw new Error('Decision packet must be inside the target repository.');
  if (!(await fs.stat(targetDir)).isDirectory()) throw new Error('Target must be a directory.');
  await assertNoSymlink(targetDir, decisionsPath);
  await assertNoSymlink(targetDir, path.join(targetDir, 'package.json'));
  const manifestPath = path.join(targetDir, 'docs', 'ops', 'automation', 'harness-manifest.json');
  await assertNoSymlink(targetDir, manifestPath);
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  if (!Array.isArray(manifest.managedFiles) || !manifest.sourceManifest) throw new Error('Target does not contain a valid installed harness manifest.');
  const sourceManifestContent = await fs.readFile(sourceManifestPath);
  if (manifest.sourceManifestSha256 !== sha256(sourceManifestContent)) throw new Error('Installed harness manifest does not match the current source manifest.');
  const sourceManifest = JSON.parse(sourceManifestContent);
  const expectedManaged = await collectSourceFiles(sourceManifest);
  const installedManaged = new Set(manifest.managedFiles.map((entry) => `${entry.sourcePath}\0${entry.targetPath}`));
  const expectedKeys = new Set(expectedManaged.map((entry) => `${entry.sourcePath}\0${entry.targetPath}`));
  let bootstrapOnlyGlobs = [];
  let projectOwnedGlobs = [];
  if (options['bootstrap-policy']) {
    // The caller supplies policy from its reviewed blueprint, never from the target repository.
    const policy = JSON.parse(await fs.readFile(path.resolve(options['bootstrap-policy']), 'utf8'));
    if (policy.schemaVersion !== 1 || policy.ownershipMode !== sourceManifest.ownershipMode || policy.sourceRoot !== sourceManifest.sourceRoot || policy.targetRoot !== sourceManifest.targetRoot || !Array.isArray(policy.bootstrapOnlyGlobs) || policy.bootstrapOnlyGlobs.some((pattern) => typeof pattern !== 'string' || !pattern.trim())) {
      throw new Error('Bootstrap policy must be a compatible reviewed ownership manifest with bootstrapOnlyGlobs.');
    }
    if (policy.projectOwnedGlobs !== undefined && (!Array.isArray(policy.projectOwnedGlobs) || policy.projectOwnedGlobs.some((pattern) => typeof pattern !== 'string' || !pattern.trim()))) {
      throw new Error('Bootstrap policy projectOwnedGlobs must be an array of non-empty patterns.');
    }
    bootstrapOnlyGlobs = policy.bootstrapOnlyGlobs;
    projectOwnedGlobs = policy.projectOwnedGlobs ?? [];
  }
  const omitted = expectedManaged.filter((entry) => !installedManaged.has(`${entry.sourcePath}\0${entry.targetPath}`));
  const missingRequired = omitted.filter((entry) => !bootstrapOnlyGlobs.some((pattern) => path.posix.matchesGlob(path.posix.relative(sourceManifest.sourceRoot, entry.sourcePath), pattern)));
  if (installedManaged.size !== manifest.managedFiles.length || [...installedManaged].some((key) => !expectedKeys.has(key)) || missingRequired.length) {
    throw new Error(`Installed harness manifest does not contain the complete managed file set. Missing required files: ${missingRequired.map((entry) => entry.targetPath).join(', ') || 'none'}; duplicate or unexpected entries are not supported.`);
  }
  const revision = currentRevision();
  if (manifest.sourceRevision !== revision) throw new Error(`Blueprint source revision does not match the installed harness: ${manifest.sourceRevision} != ${revision}.`);
  const projectFiles = manifest.projectFiles ?? [];
  const omittedKeys = new Set(omitted.map((entry) => `${entry.sourcePath}\0${entry.targetPath}`));
  const expectedInstalled = (await collectSourceFiles(sourceManifest, { includeProjectOwned: true }))
    .filter((entry) => !omittedKeys.has(`${entry.sourcePath}\0${entry.targetPath}`));
  const installedFiles = [...manifest.managedFiles, ...projectFiles];
  const installedPaths = new Set(installedFiles.map((entry) => `${entry.sourcePath}\0${entry.targetPath}`));
  if (installedFiles.length !== expectedInstalled.length || expectedInstalled.some((entry) => !installedPaths.has(`${entry.sourcePath}\0${entry.targetPath}`))) {
    throw new Error('Installed harness manifest does not contain the complete installed file set.');
  }
  for (const entry of installedFiles) {
    const sourcePath = path.resolve(rootDir, String(entry.sourcePath ?? ''));
    const targetPath = path.resolve(targetDir, String(entry.targetPath ?? ''));
    if (!isWithin(path.join(rootDir, 'template'), sourcePath)) throw new Error(`Installed manifest contains an invalid source path: ${entry.sourcePath}`);
    if (!isWithin(targetDir, targetPath)) throw new Error(`Installed manifest contains an invalid target path: ${entry.targetPath}`);
    await assertNoSymlink(targetDir, targetPath);
    let source;
    let targetStat;
    try {
      source = await fs.readFile(sourcePath);
    } catch (error) {
      if (error?.code === 'ENOENT') throw new Error(`Blueprint source revision is missing installed file: ${entry.sourcePath}`);
      throw error;
    }
    try {
      targetStat = await fs.stat(targetPath);
    } catch (error) {
      if (error?.code === 'ENOENT') throw new Error(`Installed harness file is missing: ${entry.targetPath}`);
      throw error;
    }
    if (!targetStat.isFile()) throw new Error(`Installed harness path is not a file: ${entry.targetPath}`);
    if (sha256(source) !== entry.sha256) throw new Error(`Blueprint source does not match the installed harness for ${entry.targetPath}.`);
  }
  const { decisions, expected } = await loadDecisions(targetDir, decisionsPath);
  const releasedProjectOwned = new Set(manifest.managedFiles
    .filter((entry) => {
      const relativePath = path.posix.relative(sourceManifest.sourceRoot, entry.sourcePath);
      // Bootstrap-only rules take precedence over project ownership, as in harness-sync.
      return !bootstrapOnlyGlobs.some((pattern) => path.posix.matchesGlob(relativePath, pattern)) &&
        projectOwnedGlobs.some((pattern) => path.posix.matchesGlob(relativePath, pattern));
    })
    .map((entry) => entry.targetPath));
  const configuredEntries = await Promise.all(manifest.managedFiles.map(async (entry) => {
    // The reviewed updater releases these paths. Do not invent retired decisions or a historical configured baseline.
    if (releasedProjectOwned.has(entry.targetPath)) return { ...entry, preservedLocal: true };
    const configured = configureContent(entry.targetPath, await fs.readFile(path.join(rootDir, entry.sourcePath)), decisions.values);
    return { ...entry, configuredSha256: sha256(configured) };
  }));
  if (baselineOnly && manifest.managedFiles.every((entry) => entry.configuredSha256)) {
    throw new Error('The installed harness manifest already has a configured baseline.');
  }
  const packageConfiguration = baselineOnly ? null : await packagePlan(targetDir, decisions.values);
  const changedFiles = baselineOnly ? [] : await replacePlaceholders(targetDir, decisions.values, expected);
  const scriptConflicts = baselineOnly ? [] : await mergePackageScripts(packageConfiguration);
  // Never bless preserved adoption files or later local edits as template-owned content.
  for (const entry of configuredEntries) {
    if (releasedProjectOwned.has(entry.targetPath)) continue;
    const actualHash = sha256(await fs.readFile(path.join(targetDir, entry.targetPath)));
    entry.preservedLocal = actualHash !== entry.configuredSha256;
    entry.configuredSha256 = actualHash;
  }
  await writeTextFileAtomic(manifestPath, `${JSON.stringify({ ...manifest,
    decisionsPath: path.relative(targetDir, decisionsPath).replaceAll(path.sep, '/'),
    managedFiles: configuredEntries
  }, null, 2)}\n`);
  const payload = { target: targetDir, changedFiles, scriptConflicts, omittedBootstrapOnly: omitted.map((entry) => entry.targetPath), releasedProjectOwned: [...releasedProjectOwned] };
  if (options.json === 'true') process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  else process.stdout.write(`[bootstrap-configure] changed=${changedFiles.length} scriptConflicts=${scriptConflicts.length}\n`);
}

if (await fs.realpath(process.argv[1] ?? '').catch(() => '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[bootstrap-configure] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
