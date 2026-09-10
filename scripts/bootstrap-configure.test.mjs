import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scriptPath = path.join(rootDir, 'scripts', 'bootstrap-configure.mjs');
const harnessSyncPath = path.join(rootDir, 'scripts', 'harness-sync.mjs');
import { decisions } from './bootstrap-test-helpers.mjs';

for (const owner of ['@acme/platform', '@hendrikeng']) test(`bootstrap configure preserves files and accepts CODEOWNERS ${owner}`, async () => {
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bootstrap-configure-'));
  assert.equal(spawnSync(process.execPath, [harnessSyncPath, 'install', '--target', targetDir]).status, 0);
  await fs.writeFile(path.join(targetDir, 'application-template.txt'), '{{PRODUCT}} must stay untouched\n', 'utf8');
  await fs.writeFile(path.join(targetDir, 'package.json'), JSON.stringify({ name: 'existing', scripts: { 'verify:fast': '' } }), 'utf8');
  const packetPath = path.join(targetDir, 'docs', 'ops', 'automation', 'bootstrap-decisions.json');
  const packet = await decisions();
  packet.values.CODEOWNERS_DEFAULT_TEAM = owner;
  packet.values.CODEOWNERS_SECURITY_TEAM = owner;
  packet.values.CI_INSTALL_COMMAND = 'pnpm --filter "@acme/*\\tools" install';
  packet.values.PACKAGE_MANAGER_CACHE = 'pnpm';
  packet.values.PACKAGE_MANAGER_LOCKFILE = 'pnpm-lock.yaml';
  await fs.writeFile(path.join(targetDir, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n", 'utf8');
  await fs.writeFile(packetPath, JSON.stringify(packet), 'utf8');

  const result = spawnSync(process.execPath, [scriptPath, '--target', targetDir, '--decisions', packetPath, '--json', 'true'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.changedFiles.includes('README.md'), true);
  const codeowners = await fs.readFile(path.join(targetDir, '.github/CODEOWNERS'), 'utf8');
  assert.ok(codeowners.includes(`* ${owner}\n`));
  assert.ok(codeowners.includes(`**/security/** ${owner} ${owner}\n`));
  assert.equal(payload.scriptConflicts.includes('verify:fast'), true);
  assert.match(await fs.readFile(path.join(targetDir, 'README.md'), 'utf8'), /Configured Project/);
  assert.equal(await fs.readFile(path.join(targetDir, 'application-template.txt'), 'utf8'), '{{PRODUCT}} must stay untouched\n');
  const projectGates = JSON.parse(await fs.readFile(path.join(targetDir, 'docs', 'governance', 'project-gates.json'), 'utf8'));
  assert.equal(JSON.stringify(projectGates).includes('eslint \\"src/**/*.ts\\"'), true);
  const workflow = await fs.readFile(path.join(targetDir, '.github', 'workflows', 'ci.yml'), 'utf8');
  assert.equal(workflow.includes(`CI_INSTALL_COMMAND: ${JSON.stringify('pnpm --filter "@acme/*\\tools" install')}`), true);
  assert.equal(workflow.match(/- run: corepack enable/g)?.length, 2);
  assert.match(workflow, /push:\s+branches: \[dev, main\]/);
  assert.match(workflow, /needs: \[scope, fast-gate, release-candidate-gate\]\s+if: always\(\)/);
  assert.match(workflow, /npm run verify:full -- --skip-fast\s+if: needs.scope.outputs.scope == 'full'/);
  assert.match(workflow, /'Metadata Result' \|\| 'Full Gate'/);
  const candidate = await fs.readFile(path.join(targetDir, '.github/workflows/ci-candidate.yml'), 'utf8');
  assert.match(candidate, /run-name: CI candidate \$\{\{ inputs.revision \}\}/);
  assert.match(candidate, /run_id: e.GITHUB_RUN_ID, run_attempt: e.GITHUB_RUN_ATTEMPT/);
  const classifier = await fs.readFile(path.join(targetDir, 'scripts/ci/classify-change.mjs'), 'utf8');
  assert.match(classifier, /Project-owned/);
  const packageJson = JSON.parse(await fs.readFile(path.join(targetDir, 'package.json'), 'utf8'));
  const manifest = JSON.parse(await fs.readFile(path.join(targetDir, 'docs/ops/automation/harness-manifest.json'), 'utf8'));
  assert.equal(manifest.decisionsPath, 'docs/ops/automation/bootstrap-decisions.json');
  assert.equal(packageJson.scripts['verify:fast'], '');
  assert.equal(typeof packageJson.scripts['verify:full'], 'string');
});

test('reviewed project ownership releases retired decisions without inventing a baseline', async (t) => {
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'bootstrap-retired-decisions-'));
  t.after(() => fs.rm(fixture, { recursive: true, force: true }));
  const source = path.join(fixture, 'source');
  const target = path.join(fixture, 'target');
  for (const dir of ['scripts', 'distribution', 'template']) await fs.cp(path.join(rootDir, dir), path.join(source, dir), { recursive: true });
  const ownershipPath = path.join(source, 'distribution/harness-ownership-manifest.json');
  const ownership = JSON.parse(await fs.readFile(ownershipPath, 'utf8'));
  ownership.projectOwnedGlobs = [];
  ownership.bootstrapOnlyGlobs = [];
  await fs.writeFile(ownershipPath, JSON.stringify(ownership));
  const projectPath = 'docs/governance/architecture-rules.json';
  await fs.writeFile(path.join(source, 'template', projectPath), JSON.stringify({ legacyTag: '{{RETIRED_TAG}}' }));
  assert.equal(spawnSync(process.execPath, [path.join(source, 'scripts/harness-sync.mjs'), 'install', '--target', target]).status, 0);
  const projectContent = JSON.stringify({ checks: [], reason: 'Project-owned configuration.' });
  await fs.writeFile(path.join(target, projectPath), projectContent);
  const packetPath = path.join(target, 'decisions.json');
  await fs.writeFile(packetPath, JSON.stringify(await decisions()));
  const manifestPath = path.join(target, 'docs/ops/automation/harness-manifest.json');
  const original = await fs.readFile(manifestPath, 'utf8');
  const args = [path.join(source, 'scripts/bootstrap-configure.mjs'), '--target', target, '--decisions', packetPath, '--baseline-only', 'true', '--json', 'true'];
  const blocked = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert.equal(blocked.status, 1);
  assert.match(blocked.stderr, /RETIRED_TAG/);
  assert.equal(await fs.readFile(manifestPath, 'utf8'), original);
  const result = spawnSync(process.execPath, [...args, '--bootstrap-policy', path.join(rootDir, 'distribution/harness-ownership-manifest.json')], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(JSON.parse(result.stdout).releasedProjectOwned.includes(projectPath));
  assert.equal(await fs.readFile(path.join(target, projectPath), 'utf8'), projectContent);
  const next = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const released = next.managedFiles.find((entry) => entry.targetPath === projectPath);
  assert.equal(released.preservedLocal, true);
  assert.equal(released.configuredSha256, undefined);
  assert.equal(JSON.parse(result.stdout).releasedProjectOwned.includes('PLACEHOLDERS.md'), false);
  assert.match(next.managedFiles.find((entry) => entry.targetPath === 'PLACEHOLDERS.md').configuredSha256, /^[a-f0-9]{64}$/);
  assert.match(next.managedFiles.find((entry) => entry.targetPath === 'docs/agent-hardening/RUN_CONTROL.md').configuredSha256, /^[a-f0-9]{64}$/);
  assert.equal(await fs.readFile(ownershipPath, 'utf8'), JSON.stringify(ownership));
});

test('bootstrap configure accepts matching source files without Git metadata', async () => {
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bootstrap-configure-no-git-'));
  const env = { ...process.env, PATH: path.dirname(process.execPath) };
  assert.equal(spawnSync(process.execPath, [harnessSyncPath, 'install', '--target', targetDir], { env }).status, 0);
  const packetPath = path.join(targetDir, 'docs', 'ops', 'automation', 'bootstrap-decisions.json');
  await fs.writeFile(packetPath, JSON.stringify(await decisions()), 'utf8');

  const result = spawnSync(process.execPath, [scriptPath, '--target', targetDir, '--decisions', packetPath], { encoding: 'utf8', env });
  assert.equal(result.status, 0, result.stderr);
  const lockfile = JSON.parse(await fs.readFile(path.join(targetDir, 'package-lock.json'), 'utf8'));
  assert.equal(lockfile.lockfileVersion, 3);
});

test('bootstrap configure reports edited template placeholders before writing any replacements', async () => {
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bootstrap-configure-edited-'));
  assert.equal(spawnSync(process.execPath, [harnessSyncPath, 'install', '--target', targetDir]).status, 0);
  await fs.writeFile(path.join(targetDir, 'README.md'), '# Custom {{PRODUCT}}\n', 'utf8');
  const packetPath = path.join(targetDir, 'docs', 'ops', 'automation', 'bootstrap-decisions.json');
  await fs.writeFile(packetPath, JSON.stringify(await decisions()), 'utf8');

  const result = spawnSync(process.execPath, [scriptPath, '--target', targetDir, '--decisions', packetPath], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Edited template files still contain governed placeholders: README.md/);
  assert.match(await fs.readFile(path.join(targetDir, 'VISION.md'), 'utf8'), /\{\{DOC_OWNER\}\}/);
});

test('bootstrap configure rejects missing managed files before replacing anything', async () => {
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bootstrap-configure-missing-file-'));
  assert.equal(spawnSync(process.execPath, [harnessSyncPath, 'install', '--target', targetDir]).status, 0);
  await fs.rm(path.join(targetDir, 'VISION.md'));
  const packetPath = path.join(targetDir, 'docs', 'ops', 'automation', 'bootstrap-decisions.json');
  await fs.writeFile(packetPath, JSON.stringify(await decisions()), 'utf8');

  const result = spawnSync(process.execPath, [scriptPath, '--target', targetDir, '--decisions', packetPath], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Installed harness file is missing: VISION.md/);
  assert.match(await fs.readFile(path.join(targetDir, 'README.md'), 'utf8'), /\{\{PRODUCT\}\}/);
});

test('bootstrap configure rejects incomplete managed file manifests before replacing files', async () => {
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bootstrap-configure-incomplete-manifest-'));
  assert.equal(spawnSync(process.execPath, [harnessSyncPath, 'install', '--target', targetDir]).status, 0);
  const packetPath = path.join(targetDir, 'docs', 'ops', 'automation', 'bootstrap-decisions.json');
  await fs.writeFile(packetPath, JSON.stringify(await decisions()), 'utf8');
  const manifestPath = path.join(targetDir, 'docs', 'ops', 'automation', 'harness-manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  manifest.managedFiles = manifest.managedFiles.filter((entry) => entry.targetPath !== 'docs/agent-hardening/RUN_CONTROL.md');
  await fs.writeFile(manifestPath, JSON.stringify(manifest), 'utf8');

  for (const policyArgs of [[], ['--baseline-only', 'true', '--bootstrap-policy', path.join(rootDir, 'distribution/harness-ownership-manifest.json')]]) {
    const result = spawnSync(process.execPath, [scriptPath, '--target', targetDir, '--decisions', packetPath, ...policyArgs], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /does not contain the complete managed file set.*RUN_CONTROL.md/);
    assert.equal(await fs.readFile(manifestPath, 'utf8'), JSON.stringify(manifest));
    assert.match(await fs.readFile(path.join(targetDir, 'README.md'), 'utf8'), /\{\{PRODUCT\}\}/);
  }
  const nonBaseline = spawnSync(process.execPath, [scriptPath, '--target', targetDir, '--decisions', packetPath, '--bootstrap-policy', path.join(rootDir, 'distribution/harness-ownership-manifest.json')], { encoding: 'utf8' });
  assert.equal(nonBaseline.status, 1);
  assert.match(nonBaseline.stderr, /only supported with --baseline-only true/);
});

test('baseline migration permits reviewed bootstrap omissions without losing the project inventory', async (t) => {
  const target = await fs.mkdtemp(path.join(os.tmpdir(), 'bootstrap-policy-omission-'));
  t.after(() => fs.rm(target, { recursive: true, force: true }));
  assert.equal(spawnSync(process.execPath, [harnessSyncPath, 'install', '--target', target]).status, 0);
  const manifestPath = path.join(target, 'docs/ops/automation/harness-manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const omitted = 'scripts/check-article-conformance.mjs';
  manifest.managedFiles = manifest.managedFiles.filter((entry) => entry.targetPath !== omitted);
  await fs.writeFile(manifestPath, JSON.stringify(manifest));
  await fs.rm(path.join(target, omitted));
  const policy = JSON.parse(await fs.readFile(path.join(rootDir, 'distribution/harness-ownership-manifest.json'), 'utf8'));
  policy.bootstrapOnlyGlobs.push(omitted);
  const policyPath = path.join(target, 'reviewed-policy.json');
  const packetPath = path.join(target, 'decisions.json');
  await fs.writeFile(policyPath, JSON.stringify(policy));
  await fs.writeFile(packetPath, JSON.stringify(await decisions()));
  const result = spawnSync(process.execPath, [scriptPath, '--target', target, '--decisions', packetPath,
    '--baseline-only', 'true', '--bootstrap-policy', policyPath, '--json', 'true'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).omittedBootstrapOnly, [omitted]);
  const next = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  assert.deepEqual(next.projectFiles, manifest.projectFiles);
  await assert.rejects(fs.access(path.join(target, omitted)));
});

test('bootstrap configure rejects malformed package.json before replacing files', async () => {
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bootstrap-configure-package-'));
  assert.equal(spawnSync(process.execPath, [harnessSyncPath, 'install', '--target', targetDir]).status, 0);
  await fs.writeFile(path.join(targetDir, 'package.json'), '{', 'utf8');
  const packetPath = path.join(targetDir, 'docs', 'ops', 'automation', 'bootstrap-decisions.json');
  await fs.writeFile(packetPath, JSON.stringify(await decisions()), 'utf8');

  const manifestPath = path.join(targetDir, 'docs/ops/automation/harness-manifest.json');
  const before = await fs.readFile(manifestPath, 'utf8');
  const result = spawnSync(process.execPath, [scriptPath, '--target', targetDir, '--decisions', packetPath], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /JSON/);
  assert.equal(await fs.readFile(manifestPath, 'utf8'), before);
  assert.equal(JSON.parse(before).managedFiles.some((entry) => entry.configuredSha256), false);
  assert.match(await fs.readFile(path.join(targetDir, 'VISION.md'), 'utf8'), /\{\{DOC_OWNER\}\}/);
});

test('bootstrap configure rejects unsupported packet versions and invalid dates', async () => {
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bootstrap-configure-contract-'));
  assert.equal(spawnSync(process.execPath, [harnessSyncPath, 'install', '--target', targetDir]).status, 0);
  const packetPath = path.join(targetDir, 'docs', 'ops', 'automation', 'bootstrap-decisions.json');
  const packet = await decisions();
  packet.schemaVersion = 2;
  await fs.writeFile(packetPath, JSON.stringify(packet), 'utf8');
  let result = spawnSync(process.execPath, [scriptPath, '--target', targetDir, '--decisions', packetPath], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unsupported decision packet schemaVersion/);

  packet.schemaVersion = 1;
  packet.values.CURRENT_STATE_DATE = '2026-02-31';
  await fs.writeFile(packetPath, JSON.stringify(packet), 'utf8');
  result = spawnSync(process.execPath, [scriptPath, '--target', targetDir, '--decisions', packetPath], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /valid YYYY-MM-DD calendar date/);

  packet.values.CURRENT_STATE_DATE = '2026-03-22';
  packet.values.PACKAGE_MANAGER_CACHE = 'pnpm';
  await fs.writeFile(packetPath, JSON.stringify(packet), 'utf8');
  result = spawnSync(process.execPath, [scriptPath, '--target', targetDir, '--decisions', packetPath], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /must describe the same npm, pnpm, or yarn toolchain/);

  packet.values.PACKAGE_MANAGER_CACHE = 'npm';
  packet.values.SUMMARY = '{{UNKNOWN_VALUE}}';
  await fs.writeFile(packetPath, JSON.stringify(packet), 'utf8');
  result = spawnSync(process.execPath, [scriptPath, '--target', targetDir, '--decisions', packetPath], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /without placeholder tokens/);

  packet.values.SUMMARY = 'summary';
  packet.values.CODEOWNERS_DEFAULT_TEAM = 'platform';
  await fs.writeFile(packetPath, JSON.stringify(packet), 'utf8');
  result = spawnSync(process.execPath, [scriptPath, '--target', targetDir, '--decisions', packetPath], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /CODEOWNERS_DEFAULT_TEAM must use @username or @org\/team format/);

  packet.values.CODEOWNERS_DEFAULT_TEAM = '@acme/platform';
  packet.values.OUT_OF_SCOPE_ITEM_2 = packet.values.OUT_OF_SCOPE_ITEM_1;
  await fs.writeFile(packetPath, JSON.stringify(packet), 'utf8');
  result = spawnSync(process.execPath, [scriptPath, '--target', targetDir, '--decisions', packetPath], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /OUT_OF_SCOPE_ITEM values must be unique/);

  packet.values.OUT_OF_SCOPE_ITEM_2 = 'out_of_scope_item_2';
  packet.values.PRODUCT = '!!!';
  await fs.writeFile(packetPath, JSON.stringify(packet), 'utf8');
  result = spawnSync(process.execPath, [scriptPath, '--target', targetDir, '--decisions', packetPath], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /non-empty npm package name/);

  packet.values.PRODUCT = 'node_modules';
  await fs.writeFile(packetPath, JSON.stringify(packet), 'utf8');
  result = spawnSync(process.execPath, [scriptPath, '--target', targetDir, '--decisions', packetPath], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /reserved name/);

  packet.values.PRODUCT = 'Configured Project';
  await fs.writeFile(packetPath, JSON.stringify(packet), 'utf8');
  const manifestPath = path.join(targetDir, 'docs', 'ops', 'automation', 'harness-manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  manifest.sourceRevision = 'different-revision';
  await fs.writeFile(manifestPath, JSON.stringify(manifest), 'utf8');
  result = spawnSync(process.execPath, [scriptPath, '--target', targetDir, '--decisions', packetPath], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Blueprint source revision does not match/);
});

test('bootstrap configure refuses incomplete decision packets', async () => {
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bootstrap-configure-missing-'));
  assert.equal(spawnSync(process.execPath, [harnessSyncPath, 'install', '--target', targetDir]).status, 0);
  const packetPath = path.join(targetDir, 'decisions.json');
  await fs.writeFile(packetPath, JSON.stringify({ schemaVersion: 1, values: { PRODUCT: 'Incomplete' } }), 'utf8');
  const result = spawnSync(process.execPath, [scriptPath, '--target', targetDir, '--decisions', packetPath], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Missing placeholder decision/);
});
