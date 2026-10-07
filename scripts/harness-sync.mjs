#!/usr/bin/env node
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  CONTRACT_IDS,
  parseContractPayload,
  prepareContractPayload
} from '../template/scripts/automation/lib/contracts/index.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const sourceManifestPath = path.join(rootDir, 'distribution', 'harness-ownership-manifest.json');
const sourceManifestId = toPosix(path.relative(rootDir, sourceManifestPath));
const defaultDownstreamManifestRel = path.join('docs', 'ops', 'automation', 'harness-manifest.json');

function parseArgs(argv) {
  const [command = '', ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) {
      continue;
    }
    const key = token.slice(2);
    const next = rest[index + 1];
    if (!next || next.startsWith('--')) {
      options[key] = true;
      continue;
    }
    options[key] = next;
    index += 1;
  }
  return { command, options };
}

function asBoolean(value, fallback = false) {
  if (value == null) return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return fallback;
}

function usage() {
  process.stderr.write(
    'Usage: node ./scripts/harness-sync.mjs <install|adopt|update|drift|reconcile> --target <path> [--json true|false] [--decisions <path>] [--review <repo-relative-path>]\n'
  );
}

function toPosix(value) {
  return String(value ?? '').replaceAll('\\', '/');
}

function isWithinDirectory(baseDir, candidatePath) {
  const relative = path.relative(path.resolve(baseDir), path.resolve(candidatePath));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function assertWithinDirectory(baseDir, candidatePath, label) {
  if (!isWithinDirectory(baseDir, candidatePath)) {
    throw new Error(`${label} escapes target directory: ${toPosix(candidatePath)}`);
  }
}

function assertSafeRelativePath(relativePath, label) {
  const raw = String(relativePath ?? '').trim();
  const normalized = normalizePattern(raw);
  if (
    !normalized ||
    normalized === '.' ||
    path.isAbsolute(raw) ||
    path.win32.isAbsolute(raw) ||
    path.isAbsolute(normalized) ||
    path.win32.isAbsolute(normalized) ||
    normalized.split('/').includes('..')
  ) {
    throw new Error(`${label} must be a non-empty repository-relative path: ${String(relativePath)}`);
  }
  return normalized;
}

async function assertNoTargetSymlink(targetDir, relativePath) {
  let current = targetDir;
  for (const segment of assertSafeRelativePath(relativePath, 'target path').split('/')) {
    current = path.join(current, segment);
    try {
      if ((await fs.lstat(current)).isSymbolicLink()) {
        throw new Error(`[TARGET_SYMLINK] Target path '${relativePath}' traverses a symbolic link.`);
      }
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      if (error?.code === 'ENOTDIR') {
        throw new Error(`[TARGET_PATH_CONFLICT] Target file path '${relativePath}' has a non-directory parent.`);
      }
      throw error;
    }
  }
}

async function assertTargetFileShape(targetDir, relativePath) {
  await assertNoTargetSymlink(targetDir, relativePath);
  try {
    if (!(await fs.lstat(path.join(targetDir, relativePath))).isFile()) {
      throw new Error(`[TARGET_PATH_CONFLICT] Target file path '${relativePath}' is occupied by a non-file.`);
    }
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
}

async function canonicalTargetPath(value) {
  const absolute = path.resolve(value);
  try {
    return await fs.realpath(absolute);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const missing = [];
  let current = absolute;
  while (true) {
    missing.unshift(path.basename(current));
    current = path.dirname(current);
    try {
      return path.join(await fs.realpath(current), ...missing);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

export async function writeTextFileAtomic(filePath, content, encoding = 'utf8') {
  const directory = path.dirname(filePath);
  const tempPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`
  );
  await fs.mkdir(directory, { recursive: true });
  let handle = null;
  try {
    handle = await fs.open(tempPath, 'w');
    await handle.writeFile(content, encoding);
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(tempPath, filePath);
  } catch (error) {
    if (handle) {
      await handle.close().catch(() => {});
    }
    await fs.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}

async function walkFiles(baseDir, currentDir = baseDir) {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(baseDir, absPath));
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    files.push(absPath);
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function normalizePattern(value) {
  return toPosix(String(value ?? '').trim()).replace(/^\.?\//, '');
}

function matchesExcludePattern(relativePath, pattern) {
  const normalizedPath = normalizePattern(relativePath);
  const normalizedPattern = normalizePattern(pattern);
  if (!normalizedPattern) {
    return false;
  }
  if (normalizedPattern === '**' || normalizedPattern === '**/*') {
    return true;
  }
  if (typeof path.posix.matchesGlob === 'function') {
    return path.posix.matchesGlob(normalizedPath, normalizedPattern);
  }
  return normalizedPath === normalizedPattern || normalizedPath.endsWith(`/${normalizedPattern}`);
}

function matchesManagedPattern(relativePath, pattern) {
  return matchesExcludePattern(relativePath, pattern);
}

function isExcluded(relativePath, manifest) {
  const patterns = Array.isArray(manifest?.excludeGlobs) ? manifest.excludeGlobs : [];
  return patterns.some((pattern) => matchesExcludePattern(relativePath, pattern));
}

function isManaged(relativePath, manifest) {
  const patterns = Array.isArray(manifest?.managedGlobs) && manifest.managedGlobs.length > 0
    ? manifest.managedGlobs
    : ['**/*'];
  return patterns.some((pattern) => matchesManagedPattern(relativePath, pattern));
}

function isBootstrapOnly(relativePath, manifest) {
  const patterns = Array.isArray(manifest?.bootstrapOnlyGlobs) ? manifest.bootstrapOnlyGlobs : [];
  return patterns.some((pattern) => matchesManagedPattern(relativePath, pattern));
}

function isProjectOwned(relativePath, manifest) {
  return !isBootstrapOnly(relativePath, manifest) &&
    (manifest.projectOwnedGlobs ?? []).some((pattern) => matchesManagedPattern(relativePath, pattern));
}

async function sha256(filePath) {
  const buffer = await fs.readFile(filePath);
  return createHash('sha256').update(buffer).digest('hex');
}

function gitHeadRevision() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: rootDir,
    stdio: ['ignore', 'pipe', 'ignore']
  });
  if (result.status !== 0) {
    return null;
  }
  const value = String(result.stdout ?? '').trim();
  return value || null;
}

export async function collectSourceFiles(manifest, { includeBootstrapOnly = false, includeProjectOwned = false } = {}) {
  const sourceRoot = path.join(rootDir, manifest.sourceRoot);
  const targetRoot = String(manifest.targetRoot ?? '.').trim() || '.';
  assertWithinDirectory(rootDir, sourceRoot, 'sourceRoot');
  const files = await walkFiles(sourceRoot);
  const entries = [];
  for (const absPath of files) {
    const relFromSource = toPosix(path.relative(sourceRoot, absPath));
    if (!isManaged(relFromSource, manifest)) {
      continue;
    }
    if (isExcluded(relFromSource, manifest)) {
      continue;
    }
    if (isProjectOwned(relFromSource, manifest) && !includeProjectOwned) continue;
    if (isBootstrapOnly(relFromSource, manifest) && !includeBootstrapOnly) {
      continue;
    }
    const stat = await fs.stat(absPath);
    const targetPath = assertSafeRelativePath(path.join(targetRoot, relFromSource), 'managed targetPath');
    entries.push({
      sourcePath: toPosix(path.relative(rootDir, absPath)),
      targetPath: toPosix(targetPath),
      sha256: await sha256(absPath),
      size: stat.size
    });
  }
  return entries;
}

function downstreamManifestRel(manifest) {
  return assertSafeRelativePath(
    String(manifest?.downstreamManifestPath ?? defaultDownstreamManifestRel).trim() || defaultDownstreamManifestRel,
    'downstreamManifestPath'
  );
}

async function loadDownstreamManifest(targetDir, manifest) {
  const filePath = path.join(targetDir, downstreamManifestRel(manifest));
  try {
    return {
      exists: true,
      valid: true,
      filePath,
      manifest: parseContractPayload(CONTRACT_IDS.downstreamHarnessManifest, await readJson(filePath))
    };
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {
        exists: false,
        valid: false,
        filePath,
        manifest: null,
        errorCode: 'ENOENT',
        error
      };
    }
    return {
      exists: true,
      valid: false,
      filePath,
      manifest: null,
      errorCode: error?.code ?? 'INVALID_JSON',
      error
    };
  }
}

function isCompatibleSourceManifestRef(value) {
  const normalized = toPosix(String(value ?? '').trim());
  if (!normalized) {
    return false;
  }
  return normalized === sourceManifestId || normalized.endsWith(`/${sourceManifestId}`);
}

function validateDownstreamManifest(manifestState, sourceManifest) {
  if (!manifestState?.exists) {
    return {
      ok: false,
      code: 'DOWNSTREAM_MANIFEST_MISSING',
      message: `Missing downstream harness manifest at ${downstreamManifestRel(sourceManifest)}.`
    };
  }
  if (!manifestState.valid) {
    return {
      ok: false,
      code: 'DOWNSTREAM_MANIFEST_INVALID',
      message: `Invalid downstream harness manifest at ${downstreamManifestRel(sourceManifest)}.`
    };
  }

  let payload;
  try {
    payload = parseContractPayload(CONTRACT_IDS.downstreamHarnessManifest, manifestState.manifest);
  } catch (error) {
    return {
      ok: false,
      code: 'DOWNSTREAM_MANIFEST_SCHEMA_MISMATCH',
      message: error instanceof Error ? error.message : 'Unsupported downstream harness manifest schema.'
    };
  }
  if (payload?.ownershipMode !== sourceManifest.ownershipMode) {
    return {
      ok: false,
      code: 'DOWNSTREAM_MANIFEST_OWNERSHIP_MISMATCH',
      message: `Downstream harness manifest ownershipMode '${payload?.ownershipMode ?? 'unknown'}' does not match expected '${sourceManifest.ownershipMode}'.`
    };
  }
  if (!Array.isArray(payload?.managedFiles)) {
    return {
      ok: false,
      code: 'DOWNSTREAM_MANIFEST_MANAGED_FILES_INVALID',
      message: 'Downstream harness manifest must include a managedFiles array.'
    };
  }
  if (payload.sourceManifest && !isCompatibleSourceManifestRef(payload.sourceManifest)) {
    return {
      ok: false,
      code: 'DOWNSTREAM_MANIFEST_SOURCE_MISMATCH',
      message: `Downstream harness manifest source '${payload.sourceManifest}' does not reference '${sourceManifestId}'.`
    };
  }
  return { ok: true, manifest: payload };
}

async function compareTarget(targetDir, sourceEntries, installedManifest = null) {
  const exact = [];
  const missing = [];
  const modified = [];
  const managedSet = new Set();

  for (const entry of sourceEntries) {
    managedSet.add(entry.targetPath);
    const targetPath = path.join(targetDir, entry.targetPath);
    assertWithinDirectory(targetDir, targetPath, `managed file '${entry.targetPath}'`);
    try {
      await assertTargetFileShape(targetDir, entry.targetPath);
      const targetHash = await sha256(targetPath);
      const baseline = installedManifest?.managedFiles.find((item) => item.targetPath === entry.targetPath);
      if (baseline?.preservedLocal || targetHash !== (baseline?.configuredSha256 ?? entry.sha256) || (baseline && baseline.sha256 !== entry.sha256)) {
        modified.push(entry.targetPath);
      } else {
        exact.push(entry.targetPath);
      }
    } catch (error) {
      if (error?.code === 'ENOENT') missing.push(entry.targetPath);
      else if (/^\[TARGET_(?:PATH_CONFLICT|SYMLINK)\]/.test(error?.message)) modified.push(entry.targetPath);
      else throw error;
    }
  }

  const unexpectedManaged = [];
  for (const entry of installedManifest?.managedFiles ?? []) {
    const targetPath = String(entry?.targetPath ?? '').trim();
    if (!targetPath || managedSet.has(targetPath)) {
      continue;
    }
    assertSafeRelativePath(targetPath, 'installed managed targetPath');
    unexpectedManaged.push(targetPath);
  }

  return {
    exact: exact.sort((left, right) => left.localeCompare(right)),
    missing: missing.sort((left, right) => left.localeCompare(right)),
    modified: modified.sort((left, right) => left.localeCompare(right)),
    unexpectedManaged: unexpectedManaged.sort((left, right) => left.localeCompare(right))
  };
}

async function governedPlaceholders(sourceEntries) {
  const placeholders = new Set();
  for (const entry of sourceEntries) {
    const content = await fs.readFile(path.join(rootDir, entry.sourcePath), 'utf8');
    for (const match of content.matchAll(/\{\{([A-Z0-9_]+)\}\}/g)) placeholders.add(match[1]);
  }
  return [...placeholders].sort((left, right) => left.localeCompare(right));
}

async function writeDownstreamManifest(targetDir, manifest, sourceEntries, decisionsPath, reconciliation) {
  const manifestRel = downstreamManifestRel(manifest);
  const downstreamManifestPath = path.join(targetDir, manifestRel);
  await assertNoTargetSymlink(targetDir, manifestRel);
  const installedEntries = await collectSourceFiles(manifest, { includeProjectOwned: true });
  const payload = prepareContractPayload(CONTRACT_IDS.downstreamHarnessManifest, {
    ownershipMode: manifest.ownershipMode,
    sourceManifest: sourceManifestId,
    sourceManifestSha256: await sha256(sourceManifestPath),
    sourceRevision: gitHeadRevision(),
    installedAt: new Date().toISOString(),
    governedPlaceholders: await governedPlaceholders(installedEntries),
    projectFiles: installedEntries
      .filter((entry) => isProjectOwned(toPosix(path.relative(manifest.targetRoot, entry.targetPath)), manifest)),
    managedFiles: sourceEntries,
    ...(decisionsPath ? { decisionsPath } : {}),
    ...(reconciliation ? { reconciliation } : {})
  });
  await writeTextFileAtomic(downstreamManifestPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function recordReconciliation(targetDir, sourceManifest, sourceEntries, installedManifest, reviewOption) {
  const reviewPath = assertSafeRelativePath(reviewOption, 'review path');
  await assertTargetFileShape(targetDir, reviewPath);
  const reviewContent = await fs.readFile(path.join(targetDir, reviewPath));
  const reviewSha256 = createHash('sha256').update(reviewContent).digest('hex');
  const review = JSON.parse(reviewContent);
  assert(review.version === 1 && review.action === 'record-reconciliation', 'Unsupported reconciliation review.');
  assert(typeof review.approvedAt === 'string' && /Z$/.test(review.approvedAt) &&
    Number.isFinite(Date.parse(review.approvedAt)) && Date.parse(review.approvedAt) <= Date.now(),
  'Reconciliation requires a dated, approved review.');
  assert(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(review.sourceRevision) &&
    review.sourceRevision === gitHeadRevision(), 'Reviewed source revision changed.');
  assert(review.sourceManifestSha256 === await sha256(sourceManifestPath), 'Reviewed source manifest changed.');
  const installedPath = path.join(targetDir, downstreamManifestRel(sourceManifest));
  assert(review.installedManifestSha256 === await sha256(installedPath), 'Reviewed installed manifest changed.');

  const { loadDecisions, configureContent } = await import('./bootstrap-configure.mjs');
  assert(typeof review.decisionsPath === 'string' && review.decisionsPath.trim(), 'Review must name its decision packet.');
  const { decisions, decisionsPath } = await loadDecisions(targetDir,
    path.join(targetDir, assertSafeRelativePath(review.decisionsPath, 'review decisions path')));
  assert(review.decisionsSha256 === await sha256(decisionsPath), 'Reviewed decisions changed.');
  const incoming = new Map(sourceEntries.map((entry) => [entry.targetPath, entry]));
  const previousPaths = installedManifest.managedFiles.map((entry) => entry.targetPath);
  assert(new Set(previousPaths).size === previousPaths.length, 'Installed manifest contains duplicate paths.');
  const requiredPaths = new Set([...previousPaths, ...incoming.keys()]);
  assert(!requiredPaths.has(reviewPath) && path.join(targetDir, reviewPath) !== installedPath &&
    path.join(targetDir, reviewPath) !== decisionsPath, 'Review must be a separate evidence file.');
  assert(Array.isArray(review.files) && review.files.length === requiredPaths.size, 'Review must cover the complete managed file set.');
  const seen = new Set();
  for (const file of review.files) {
    assert(requiredPaths.has(file.targetPath) && !seen.has(file.targetPath), 'Review contains an unexpected or duplicate path.');
    seen.add(file.targetPath);
    await assertTargetFileShape(targetDir, file.targetPath);
    const currentHash = await sha256(path.join(targetDir, file.targetPath)).catch((error) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    assert(file.currentSha256 === currentHash, `Reviewed target changed: ${file.targetPath}`);
    const entry = incoming.get(file.targetPath);
    if (!entry) {
      assert(file.resolution === 'retired' && file.sourceSha256 === null && file.configuredSha256 === null,
        `Retired path needs an explicit review: ${file.targetPath}`);
      continue; // Recording provenance never deletes retained historical files.
    }
    const raw = await fs.readFile(path.join(rootDir, entry.sourcePath));
    assert(file.sourceSha256 === createHash('sha256').update(raw).digest('hex'),
      `Reviewed source file changed: ${file.targetPath}`);
    const expected = createHash('sha256').update(configureContent(entry.targetPath, raw, decisions.values)).digest('hex');
    assert(file.sourceSha256 === entry.sha256 && file.configuredSha256 === expected,
      `Reviewed incoming template changed: ${file.targetPath}`);
    assert(currentHash !== null, `Required managed file is missing: ${file.targetPath}`);
    const customized = currentHash !== expected;
    assert(file.resolution === (customized ? 'preserve-local' : 'configured'),
      `Incorrect resolution for ${file.targetPath}; customizations must remain preserved.`);
    entry.configuredSha256 = currentHash;
    entry.preservedLocal = customized;
  }
  // No content writes occurred. Recheck reviewed inputs before the manifest-only write.
  for (const file of review.files) {
    const entry = incoming.get(file.targetPath);
    if (entry) assert(file.sourceSha256 === await sha256(path.join(rootDir, entry.sourcePath)),
      `Reviewed source file changed: ${file.targetPath}`);
    await assertTargetFileShape(targetDir, file.targetPath);
    const current = await sha256(path.join(targetDir, file.targetPath)).catch((error) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    assert(current === file.currentSha256, `Reviewed target changed: ${file.targetPath}`);
  }
  assert(review.sourceRevision === gitHeadRevision(), 'Reviewed source revision changed.');
  assert(review.sourceManifestSha256 === await sha256(sourceManifestPath), 'Reviewed source manifest changed.');
  assert(review.installedManifestSha256 === await sha256(installedPath), 'Reviewed installed manifest changed.');
  assert(review.decisionsSha256 === await sha256(decisionsPath), 'Reviewed decisions changed.');
  assert(reviewSha256 === await sha256(path.join(targetDir, reviewPath)), 'Reconciliation review changed.');
  await writeDownstreamManifest(targetDir, sourceManifest, sourceEntries,
    toPosix(path.relative(targetDir, decisionsPath)), { reviewPath, reviewSha256 });
  return sourceEntries.filter((entry) => entry.preservedLocal).map((entry) => entry.targetPath);
}

async function pruneEmptyDirectories(baseDir, directoryPath) {
  const normalizedBase = path.resolve(baseDir);
  let current = directoryPath;
  while (current.startsWith(normalizedBase) && current !== normalizedBase) {
    let entries = [];
    try {
      entries = await fs.readdir(current);
    } catch {
      return;
    }
    if (entries.length > 0) {
      return;
    }
    await fs.rmdir(current).catch(() => {});
    current = path.dirname(current);
  }
}

async function removeRetiredManagedFiles(targetDir, sourceEntries, installedManifest) {
  const currentManaged = new Set(sourceEntries.map((entry) => entry.targetPath));
  const removed = [];
  for (const entry of installedManifest?.managedFiles ?? []) {
    const targetPathRel = assertSafeRelativePath(String(entry?.targetPath ?? '').trim(), 'installed managed targetPath');
    if (!targetPathRel || currentManaged.has(targetPathRel)) {
      continue;
    }
    const targetPathAbs = path.join(targetDir, targetPathRel);
    assertWithinDirectory(targetDir, targetPathAbs, `retired managed file '${targetPathRel}'`);
    await assertNoTargetSymlink(targetDir, targetPathRel);
    await fs.rm(targetPathAbs, { force: true });
    await pruneEmptyDirectories(targetDir, path.dirname(targetPathAbs));
    removed.push(targetPathRel);
  }
  return removed.sort((left, right) => left.localeCompare(right));
}

async function adoptWithoutOverwrite(targetDir, manifest, copyEntries, managedEntries) {
  const copied = [];
  const preserved = [];
  for (const entry of copyEntries) {
    const sourcePath = path.join(rootDir, entry.sourcePath);
    const targetPath = path.join(targetDir, entry.targetPath);
    assertWithinDirectory(rootDir, sourcePath, `source file '${entry.sourcePath}'`);
    assertWithinDirectory(targetDir, targetPath, `target file '${entry.targetPath}'`);
    await assertNoTargetSymlink(targetDir, entry.targetPath);
    try {
      const currentHash = await sha256(targetPath);
      if (currentHash !== entry.sha256) preserved.push(entry.targetPath);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.copyFile(sourcePath, targetPath);
      copied.push(entry.targetPath);
    }
  }
  await writeDownstreamManifest(targetDir, manifest, managedEntries);
  return { copied, preserved };
}

async function locallyModifiedManagedFiles(targetDir, installedManifest, sourceEntries) {
  const modified = [];
  const installed = new Map((installedManifest?.managedFiles ?? []).map((entry) => [entry.targetPath, entry]));
  const incoming = new Map(sourceEntries.map((entry) => [entry.targetPath, entry]));
  for (const entry of installed.values()) {
    const targetPathRel = assertSafeRelativePath(entry.targetPath, 'installed managed targetPath');
    try {
      const currentHash = await sha256(path.join(targetDir, targetPathRel));
      const incomingHash = incoming.get(targetPathRel)?.configuredSha256;
      if ((entry.preservedLocal && currentHash !== incomingHash) || (currentHash !== entry.configuredSha256 && currentHash !== incomingHash)) modified.push(targetPathRel);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      if (incoming.has(targetPathRel)) modified.push(targetPathRel);
    }
  }
  for (const entry of sourceEntries) {
    if (installed.has(entry.targetPath)) continue;
    try {
      if (await sha256(path.join(targetDir, entry.targetPath)) !== entry.configuredSha256) modified.push(entry.targetPath);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  return [...new Set(modified)].sort((left, right) => left.localeCompare(right));
}

async function assertAdoptionCompatibility(targetDir) {
  const packagePath = path.join(targetDir, 'package.json');
  let packageStat;
  try {
    packageStat = await fs.lstat(packagePath);
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error('[ADOPTION_UNSUPPORTED] Adopt requires package.json and an npm, pnpm, or yarn lockfile. Use drift for audit-only repositories.');
    throw error;
  }
  if (!packageStat.isFile() || packageStat.isSymbolicLink()) throw new Error('[ADOPTION_UNSUPPORTED] package.json must be a regular file.');
  const lockfiles = ['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock'];
  for (const lockfile of lockfiles) {
    try {
      const lockStat = await fs.lstat(path.join(targetDir, lockfile));
      if (lockStat.isFile() && !lockStat.isSymbolicLink()) return;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  throw new Error('[ADOPTION_UNSUPPORTED] Adopt requires an npm, pnpm, or yarn lockfile. Use drift until the package manager is explicit.');
}

async function preflightTargetPaths(targetDir, manifest, copyEntries, managedEntries, installedManifest) {
  for (const entry of copyEntries) await assertTargetFileShape(targetDir, entry.targetPath);
  await assertTargetFileShape(targetDir, downstreamManifestRel(manifest));
  const currentManaged = new Set(managedEntries.map((entry) => entry.targetPath));
  for (const entry of installedManifest?.managedFiles ?? []) {
    const targetPathRel = assertSafeRelativePath(entry.targetPath, 'installed managed targetPath');
    if (!currentManaged.has(targetPathRel)) await assertTargetFileShape(targetDir, targetPathRel);
  }
}

async function installOrUpdate(targetDir, manifest, copyEntries, managedEntries, installedManifest = null, configured = null) {
  const removed = await removeRetiredManagedFiles(targetDir, managedEntries, installedManifest);
  const copied = [];
  for (const entry of copyEntries) {
    const sourcePath = path.join(rootDir, entry.sourcePath);
    const targetPath = path.join(targetDir, entry.targetPath);
    assertWithinDirectory(rootDir, sourcePath, `source file '${entry.sourcePath}'`);
    assertWithinDirectory(targetDir, targetPath, `target file '${entry.targetPath}'`);
    await assertNoTargetSymlink(targetDir, entry.targetPath);
    if (entry.targetPath === '.gitignore' && !installedManifest) {
      try {
        await fs.access(targetPath);
        continue;
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    if (configured) await writeTextFileAtomic(targetPath, configured.contents.get(entry.targetPath));
    else await fs.copyFile(sourcePath, targetPath);
    copied.push(entry.targetPath);
  }
  await writeDownstreamManifest(targetDir, manifest, managedEntries, configured?.decisionsPath);
  return { copied, removed };
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (!['install', 'adopt', 'update', 'drift', 'reconcile'].includes(command)) {
    usage();
    process.exit(1);
  }

  const targetDirRaw = String(options.target ?? '').trim();
  if (!targetDirRaw) {
    usage();
    process.exit(1);
  }

  const targetDir = await canonicalTargetPath(targetDirRaw);
  if (targetDir === rootDir || isWithinDirectory(path.join(rootDir, 'template'), targetDir)) {
    throw new Error('Target must be an adopted repository, not the blueprint root or template directory.');
  }
  const jsonOutput = asBoolean(options.json, false);
  const sourceManifest = await readJson(sourceManifestPath);
  const managedSourceEntries = await collectSourceFiles(sourceManifest);
  const allSourceEntries = await collectSourceFiles(sourceManifest, { includeBootstrapOnly: true, includeProjectOwned: true });
  const projectOwned = allSourceEntries
    .filter((entry) => isProjectOwned(toPosix(path.relative(sourceManifest.targetRoot, entry.targetPath)), sourceManifest))
    .map((entry) => entry.targetPath);
  const projectTargets = new Set(projectOwned);
  const managedTargets = new Set(managedSourceEntries.map((entry) => entry.targetPath));
  const bootstrapOnly = allSourceEntries
    .map((entry) => entry.targetPath)
    .filter((targetPath) => !managedTargets.has(targetPath) && !projectTargets.has(targetPath))
    .sort((left, right) => left.localeCompare(right));
  const copySourceEntries = command === 'install' || command === 'adopt' ? allSourceEntries : managedSourceEntries;
  const manifestState = await loadDownstreamManifest(targetDir, sourceManifest);
  const manifestValidation = validateDownstreamManifest(manifestState, sourceManifest);
  const installedManifest = manifestState.valid ? { ...manifestState.manifest } : null;
  // Compare upstream templates with the recorded source baseline, never with project prose.
  // Report before advancing the manifest so protected guidance changes remain reviewable.
  const projectBaseline = new Map([
    ...(installedManifest?.managedFiles ?? []), ...(installedManifest?.projectFiles ?? [])
  ].map((entry) => [entry.targetPath, entry.sha256]));
  const projectUpdatesAvailable = installedManifest ? allSourceEntries
    .filter((entry) => projectTargets.has(entry.targetPath) && projectBaseline.get(entry.targetPath) !== entry.sha256)
    .map((entry) => entry.targetPath).sort() : [];
  if (installedManifest && (command === 'update' || command === 'drift')) {
    // Release ownership without deleting or inspecting downstream project content.
    installedManifest.managedFiles = installedManifest.managedFiles.filter((entry) => {
      const target = assertSafeRelativePath(entry.targetPath, 'installed managed targetPath');
      return !isProjectOwned(toPosix(path.relative(sourceManifest.targetRoot, target)), sourceManifest);
    });
  }
  const drift = await compareTarget(targetDir, managedSourceEntries, installedManifest);
  const fullTemplateDrift = command === 'install' || command === 'adopt'
    ? await compareTarget(targetDir, allSourceEntries, installedManifest)
    : drift;

  if (!jsonOutput && projectUpdatesAvailable.length) {
    process.stdout.write(`[harness-sync] Project-owned template updates need manual reconciliation before advancing the baseline: ${projectUpdatesAvailable.join(', ')}\n`);
  }

  if (command === 'drift') {
    const payload = {
      command,
      target: targetDir,
      exact: drift.exact,
      missing: drift.missing,
      modified: drift.modified,
      bootstrapOnly,
      projectOwned,
      projectUpdatesAvailable,
      managedFileCount: managedSourceEntries.length,
      templatePayloadFileCount: allSourceEntries.length,
      unexpectedManaged: drift.unexpectedManaged,
      manifestStatus: manifestValidation.ok ? 'valid' : manifestState.exists ? 'invalid' : 'missing',
      manifestIssue: manifestValidation.ok ? null : { code: manifestValidation.code, message: manifestValidation.message },
      driftDetected: !manifestValidation.ok || drift.missing.length > 0 || drift.modified.length > 0 || drift.unexpectedManaged.length > 0
    };
    if (jsonOutput) {
      process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    } else {
      process.stdout.write(`[harness-sync] target=${payload.target}\n`);
      process.stdout.write(`[harness-sync] exact=${payload.exact.length} missing=${payload.missing.length} modified=${payload.modified.length} bootstrapOnly=${payload.bootstrapOnly.length} unexpectedManaged=${payload.unexpectedManaged.length}\n`);
    }
    process.exit(payload.driftDetected ? 2 : 0);
  }

  await preflightTargetPaths(targetDir, sourceManifest, copySourceEntries, managedSourceEntries, installedManifest);

  if (command === 'reconcile') {
    if (!manifestValidation.ok) throw new Error(`[${manifestValidation.code}] ${manifestValidation.message}`);
    const preserved = await recordReconciliation(targetDir, sourceManifest, managedSourceEntries, installedManifest, options.review);
    process.stdout.write(`${JSON.stringify({ command, target: targetDir, filesCopied: 0, filesRemoved: 0,
      filesPreserved: preserved.length, preserved, manifestPath: manifestState.filePath }, null, 2)}\n`);
    return;
  }

  if (command === 'install' && manifestState.exists) {
    throw new Error('[TARGET_ALREADY_INSTALLED] This target already has a harness manifest. Use update or drift.');
  }
  if (command === 'install' && fullTemplateDrift.modified.some((targetPath) => targetPath !== '.gitignore')) {
    throw new Error('[INSTALL_TARGET_NOT_EMPTY] Install refuses existing blueprint paths. Use adopt to preserve existing files.');
  }

  if (command === 'adopt' && manifestState.exists) {
    throw new Error('[TARGET_ALREADY_ADOPTED] This target already has a harness manifest. Use update or drift.');
  }
  if (command === 'adopt') {
    await assertAdoptionCompatibility(targetDir);
    const bootstrapConflicts = fullTemplateDrift.modified.filter((targetPath) => bootstrapOnly.includes(targetPath));
    if (bootstrapConflicts.length > 0) {
      throw new Error(`[BOOTSTRAP_PATH_CONFLICT] Resolve existing bootstrap helper path(s) before adoption: ${bootstrapConflicts.join(', ')}`);
    }
  }

  let configured = null;
  if (command === 'update') {
    if (!manifestValidation.ok) {
      throw new Error(`[${manifestValidation.code}] ${manifestValidation.message}`);
    }
    if (!installedManifest.decisionsPath || installedManifest.managedFiles.some((entry) => !/^[a-f0-9]{64}$/.test(entry.configuredSha256 ?? ''))) {
      throw new Error('[CONFIGURED_BASELINE_MISSING] Update requires a configured baseline. Back up local edits. In a checkout of the installed blueprint revision, copy the updated scripts/harness-sync.mjs and scripts/bootstrap-configure.mjs without changing templates. Run bootstrap-configure there with the approved decision packet and --baseline-only true. Reconcile preserved files, then retry update. Do not adopt again or copy raw hashes into the baseline.');
    }
    const { loadDecisions, configureContent } = await import('./bootstrap-configure.mjs');
    const { decisions, decisionsPath } = await loadDecisions(targetDir, options.decisions ?? installedManifest.decisionsPath);
    configured = { contents: new Map(), decisionsPath: toPosix(path.relative(targetDir, decisionsPath)) };
    // Prepare and validate every incoming template before any target mutation.
    for (const entry of managedSourceEntries) {
      const content = configureContent(entry.targetPath, await fs.readFile(path.join(rootDir, entry.sourcePath)), decisions.values);
      configured.contents.set(entry.targetPath, content);
      entry.configuredSha256 = createHash('sha256').update(content).digest('hex');
    }
    const locallyModified = await locallyModifiedManagedFiles(targetDir, installedManifest, managedSourceEntries);
    if (locallyModified.length > 0) {
      throw new Error(`[MODIFIED_MANAGED_FILES] Update refuses locally modified managed file(s): ${locallyModified.join(', ')}. Review and reconcile these files before retrying; force overwrite is not supported.`);
    }
  }

  await fs.mkdir(targetDir, { recursive: true });
  const writeResult = command === 'adopt'
    ? await adoptWithoutOverwrite(targetDir, sourceManifest, copySourceEntries, managedSourceEntries)
    : await installOrUpdate(
      targetDir,
      sourceManifest,
      copySourceEntries,
      managedSourceEntries,
      installedManifest,
      configured
    );
  const payload = {
    command,
    target: targetDir,
    filesCopied: writeResult.copied.length,
    filesRemoved: writeResult.removed?.length ?? 0,
    filesPreserved: writeResult.preserved?.length ?? 0,
    preserved: writeResult.preserved ?? [],
    projectUpdatesAvailable,
    manifestPath: toPosix(path.join(targetDir, downstreamManifestRel(sourceManifest)))
  };
  if (jsonOutput) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    process.stdout.write(
      `[harness-sync] ${command} target=${payload.target} filesCopied=${payload.filesCopied} filesRemoved=${payload.filesRemoved} filesPreserved=${payload.filesPreserved}\n`
    );
  }
}

if (await fs.realpath(process.argv[1] ?? '').catch(() => '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`[harness-sync] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
