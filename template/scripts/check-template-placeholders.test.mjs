import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const scriptPath = path.join(repoRoot, 'template', 'scripts', 'check-template-placeholders.mjs');

function runPlaceholderCheck(rootDir) {
  return spawnSync('node', [scriptPath], {
    cwd: rootDir,
    encoding: 'utf8'
  });
}

async function createFixtureRoot(t) {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'placeholder-check-'));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  return rootDir;
}

const placeholder = (name) => `{${`{${name}}`}}`;

test('placeholder checker ignores documented placeholder inventory and dependency folders', async (t) => {
  const rootDir = await createFixtureRoot(t);
  await fs.mkdir(path.join(rootDir, 'node_modules', 'package'), { recursive: true });
  await fs.mkdir(path.join(rootDir, '.git'), { recursive: true });
  await fs.writeFile(path.join(rootDir, 'PLACEHOLDERS.md'), `Keep ${placeholder('PRODUCT')} documented here.\n`, 'utf8');
  await fs.writeFile(path.join(rootDir, 'node_modules', 'package', 'index.js'), `const x = "${placeholder('IGNORED')}";\n`, 'utf8');
  await fs.writeFile(path.join(rootDir, '.git', 'config'), `${placeholder('IGNORED_GIT')}\n`, 'utf8');
  await fs.writeFile(path.join(rootDir, 'README.md'), 'No placeholders here.\n', 'utf8');

  const result = runPlaceholderCheck(rootDir);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\[placeholder-check\] passed/);
});

test('placeholder checker respects gitignore for generated and local files', async (t) => {
  const rootDir = await createFixtureRoot(t);
  await fs.mkdir(path.join(rootDir, 'dist'), { recursive: true });
  await fs.writeFile(path.join(rootDir, '.gitignore'), 'dist/\n.env\n', 'utf8');
  await fs.writeFile(path.join(rootDir, 'dist', 'bundle.js'), `const token = "${placeholder('IGNORED_DIST')}";\n`, 'utf8');
  await fs.writeFile(path.join(rootDir, '.env'), `SECRET=${placeholder('IGNORED_ENV')}\n`, 'utf8');
  await fs.writeFile(path.join(rootDir, 'README.md'), 'No placeholders here.\n', 'utf8');
  const gitInit = spawnSync('git', ['init'], { cwd: rootDir, encoding: 'utf8' });
  assert.equal(gitInit.status, 0, gitInit.stderr);

  const result = runPlaceholderCheck(rootDir);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\[placeholder-check\] passed/);
});

test('placeholder checker ignores non-blueprint tokens after installation', async (t) => {
  const rootDir = await createFixtureRoot(t);
  await fs.mkdir(path.join(rootDir, 'docs', 'ops', 'automation'), { recursive: true });
  await fs.writeFile(
    path.join(rootDir, 'docs', 'ops', 'automation', 'harness-manifest.json'),
    JSON.stringify({ governedPlaceholders: ['DOC_OWNER'], managedFiles: [{ targetPath: 'README.md' }] }),
    'utf8'
  );
  await fs.writeFile(path.join(rootDir, 'template.html'), `Hello ${placeholder('EMAIL')}\n`, 'utf8');

  const result = runPlaceholderCheck(rootDir);
  assert.equal(result.status, 0, result.stderr);
});

test('placeholder checker still scans project-owned starter files', async (t) => {
  const rootDir = await createFixtureRoot(t);
  await fs.mkdir(path.join(rootDir, 'docs/ops/automation'), { recursive: true });
  await fs.writeFile(path.join(rootDir, 'docs/ops/automation/harness-manifest.json'), JSON.stringify({
    governedPlaceholders: ['DOC_OWNER'], managedFiles: [], projectFiles: [{ targetPath: 'README.md' }]
  }));
  await fs.writeFile(path.join(rootDir, 'README.md'), `Owner: ${placeholder('DOC_OWNER')}\n`);
  const result = runPlaceholderCheck(rootDir);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /README\.md:1:Owner:/);
});

test('placeholder checker reports unresolved template tokens with file and line', async (t) => {
  const rootDir = await createFixtureRoot(t);
  await fs.mkdir(path.join(rootDir, 'docs'), { recursive: true });
  await fs.writeFile(path.join(rootDir, 'docs', 'README.md'), `Owner: ${placeholder('DOC_OWNER')}\n`, 'utf8');

  const result = runPlaceholderCheck(rootDir);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /unresolved placeholders found/);
  assert.match(result.stdout, /docs\/README\.md:1:Owner: \{\{DOC_OWNER\}\}/);
});
