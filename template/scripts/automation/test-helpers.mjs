import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const templateRoot = path.resolve(moduleDir, '../..');
export const repoRoot = path.basename(templateRoot) === 'template'
  ? path.dirname(templateRoot)
  : templateRoot;

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function copyHarnessFixture(tempRoot) {
  if (path.basename(templateRoot) === 'template') {
    await fs.cp(templateRoot, tempRoot, { recursive: true });
    return;
  }

  const fixtureEntries = [
    '.github',
    'AGENTS.md',
    'ARCHITECTURE.md',
    'README.md',
    'VISION.md',
    'docs',
    'scripts'
  ];
  for (const entry of fixtureEntries) {
    const source = path.join(templateRoot, entry);
    if (await pathExists(source)) {
      await fs.cp(source, path.join(tempRoot, entry), { recursive: true });
    }
  }
}

async function fixtureScripts() {
  const fragmentPath = path.join(templateRoot, 'package.scripts.fragment.json');
  if (await pathExists(fragmentPath)) {
    return JSON.parse(await fs.readFile(fragmentPath, 'utf8')).scripts;
  }
  return JSON.parse(await fs.readFile(path.join(templateRoot, 'package.json'), 'utf8')).scripts;
}

export async function createTemplateRepo(t) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-flat-queue-'));
  t.after(() => fs.rm(tempRoot, { recursive: true, force: true, maxRetries: 3 }));
  await copyHarnessFixture(tempRoot);
  const packageJson = {
    name: 'flat-queue-fixture',
    private: true,
    version: '0.0.0-test',
    type: 'module',
    engines: {
      node: '>=24 <25'
    },
    scripts: await fixtureScripts()
  };
  await fs.writeFile(path.join(tempRoot, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
  const gitInit = spawnSync('git', ['init'], { cwd: tempRoot, stdio: 'pipe' });
  if (gitInit.status !== 0) {
    throw new Error(String(gitInit.stderr ?? gitInit.stdout ?? 'git init failed'));
  }
  spawnSync('git', ['config', 'user.name', 'Harness Fixture'], { cwd: tempRoot, stdio: 'pipe' });
  spawnSync('git', ['config', 'user.email', 'harness-fixture@example.com'], { cwd: tempRoot, stdio: 'pipe' });
  const gitAdd = spawnSync('git', ['add', '.'], { cwd: tempRoot, stdio: 'pipe' });
  if (gitAdd.status !== 0) {
    throw new Error(String(gitAdd.stderr ?? gitAdd.stdout ?? 'git add failed'));
  }
  const gitCommit = spawnSync('git', ['commit', '-m', 'chore: seed fixture'], { cwd: tempRoot, stdio: 'pipe' });
  if (gitCommit.status !== 0) {
    throw new Error(String(gitCommit.stderr ?? gitCommit.stdout ?? 'git commit failed'));
  }
  return tempRoot;
}

export function runNode(scriptPath, args = [], cwd = repoRoot, env = {}) {
  return spawnSync('node', [scriptPath, ...args], {
    cwd,
    env: { ...process.env, ...env },
    stdio: 'pipe'
  });
}

export async function loadJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}
