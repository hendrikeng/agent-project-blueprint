import path from 'node:path';
import fs from 'node:fs/promises';

const SAFE_REPO_RELATIVE_PATH_REGEX = /^[A-Za-z0-9._/-]+$/;

export function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toPosix(value) {
  return String(value).split(path.sep).join('/');
}

function isWithinRoot(rootDir, absPath) {
  const relative = path.relative(rootDir, absPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function assertSafeRelativePath(relPath) {
  const normalized = toPosix(String(relPath ?? '').trim()).replace(/^\.?\//, '');
  if (!normalized || !SAFE_REPO_RELATIVE_PATH_REGEX.test(normalized)) {
    throw new Error(`Unsafe repository path '${relPath}'.`);
  }
  if (normalized.includes('../')) {
    throw new Error(`Repository path '${relPath}' escapes repository root.`);
  }
  return normalized;
}

export function resolveSafeRepoPath(rootDir, relPath, label = 'Repository path') {
  const normalized = assertSafeRelativePath(relPath);
  const abs = path.resolve(rootDir, normalized);
  if (!isWithinRoot(rootDir, abs)) {
    throw new Error(`${label} escapes repository root: '${normalized}'.`);
  }
  return {
    rel: toPosix(path.relative(rootDir, abs)),
    abs
  };
}

export async function assertNoRepoSymlinks(rootDir, relPath) {
  const target = resolveSafeRepoPath(rootDir, relPath);
  let current = rootDir;
  for (const part of target.rel.split('/')) {
    current = path.join(current, part);
    try {
      if ((await fs.lstat(current)).isSymbolicLink()) throw new Error(`Repository path contains a symlink: ${target.rel}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      break;
    }
  }
}
