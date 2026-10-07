import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { createTemplateRepo, runNode } from './test-helpers.mjs';

test('context:compile is deterministic when sources are unchanged', async (t) => {
  const rootDir = await createTemplateRepo(t);
  const result = runNode(path.join(rootDir, 'scripts', 'automation', 'compile-runtime-context.mjs'), [], rootDir);

  assert.equal(result.status, 0, String(result.stderr));
  const gitStatus = spawnSync('git', ['status', '--short'], {
    cwd: rootDir,
    encoding: 'utf8'
  });
  assert.equal(gitStatus.status, 0, String(gitStatus.stderr));
  assert.equal(String(gitStatus.stdout).trim(), '');

  const content = String(await fs.readFile(
    path.join(rootDir, 'docs', 'generated', 'AGENT-RUNTIME-CONTEXT.md'),
    'utf8'
  ));
  assert.match(content, /## Active Work/);
  assert.match(content, /No unfinished plans/);
  assert.doesNotMatch(content, /## Mandatory Safety Rules/);
});

test('context:compile preserves adopted repository doc owner', async (t) => {
  const rootDir = await createTemplateRepo(t);
  const agentsPath = path.join(rootDir, 'AGENTS.md');
  const agentsDoc = await fs.readFile(agentsPath, 'utf8');
  await fs.writeFile(
    agentsPath,
    String(agentsDoc).replace(/^Owner: .+$/m, 'Owner: Platform Engineering'),
    'utf8'
  );

  const result = runNode(path.join(rootDir, 'scripts', 'automation', 'compile-runtime-context.mjs'), [], rootDir);

  assert.equal(result.status, 0, String(result.stderr));
  const content = String(await fs.readFile(
    path.join(rootDir, 'docs', 'generated', 'AGENT-RUNTIME-CONTEXT.md'),
    'utf8'
  ));
  assert.match(content, /^Owner: Platform Engineering$/m);
  assert.doesNotMatch(content, /^Owner: \{\{DOC_OWNER\}\}$/m);
});

test('context:compile prefers canonical owner over stale generated owner', async (t) => {
  const rootDir = await createTemplateRepo(t);
  const agentsPath = path.join(rootDir, 'AGENTS.md');
  const generatedPath = path.join(rootDir, 'docs', 'generated', 'AGENT-RUNTIME-CONTEXT.md');
  const agentsDoc = await fs.readFile(agentsPath, 'utf8');
  const generatedDoc = await fs.readFile(generatedPath, 'utf8');
  await fs.writeFile(
    agentsPath,
    String(agentsDoc).replace(/^Owner: .+$/m, 'Owner: Platform Engineering'),
    'utf8'
  );
  await fs.writeFile(
    generatedPath,
    String(generatedDoc).replace(/^Owner: .+$/m, 'Owner: Stale Generated Owner'),
    'utf8'
  );

  const result = runNode(path.join(rootDir, 'scripts', 'automation', 'compile-runtime-context.mjs'), [], rootDir);

  assert.equal(result.status, 0, String(result.stderr));
  const content = String(await fs.readFile(generatedPath, 'utf8'));
  assert.match(content, /^Owner: Platform Engineering$/m);
  assert.doesNotMatch(content, /^Owner: Stale Generated Owner$/m);
});

test('context:compile rejects output paths outside the repository', async (t) => {
  const rootDir = await createTemplateRepo(t);
  const result = runNode(
    path.join(rootDir, 'scripts', 'automation', 'compile-runtime-context.mjs'),
    ['--output', '../outside.md'],
    rootDir
  );

  assert.equal(result.status, 1);
  assert.match(String(result.stderr), /escapes repository root/);
});

test('context:check detects changed state and queue work without rewriting files', async (t) => {
  const root = await createTemplateRepo(t);

  const script = path.join(root, 'scripts/automation/compile-runtime-context.mjs');
  const output = path.join(root, 'docs/generated/AGENT-RUNTIME-CONTEXT.md');
  const initial = await fs.readFile(output, 'utf8');
  const active = path.join(root, 'docs/exec-plans/active/recovery.md');
  const plan = '# Recovery\n\n## Metadata\n- Plan-ID: recovery\n- Status: in-progress\n- Priority: p1\n- Dependencies: none\n- Security-Approval: not-required\n\n## Must-Land Checklist\n- [x] `ml-one` First deliverable.\n- [ ] `ml-two` Remaining deliverable.\n';
  await fs.writeFile(active, plan);
  assert.equal(runNode(script, ['--check'], root).status, 1);
  assert.equal(await fs.readFile(output, 'utf8'), initial);
  assert.equal(runNode(script, [], root).status, 0);
  assert.match(await fs.readFile(output, 'utf8'), /recovery` \| in-progress \| 1 \|/);
  await fs.writeFile(active, plan.replace('- [ ]', '- [x]'));
  const finished = runNode(script, [], root);
  assert.equal(finished.status, 1);
  assert.match(String(finished.stderr), /no remaining checklist items/);
  for (const status of ['validation', 'in-review']) {
    await fs.writeFile(active, plan.replace('- [ ]', '- [x]').replace('Status: in-progress', `Status: ${status}`));
    const awaiting = runNode(script, [], root);
    assert.equal(awaiting.status, 0, String(awaiting.stderr));
    assert.match(await fs.readFile(output, 'utf8'), new RegExp(`recovery\\x60 \\| ${status} \\| 0 \\|`));
    assert.equal(runNode(script, ['--check'], root).status, 0);
  }
  await fs.rename(active, path.join(root, 'docs/exec-plans/completed/recovery.md'));
  assert.equal(runNode(script, [], root).status, 0);
  assert.doesNotMatch(await fs.readFile(output, 'utf8'), /`recovery`/);
  await fs.appendFile(path.join(root, 'docs/product-specs/CURRENT-STATE.md'), '\nVerified current behavior changed.\n');
  assert.equal(runNode(script, ['--check'], root).status, 1);
  assert.equal(runNode(script, [], root).status, 0);
  assert.equal(runNode(script, ['--check'], root).status, 0);
});

test('context compiler refuses symlink outputs before writing outside the repository', async (t) => {
  const root = await createTemplateRepo(t);

  const outside = path.join(root, '..', `${path.basename(root)}-outside.md`);
  t.after(() => fs.rm(outside, { force: true }));
  await fs.writeFile(outside, 'Preserve this file.\n');
  const output = path.join(root, 'docs/generated/AGENT-RUNTIME-CONTEXT.md');
  await fs.rm(output);
  await fs.symlink(outside, output);
  const result = runNode(path.join(root, 'scripts/automation/compile-runtime-context.mjs'), [], root);
  assert.equal(result.status, 1);
  assert.match(String(result.stderr), /symlink/);
  assert.equal(await fs.readFile(outside, 'utf8'), 'Preserve this file.\n');
});

test('context includes nested unfinished plans, tracks their edits, and excludes evidence', async (t) => {
  const root = await createTemplateRepo(t);

  const script = path.join(root, 'scripts/automation/compile-runtime-context.mjs');
  const output = path.join(root, 'docs/generated/AGENT-RUNTIME-CONTEXT.md');
  const directory = path.join(root, 'docs/future/paiements-équipe');
  await fs.mkdir(path.join(directory, 'evidence'), { recursive: true });
  const plan = path.join(directory, 'résumé\trecovery.md');
  await fs.writeFile(plan, '# Refund recovery\n\n## Metadata\n- Plan-ID: refund-recovery\n- Status: draft\n- Priority: p1\n- Dependencies: none\n- Security-Approval: pending\n\n## Must-Land Checklist\n- [ ] `ml-recovery` Recover failed refunds.\n');
  await fs.writeFile(path.join(directory, 'evidence/receipt.md'), 'Historical receipt without plan metadata.\n');
  const compiled = runNode(script, [], root);
  assert.equal(compiled.status, 0, String(compiled.stderr));
  assert.ok((await fs.readFile(output, 'utf8')).includes('docs/future/paiements-équipe/résumé\trecovery.md'));
  assert.doesNotMatch(await fs.readFile(output, 'utf8'), /receipt\.md/);
  await fs.appendFile(plan, '\nRecovery contract changed.\n');
  const stale = runNode(script, ['--check'], root);
  assert.equal(stale.status, 1);
  assert.match(String(stale.stderr), /Generated context is stale/);
  await fs.symlink(directory, path.join(root, 'docs/future/linked-payments'));
  const linked = runNode(script, [], root);
  assert.equal(linked.status, 1);
  assert.match(String(linked.stderr), /symlink/);
});
