import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { decisions } from './bootstrap-test-helpers.mjs';

async function configure(targetDir) {
  const packetPath = path.join(targetDir, 'decisions.json');
  await fs.writeFile(packetPath, JSON.stringify(await decisions()));
  const result = spawnSync(process.execPath, [path.join(repoRoot, 'scripts/bootstrap-configure.mjs'), '--target', targetDir, '--decisions', packetPath]);
  assert.equal(result.status, 0, String(result.stderr));
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scriptPath = path.join(repoRoot, 'scripts', 'harness-sync.mjs');
const bootstrapOnlyPaths = [
  'PLACEHOLDERS.md',
  'package.scripts.fragment.json',
  'scripts/bootstrap-verify.sh',
  'scripts/bootstrap-verify.test.mjs',
  'scripts/check-template-placeholders.mjs',
  'scripts/check-template-placeholders.sh',
  'scripts/check-template-placeholders.test.mjs',
  'scripts/cleanup-bootstrap-artifacts.mjs',
  'scripts/cleanup-bootstrap-artifacts.test.mjs'
];

function run(args, cwd = repoRoot) {
  return spawnSync('node', [scriptPath, ...args], {
    cwd,
    stdio: 'pipe'
  });
}

test('harness-sync install writes target files and downstream manifest', async () => {
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-sync-install-'));
  const result = run(['install', '--target', targetDir]);
  assert.equal(result.status, 0);

  const readme = await fs.readFile(path.join(targetDir, 'README.md'), 'utf8');
  assert.match(readme, /## Product Scope/);
  assert.match(readme, /## Operating Model/);
  assert.doesNotMatch(readme, /Agent Kickoff Prompts/);

  const manifest = JSON.parse(
    await fs.readFile(path.join(targetDir, 'docs', 'ops', 'automation', 'harness-manifest.json'), 'utf8')
  );
  assert.equal(Array.isArray(manifest.managedFiles), true);
  assert.equal(manifest.managedFiles.length > 10, true);
  assert.equal(typeof manifest.sourceRevision, 'string');
  assert.notEqual(manifest.sourceRevision.length, 0);
  assert.equal(manifest.sourceManifest, 'distribution/harness-ownership-manifest.json');
  assert.equal(typeof manifest.sourceManifestSha256, 'string');
  assert.equal(manifest.sourceManifestSha256.length, 64);
  assert.equal(manifest.governedPlaceholders.includes('PRODUCT'), true);
  assert.equal(manifest.governedPlaceholders.includes('EMAIL'), false);
  for (const relative of bootstrapOnlyPaths) {
    assert.equal(manifest.managedFiles.some((entry) => entry.targetPath === relative), false);
    await fs.access(path.join(targetDir, relative));
  }

  const repeated = run(['install', '--target', targetDir]);
  assert.equal(repeated.status, 1);
  assert.match(String(repeated.stderr), /TARGET_ALREADY_INSTALLED.*update or drift/);
});

test('harness-sync install creates nested target directories', async () => {
  const parentDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-sync-nested-'));
  const targetDir = path.join(parentDir, 'missing', 'project');
  const result = run(['install', '--target', targetDir]);
  assert.equal(result.status, 0, String(result.stderr));
  await fs.access(path.join(targetDir, 'AGENTS.md'));
});

test('harness-sync preserves existing project files during adoption', async () => {
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-sync-adopt-'));
  await fs.writeFile(path.join(targetDir, 'README.md'), '# Existing Project\n', 'utf8');
  await fs.writeFile(path.join(targetDir, 'package.json'), '{"name":"existing"}\n', 'utf8');
  await fs.writeFile(path.join(targetDir, 'npm-shrinkwrap.json'), '{"lockfileVersion":3}\n', 'utf8');

  const drift = run(['drift', '--target', targetDir, '--json', 'true']);
  assert.equal(drift.status, 2);
  assert.equal(JSON.parse(String(drift.stdout)).manifestStatus, 'missing');

  const install = run(['install', '--target', targetDir]);
  assert.equal(install.status, 1);
  assert.match(String(install.stderr), /INSTALL_TARGET_NOT_EMPTY/);
  assert.equal(await fs.readFile(path.join(targetDir, 'README.md'), 'utf8'), '# Existing Project\n');

  const adopt = run(['adopt', '--target', targetDir, '--json', 'true']);
  assert.equal(adopt.status, 0);
  const payload = JSON.parse(String(adopt.stdout));
  assert.equal(payload.preserved.includes('README.md'), true);
  assert.equal(payload.filesCopied > 10, true);
  assert.equal(await fs.readFile(path.join(targetDir, 'README.md'), 'utf8'), '# Existing Project\n');
  await fs.access(path.join(targetDir, 'AGENTS.md'));
  await fs.access(path.join(targetDir, 'docs', 'ops', 'automation', 'harness-manifest.json'));
});

test('harness-sync rejects unsupported adoption before copying files', async () => {
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-sync-unsupported-'));
  await fs.writeFile(path.join(targetDir, 'README.md'), '# Existing Project\n', 'utf8');

  const result = run(['adopt', '--target', targetDir]);
  assert.equal(result.status, 1);
  assert.match(String(result.stderr), /ADOPTION_UNSUPPORTED/);
  assert.deepEqual(await fs.readdir(targetDir), ['README.md']);
});

test('harness-sync rejects bootstrap path collisions before copying files', async () => {
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-sync-bootstrap-conflict-'));
  await fs.writeFile(path.join(targetDir, 'package.json'), '{"name":"existing"}\n', 'utf8');
  await fs.writeFile(path.join(targetDir, 'yarn.lock'), '# lock\n', 'utf8');
  await fs.writeFile(path.join(targetDir, 'PLACEHOLDERS.md'), '# Existing contract\n', 'utf8');

  const result = run(['adopt', '--target', targetDir]);
  assert.equal(result.status, 1);
  assert.match(String(result.stderr), /BOOTSTRAP_PATH_CONFLICT/);
  assert.deepEqual((await fs.readdir(targetDir)).sort(), ['PLACEHOLDERS.md', 'package.json', 'yarn.lock']);
});

test('harness-sync propagates unreadable target errors before copying files', { skip: process.platform === 'win32' }, async () => {
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-sync-unreadable-'));
  const readmePath = path.join(targetDir, 'README.md');
  await fs.writeFile(readmePath, '# Existing\n', { mode: 0o200 });
  const result = run(['install', '--target', targetDir]);
  await fs.chmod(readmePath, 0o600);
  assert.equal(result.status, 1);
  await assert.rejects(fs.access(path.join(targetDir, 'AGENTS.md')));
});

test('harness-sync rejects non-file target collisions before copying files', async () => {
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-sync-directory-conflict-'));
  await fs.mkdir(path.join(targetDir, 'AGENTS.md'));

  const result = run(['install', '--target', targetDir]);
  assert.equal(result.status, 1);
  assert.match(String(result.stderr), /TARGET_PATH_CONFLICT/);
  assert.deepEqual(await fs.readdir(targetDir), ['AGENTS.md']);
});

test('harness-sync refuses target paths that traverse symbolic links', async () => {
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-sync-symlink-'));
  const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-sync-outside-'));
  await fs.symlink(outsideDir, path.join(targetDir, 'docs'));
  await fs.writeFile(path.join(targetDir, 'package.json'), '{"name":"existing"}\n', 'utf8');
  await fs.writeFile(path.join(targetDir, 'package-lock.json'), '{"lockfileVersion":3}\n', 'utf8');

  const result = run(['adopt', '--target', targetDir]);
  assert.equal(result.status, 1);
  assert.match(String(result.stderr), /TARGET_SYMLINK/);
  assert.deepEqual((await fs.readdir(targetDir)).sort(), ['docs', 'package-lock.json', 'package.json']);
  assert.deepEqual(await fs.readdir(outsideDir), []);
});

test('harness-sync treats bootstrap helpers as removable after adoption', async () => {
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-sync-bootstrap-only-'));
  assert.equal(run(['install', '--target', targetDir]).status, 0);

  for (const relative of bootstrapOnlyPaths) {
    await fs.rm(path.join(targetDir, relative));
  }

  const result = run(['drift', '--target', targetDir, '--json', 'true']);
  assert.equal(result.status, 0);
  const payload = JSON.parse(String(result.stdout));
  assert.equal(payload.exact.length, payload.managedFileCount);
  assert.equal(payload.templatePayloadFileCount, payload.managedFileCount + payload.bootstrapOnly.length + payload.projectOwned.length);
  assert.deepEqual(payload.bootstrapOnly, [...bootstrapOnlyPaths].sort((left, right) => left.localeCompare(right)));
  for (const relative of bootstrapOnlyPaths) {
    assert.equal(payload.missing.includes(relative), false);
  }
});

test('harness-sync drift treats a missing manifest as drift', async () => {
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-sync-manifest-drift-'));
  assert.equal(run(['install', '--target', targetDir]).status, 0);
  await fs.rm(path.join(targetDir, 'docs', 'ops', 'automation', 'harness-manifest.json'));

  const result = run(['drift', '--target', targetDir, '--json', 'true']);
  assert.equal(result.status, 2);
  const payload = JSON.parse(String(result.stdout));
  assert.equal(payload.manifestStatus, 'missing');
  assert.equal(payload.driftDetected, true);
});

test('harness-sync drift reports non-file managed paths as modified JSON', async () => {
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-sync-path-drift-'));
  assert.equal(run(['install', '--target', targetDir]).status, 0);
  await fs.rm(path.join(targetDir, 'docs/agent-hardening/RUN_CONTROL.md'));
  await fs.mkdir(path.join(targetDir, 'docs/agent-hardening/RUN_CONTROL.md'));

  const result = run(['drift', '--target', targetDir, '--json', 'true']);
  assert.equal(result.status, 2, String(result.stderr));
  assert.equal(JSON.parse(String(result.stdout)).modified.includes('docs/agent-hardening/RUN_CONTROL.md'), true);
});

test('harness-sync drift reports intermediate non-directory paths as modified JSON', async () => {
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-sync-parent-drift-'));
  assert.equal(run(['install', '--target', targetDir]).status, 0);
  await fs.rm(path.join(targetDir, 'docs'), { recursive: true });
  await fs.writeFile(path.join(targetDir, 'docs'), 'occupied\n', 'utf8');

  const result = run(['drift', '--target', targetDir, '--json', 'true']);
  assert.equal(result.status, 2, String(result.stderr));
  assert.equal(JSON.parse(String(result.stdout)).modified.some((entry) => entry.startsWith('docs/')), true);
});

test('harness-sync drift reports modified managed files', async () => {
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-sync-drift-'));
  assert.equal(run(['install', '--target', targetDir]).status, 0);

  await fs.writeFile(path.join(targetDir, 'docs/agent-hardening/RUN_CONTROL.md'), '# Modified\n', 'utf8');
  const result = run(['drift', '--target', targetDir, '--json', 'true']);

  assert.equal(result.status, 2);
  const payload = JSON.parse(String(result.stdout));
  assert.equal(payload.modified.includes('docs/agent-hardening/RUN_CONTROL.md'), true);
});

test('harness-sync update never force-overwrites modified managed files', async () => {
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-sync-update-'));
  const callerDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-sync-caller-'));

  assert.equal(run(['install', '--target', targetDir], callerDir).status, 0);
  await configure(targetDir);
  const managedPath = 'docs/agent-hardening/RUN_CONTROL.md';
  await fs.writeFile(path.join(targetDir, managedPath), '# Drifted\n', 'utf8');

  for (const extra of [[], ['--overwrite-modified', 'true']]) {
    const result = run(['update', '--target', targetDir, ...extra], callerDir);
    assert.equal(result.status, 1);
    assert.match(String(result.stderr), /MODIFIED_MANAGED_FILES.*RUN_CONTROL.md/);
    assert.equal(await fs.readFile(path.join(targetDir, managedPath), 'utf8'), '# Drifted\n');
  }
});

test('harness-sync update compares configured hashes rather than raw source hashes', async () => {
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-sync-incoming-exact-'));
  assert.equal(run(['install', '--target', targetDir]).status, 0);
  await configure(targetDir);
  const manifestPath = path.join(targetDir, 'docs', 'ops', 'automation', 'harness-manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const readme = manifest.managedFiles.find((entry) => entry.targetPath === 'docs/agent-hardening/RUN_CONTROL.md');
  readme.sha256 = 'previous-revision-hash';
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const result = run(['update', '--target', targetDir]);
  assert.equal(result.status, 0, String(result.stderr));
});

test('harness-sync update refuses collisions at newly managed paths', async () => {
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-sync-new-managed-'));
  assert.equal(run(['install', '--target', targetDir]).status, 0);
  await configure(targetDir);
  const targetPath = '.github/PULL_REQUEST_TEMPLATE/fix.md';
  const manifestPath = path.join(targetDir, 'docs', 'ops', 'automation', 'harness-manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  manifest.managedFiles = manifest.managedFiles.filter((entry) => entry.targetPath !== targetPath);
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(targetDir, targetPath), '# Existing downstream file\n', 'utf8');

  const result = run(['update', '--target', targetDir]);
  assert.equal(result.status, 1);
  assert.match(String(result.stderr), /MODIFIED_MANAGED_FILES/);
  assert.equal(await fs.readFile(path.join(targetDir, targetPath), 'utf8'), '# Existing downstream file\n');
});

test('harness-sync update refuses targets without an existing downstream harness manifest', async () => {
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-sync-unmanaged-'));
  await fs.writeFile(path.join(targetDir, 'README.md'), '# Plain Repo\n', 'utf8');

  const result = run(['update', '--target', targetDir]);
  assert.equal(result.status, 1);
  assert.match(String(result.stderr), /\[DOWNSTREAM_MANIFEST_MISSING\]/);

  const readme = await fs.readFile(path.join(targetDir, 'README.md'), 'utf8');
  assert.equal(readme, '# Plain Repo\n');
});

test('harness-sync preserves downstream .gitignore content', async () => {
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-sync-gitignore-'));
  await fs.writeFile(
    path.join(targetDir, '.gitignore'),
    'node_modules\ncustom-cache\n',
    'utf8'
  );

  const result = run(['install', '--target', targetDir]);
  assert.equal(result.status, 0);

  const gitignore = await fs.readFile(path.join(targetDir, '.gitignore'), 'utf8');
  assert.equal(gitignore, 'node_modules\ncustom-cache\n');

  const manifest = JSON.parse(
    await fs.readFile(path.join(targetDir, 'docs', 'ops', 'automation', 'harness-manifest.json'), 'utf8')
  );
  assert.equal(
    manifest.managedFiles.some((entry) => entry.targetPath === '.gitignore'),
    false
  );
});

test('harness-sync drift reports unexpected managed files from the downstream manifest', async () => {
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-sync-unexpected-'));
  assert.equal(run(['install', '--target', targetDir]).status, 0);

  const manifestPath = path.join(targetDir, 'docs', 'ops', 'automation', 'harness-manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  manifest.managedFiles.push({
    targetPath: 'obsolete-managed-file.txt',
    sourcePath: 'template/obsolete-managed-file.txt',
    sha256: 'stale',
    size: 0
  });
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const result = run(['drift', '--target', targetDir, '--json', 'true']);
  assert.equal(result.status, 2);

  const payload = JSON.parse(String(result.stdout));
  assert.deepEqual(payload.unexpectedManaged, ['obsolete-managed-file.txt']);
});

test('harness-sync update removes managed files no longer present in the source manifest', async () => {
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-sync-removed-'));
  assert.equal(run(['install', '--target', targetDir]).status, 0);
  await configure(targetDir);

  const removedPath = path.join(targetDir, 'docs', 'obsolete-managed-file.txt');
  await fs.mkdir(path.dirname(removedPath), { recursive: true });
  await fs.writeFile(removedPath, 'stale\n', 'utf8');

  const manifestPath = path.join(targetDir, 'docs', 'ops', 'automation', 'harness-manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  manifest.managedFiles.push({
    targetPath: 'docs/obsolete-managed-file.txt',
    sourcePath: 'template/docs/obsolete-managed-file.txt',
    sha256: createHash('sha256').update('stale\n').digest('hex'),
    configuredSha256: createHash('sha256').update('stale\n').digest('hex'),
    size: 6
  });
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  await fs.writeFile(removedPath, 'local edit\n');
  const conflict = run(['update', '--target', targetDir]);
  assert.equal(conflict.status, 1);
  assert.match(String(conflict.stderr), /MODIFIED_MANAGED_FILES.*obsolete-managed-file/);
  assert.equal(await fs.readFile(removedPath, 'utf8'), 'local edit\n');
  await fs.rm(removedPath);

  const result = run(['update', '--target', targetDir, '--json', 'true']);
  assert.equal(result.status, 0);

  const payload = JSON.parse(String(result.stdout));
  assert.equal(payload.filesRemoved, 1);
  await assert.rejects(fs.access(removedPath));
  assert.equal(run(['drift', '--target', targetDir]).status, 0);
});

test('configured adoption updates incoming templates and fails safely before configuration mutation', async (t) => {
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-sync-configured-'));
  t.after(() => fs.rm(fixture, { recursive: true, force: true }));
  const blueprint = path.join(fixture, 'blueprint');
  const target = path.join(fixture, 'target');
  for (const directory of ['scripts', 'distribution', 'template']) {
    await fs.cp(path.join(repoRoot, directory), path.join(blueprint, directory), { recursive: true });
  }
  await fs.mkdir(target);
  await fs.writeFile(path.join(target, 'package.json'), '{"name":"existing"}\n');
  await fs.writeFile(path.join(target, 'package-lock.json'), '{"lockfileVersion":3}\n');
  const execute = (script, args) => spawnSync(process.execPath, [path.join(blueprint, 'scripts', script), ...args], { encoding: 'utf8', cwd: fixture });
  const sync = (...args) => execute('harness-sync.mjs', [...args, '--target', target]);
  assert.equal(sync('adopt').status, 0);
  const packetPath = path.join(target, 'decisions.json');
  const packet = await decisions();
  await fs.writeFile(packetPath, JSON.stringify(packet));
  const configured = execute('bootstrap-configure.mjs', ['--target', target, '--decisions', packetPath]);
  assert.equal(configured.status, 0, configured.stderr);
  const manifestPath = path.join(target, 'docs/ops/automation/harness-manifest.json');
  const before = await fs.readFile(manifestPath, 'utf8');
  const managedPath = 'docs/agent-hardening/RUN_CONTROL.md';
  const sourceReadme = path.join(blueprint, 'template', managedPath);
  await fs.appendFile(sourceReadme, '\nIncoming for {{PRODUCT}}\n');
  assert.equal(sync('drift').status, 2);
  // A manually reconciled file that already equals incoming configured content is safe.
  await fs.appendFile(path.join(target, managedPath), '\nIncoming for Configured Project\n');
  const updated = sync('update');
  assert.equal(updated.status, 0, updated.stderr);
  assert.match(await fs.readFile(path.join(target, managedPath), 'utf8'), /Incoming for Configured Project/);
  const after = await fs.readFile(manifestPath, 'utf8');
  assert.notEqual(after, before);
  const entry = JSON.parse(after).managedFiles.find((item) => item.targetPath === managedPath);
  assert.notEqual(entry.sha256, entry.configuredSha256);
  assert.equal(entry.configuredSha256, createHash('sha256').update(await fs.readFile(path.join(target, managedPath))).digest('hex'));
  assert.equal(sync('drift').status, 0);
  // Bootstrap helpers may already have been cleaned up in an established project.
  for (const relative of bootstrapOnlyPaths) await fs.rm(path.join(target, relative));
  assert.equal(sync('update').status, 0);

  const snapshot = async () => {
    const files = await fs.readdir(target, { recursive: true });
    return Object.fromEntries(await Promise.all(files.filter((file) => !file.endsWith('/')).map(async (file) => {
      const absolute = path.join(target, file);
      return [file, (await fs.stat(absolute)).isFile() ? (await fs.readFile(absolute)).toString('base64') : null];
    })));
  };
  await fs.appendFile(sourceReadme, '\n{{NEW_REQUIRED_DECISION}}\n');
  const unchanged = await snapshot();
  const missing = sync('update');
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Missing placeholder decision.*NEW_REQUIRED_DECISION/);
  assert.deepEqual(await snapshot(), unchanged);
  const questionnairePath = path.join(blueprint, 'distribution/bootstrap-questionnaire.json');
  const questionnaire = JSON.parse(await fs.readFile(questionnairePath, 'utf8'));
  questionnaire.sections[0].questions[0].placeholders.push('NEW_REQUIRED_DECISION');
  await fs.writeFile(questionnairePath, JSON.stringify(questionnaire));
  assert.match(sync('update').stderr, /Missing placeholder decision.*NEW_REQUIRED_DECISION/);
  assert.deepEqual(await snapshot(), unchanged);
  packet.values.NEW_REQUIRED_DECISION = 'Approved new value';
  await fs.writeFile(packetPath, JSON.stringify(packet));
  assert.equal(sync('update').status, 0);
  assert.match(await fs.readFile(path.join(target, managedPath), 'utf8'), /Approved new value/);

  // A later render failure must not advance either source or configured baselines.
  await fs.writeFile(path.join(blueprint, 'template/docs/agent-hardening/eval-fixtures/fake-tests-final-claim.json'), '{ {{PRODUCT}}');
  const preFailure = await snapshot();
  assert.equal(sync('update').status, 1);
  assert.deepEqual(await snapshot(), preFailure);
});

test('project-owned files survive edits, deletion, and legacy ownership release during updates', async (t) => {
  const target = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-sync-project-owned-'));
  t.after(() => fs.rm(target, { recursive: true, force: true }));
  assert.equal(run(['install', '--target', target]).status, 0);
  await configure(target);
  const manifestPath = path.join(target, 'docs/ops/automation/harness-manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const paths = ['README.md', 'VISION.md', 'AGENTS.md', 'docs/product-specs/CURRENT-STATE.md',
    'docs/governance/project-gates.json', 'docs/generated/evals-report.json', '.github/workflows/ci.yml',
    '.github/workflows/ci-candidate.yml', 'scripts/ci/classify-change.mjs', 'scripts/ci/classify-change.test.mjs'];
  for (const relative of paths) {
    assert.equal(manifest.managedFiles.some((entry) => entry.targetPath === relative), false);
    assert.equal(manifest.projectFiles.some((entry) => entry.targetPath === relative), true);
    await fs.writeFile(path.join(target, relative), `Local content: ${relative}\n`);
  }
  await fs.rm(path.join(target, 'VISION.md'));
  for (const legacy of [false, true]) {
    if (legacy) {
      // Older manifests claimed these starter files, even without usable baselines.
      const current = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
      current.managedFiles.push(...current.projectFiles.map((entry) => ({ ...entry, preservedLocal: true })));
      delete current.projectFiles;
      await fs.writeFile(manifestPath, JSON.stringify(current));
    }
    assert.equal(run(['drift', '--target', target]).status, 0);
    const result = run(['update', '--target', target]);
    assert.equal(result.status, 0, result.stderr);
    for (const relative of paths.filter((value) => value !== 'VISION.md')) {
      assert.equal(await fs.readFile(path.join(target, relative), 'utf8'), `Local content: ${relative}\n`);
    }
    await assert.rejects(fs.access(path.join(target, 'VISION.md')));
    const next = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    assert.equal(next.managedFiles.some((entry) => paths.includes(entry.targetPath)), false);
  }
});

test('legacy manifests require explicit baseline migration', async () => {
  const target = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-sync-legacy-'));
  assert.equal(run(['install', '--target', target]).status, 0);
  await configure(target);
  const manifestPath = path.join(target, 'docs/ops/automation/harness-manifest.json');
  const legacyManifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  delete legacyManifest.decisionsPath;
  for (const entry of legacyManifest.managedFiles) {
    delete entry.configuredSha256;
    delete entry.preservedLocal;
  }
  await fs.writeFile(manifestPath, `${JSON.stringify(legacyManifest, null, 2)}\n`);
  const before = await fs.readFile(manifestPath, 'utf8');
  const result = run(['update', '--target', target, '--overwrite-modified', 'true']);
  assert.equal(result.status, 1);
  assert.match(String(result.stderr), /CONFIGURED_BASELINE_MISSING.*installed blueprint revision.*bootstrap-configure.*--baseline-only true/);
  assert.equal(await fs.readFile(manifestPath, 'utf8'), before);

  for (const relative of bootstrapOnlyPaths) await fs.rm(path.join(target, relative), { force: true });
  const packetPath = path.join(target, 'decisions.json');
  await fs.writeFile(packetPath, JSON.stringify(await decisions()));
  const migrated = spawnSync(process.execPath, [
    path.join(repoRoot, 'scripts/bootstrap-configure.mjs'), '--target', target,
    '--decisions', packetPath, '--baseline-only', 'true'
  ], { encoding: 'utf8' });
  assert.equal(migrated.status, 0, migrated.stderr);
  assert.equal(run(['update', '--target', target]).status, 0);
});

test('adoption preserves genuine edits even after configuration records a baseline', async () => {
  const target = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-sync-preserved-baseline-'));
  await fs.mkdir(path.join(target, 'docs/agent-hardening'), { recursive: true });
  await fs.writeFile(path.join(target, 'docs/agent-hardening/RUN_CONTROL.md'), '# Existing project\n');
  await fs.writeFile(path.join(target, 'package.json'), '{"name":"existing"}\n');
  await fs.writeFile(path.join(target, 'package-lock.json'), '{"lockfileVersion":3}\n');
  assert.equal(run(['adopt', '--target', target]).status, 0);
  await configure(target);
  const result = run(['update', '--target', target]);
  assert.equal(result.status, 1);
  assert.match(String(result.stderr), /MODIFIED_MANAGED_FILES.*RUN_CONTROL.md/);
  assert.equal(await fs.readFile(path.join(target, 'docs/agent-hardening/RUN_CONTROL.md'), 'utf8'), '# Existing project\n');
});

test('harness-sync refuses to install over the blueprint repository root', async () => {
  const result = run(['install', '--target', repoRoot]);
  assert.equal(result.status, 1);
  assert.match(String(result.stderr), /Target must be an adopted repository/);
});

test('harness-sync rejects downstream manifest paths that escape the target repo', async () => {
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-sync-escape-'));
  assert.equal(run(['install', '--target', targetDir]).status, 0);

  const manifestPath = path.join(targetDir, 'docs', 'ops', 'automation', 'harness-manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  manifest.managedFiles.push({
    targetPath: '../outside.txt',
    sourcePath: 'template/outside.txt',
    sha256: 'stale',
    size: 0
  });
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const result = run(['update', '--target', targetDir]);
  assert.equal(result.status, 1);
  assert.match(String(result.stderr), /repository-relative path/);
});
