#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { runFixtureEvals } from './run-fixture-evals.mjs';

const rootDir = process.cwd();

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function toPosix(value) {
  return String(value).replaceAll(path.sep, '/');
}

function replacementForToken(token) {
  const today = todayIsoDate();
  const replacements = {
    PRODUCT: 'Reading List',
    SUMMARY: 'Small Node application for curating books, tracking reading status, and exporting the next reading queue.',
    DOC_OWNER: 'reading-list-platform',
    LAST_UPDATED_ISO_DATE: today,
    CURRENT_STATE_DATE: today,
    FRONTEND_STACK: 'not applicable',
    BACKEND_STACK: 'node esm library and cli scripts',
    DATA_STACK: 'in-memory records with json export',
    SHARED_CONTRACT_STRATEGY: 'plain JavaScript domain functions with node:test contract checks',
    CRITICAL_DOMAIN_SET: 'book identity, reading status transitions, priority ordering',
    SERVER_AUTHORITY_BOUNDARY_SET: 'local CLI writes and generated dist artifacts',
    MONEY_AND_NUMERIC_RULE: 'priority scores are integers from 1 through 5',
    CODEOWNERS_DEFAULT_TEAM: '@reading-list/platform',
    CODEOWNERS_SECURITY_TEAM: '@reading-list/security',
    NODE_VERSION: '24',
    CI_INSTALL_COMMAND: 'npm install --ignore-scripts',
    PACKAGE_MANAGER_CACHE: 'npm',
    PACKAGE_MANAGER_LOCKFILE: 'package-lock.json',
    PROJECT_LINT_COMMAND: 'node --check src/reading-list.js',
    PROJECT_TYPECHECK_COMMAND: 'node ./scripts/app-contract-check.mjs',
    PROJECT_UNIT_TEST_COMMAND: 'node --test test/reading-list.test.mjs',
    PROJECT_BUILD_COMMAND: 'node ./scripts/app-build.mjs',
    GENERATED_AT_UTC_ISO: `${today}T00:00:00.000Z`,
    CONFORMANCE_SOURCE: 'scripts/ci/run-golden-adopted-repo.mjs',
    REPOSITORY_PROFILE_SNAKE_CASE: 'reading_list',
    CONFORMANCE_PURPOSE: 'golden adopted repo verification',
    CI_WORKFLOW_PATH: '.github/workflows/ci.yml',
    EVAL_PROVIDER: 'fixture',
    EVAL_MODEL_ID: 'golden-adopted-repo'
  };
  if (replacements[token]) {
    return replacements[token];
  }
  if (/^SCOPE\d+$/.test(token)) {
    return `Reading list scope ${token.slice(-1)}`;
  }
  if (/^FRONTEND_ENTRYPOINT_\d+$/.test(token)) {
    return 'not-applicable';
  }
  if (/^BACKEND_ENTRYPOINT_\d+$/.test(token)) {
    return 'src/reading-list.js';
  }
  if (/^DOMAIN_INVARIANT_AREA_\d+$/.test(token)) {
    return `reading-list invariant area ${token.slice(-1)}`;
  }
  if (/^DOMAIN_INVARIANT_\d+[A-Z]$/.test(token)) {
    return `reading-list invariant ${token.toLowerCase()}`;
  }
  if (/^CRITICAL_FLOW_\d+$/.test(token)) {
    return `reading-list critical flow ${token.slice(-1)}`;
  }
  if (/^SCORE_/.test(token)) {
    return '4';
  }
  if (/^QUALITY_GAP_\d+$/.test(token)) {
    return 'none currently blocking the golden fixture';
  }
  if (/^OUT_OF_SCOPE_ITEM_\d+$/.test(token)) {
    return `golden_fixture_out_of_scope_${token.slice(-1)}`;
  }
  return token.toLowerCase().replaceAll('_', '-');
}

function runBlueprint(script, args) {
  const result = spawnSync(process.execPath, [path.join(rootDir, 'scripts', script), ...args, '--json', 'true'], {
    cwd: rootDir, encoding: 'utf8'
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

async function configureBlueprint(repoDir) {
  const questionnaire = JSON.parse(await fs.readFile(path.join(rootDir, 'distribution/bootstrap-questionnaire.json'), 'utf8'));
  const tokens = questionnaire.sections.flatMap((section) => section.questions.flatMap((question) => question.placeholders));
  const decisionsPath = path.join(repoDir, 'bootstrap-decisions.json');
  await fs.writeFile(decisionsPath, JSON.stringify({
    schemaVersion: 1,
    values: Object.fromEntries(tokens.map((token) => [token, replacementForToken(token)]))
  }));
  const result = runBlueprint('bootstrap-configure.mjs', ['--target', repoDir, '--decisions', decisionsPath]);
  assert.deepEqual(result.scriptConflicts, []);
  const pkg = JSON.parse(await fs.readFile(path.join(repoDir, 'package.json'), 'utf8'));
  const fragment = JSON.parse(await fs.readFile(path.join(repoDir, 'package.scripts.fragment.json'), 'utf8'));
  for (const [name, command] of Object.entries(fragment.scripts)) assert.equal(pkg.scripts[name], command);
  return pkg;
}

async function writePackageJson(repoDir) {
  const payload = {
    name: 'reading-list-golden',
    private: true,
    version: '0.0.0-golden',
    type: 'module',
    engines: {
      node: '>=24 <25'
    },
    scripts: {
      'app:lint': 'node --check src/reading-list.js',
      'app:contract': 'node ./scripts/app-contract-check.mjs',
      'app:test': 'node --test test/reading-list.test.mjs',
      'app:integration': 'node --test test/reading-list.integration.test.mjs',
      'app:build': 'node ./scripts/app-build.mjs',
      'app:security': 'node ./scripts/app-security-check.mjs'
    }
  };
  await fs.writeFile(path.join(repoDir, 'package.json'), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function writeArchitectureFiles(repoDir) {
  const config = {
    schemaVersion: 1,
    checks: [{
      type: 'forbidden_import_patterns_rg',
      checks: [{
        sourceDir: 'src', globs: ['*.js'], pattern: 'node:(fs|child_process)',
        label: 'Domain functions must not perform filesystem or process IO.'
      }]
    }]
  };
  await fs.writeFile(path.join(repoDir, 'docs/governance/architecture-rules.json'), `${JSON.stringify(config, null, 2)}\n`);
}

async function writeProjectGates(repoDir) {
  const gates = {
    version: 1,
    description: 'Golden adopted repo gates for the Reading List app.',
    profiles: {
      fast: 'Runs on every implementation PR and during normal agent iteration.',
      full: 'Runs before merge/release candidates and after verify:fast.',
      release: 'Runs for release candidates when release support is enabled.',
      deploy: 'Runs against a deployed target when deployment verification is available.'
    },
    gates: [
      {
        id: 'lint',
        profile: 'fast',
        status: 'required',
        command: 'npm run app:lint',
        rationale: 'Parse the app source before any agent treats the slice as valid.'
      },
      {
        id: 'typecheck',
        profile: 'fast',
        status: 'required',
        command: 'npm run app:contract',
        rationale: 'Verify the exported domain contract and runtime invariants.'
      },
      {
        id: 'unit-tests',
        profile: 'fast',
        status: 'required',
        command: 'npm run app:test',
        rationale: 'Protect reading-list behavior and regression coverage.'
      },
      {
        id: 'build',
        profile: 'full',
        status: 'required',
        command: 'npm run app:build',
        rationale: 'Prove the generated reading-list artifact can be created.'
      },
      {
        id: 'integration-tests',
        profile: 'full',
        status: 'required',
        command: 'npm run app:integration',
        rationale: 'Verify the end-to-end reading-list queue workflow.'
      },
      {
        id: 'migration-integrity',
        profile: 'full',
        status: 'not-applicable',
        command: '',
        rationale: 'The golden app has no database migration surface.'
      },
      {
        id: 'browser-smoke',
        profile: 'full',
        status: 'not-applicable',
        command: '',
        rationale: 'The golden app has no browser-rendered surface.'
      },
      {
        id: 'security-audit',
        profile: 'full',
        status: 'required',
        command: 'npm run app:security',
        rationale: 'Scan fixture app sources for forbidden dynamic execution and secret-like tokens.'
      },
      {
        id: 'release-verify',
        profile: 'release',
        status: 'required',
        command: 'npm run release:verify',
        rationale: 'Verify release completeness, evidence, and mapping before release promotion.'
      },
      {
        id: 'deploy-verify',
        profile: 'deploy',
        status: 'not-applicable',
        command: '',
        rationale: 'The golden app is not deployed by this fixture.'
      }
    ]
  };
  await fs.writeFile(
    path.join(repoDir, 'docs', 'governance', 'project-gates.json'),
    `${JSON.stringify(gates, null, 2)}\n`,
    'utf8'
  );
}

async function writeAppFiles(repoDir) {
  await fs.mkdir(path.join(repoDir, 'src'), { recursive: true });
  await fs.mkdir(path.join(repoDir, 'test'), { recursive: true });
  await fs.mkdir(path.join(repoDir, 'scripts'), { recursive: true });

  await fs.writeFile(
    path.join(repoDir, 'src', 'reading-list.js'),
    `const VALID_STATUSES = new Set(['queued', 'finished']);

function assertNonEmptyString(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(\`\${field} must be a non-empty string.\`);
  }
  return value.trim();
}

function normalizePriority(value) {
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw new RangeError('priority must be an integer from 1 through 5.');
  }
  return value;
}

export function normalizeBook(book) {
  if (!book || typeof book !== 'object' || Array.isArray(book)) {
    throw new TypeError('book must be an object.');
  }
  const status = book.status ?? 'queued';
  if (!VALID_STATUSES.has(status)) {
    throw new RangeError(\`unsupported status: \${status}\`);
  }
  return {
    id: assertNonEmptyString(book.id, 'id'),
    title: assertNonEmptyString(book.title, 'title'),
    author: assertNonEmptyString(book.author, 'author'),
    priority: normalizePriority(book.priority ?? 3),
    status,
    finishedAt: status === 'finished' ? assertNonEmptyString(book.finishedAt ?? 'recorded', 'finishedAt') : null
  };
}

export function createReadingList(entries = []) {
  const seen = new Set();
  return entries.map((entry) => {
    const book = normalizeBook(entry);
    if (seen.has(book.id)) {
      throw new Error(\`duplicate book id: \${book.id}\`);
    }
    seen.add(book.id);
    return book;
  });
}

export function addBook(list, book) {
  const current = createReadingList(list);
  const next = normalizeBook(book);
  if (current.some((entry) => entry.id === next.id)) {
    throw new Error(\`duplicate book id: \${next.id}\`);
  }
  return [...current, next];
}

export function markFinished(list, id, finishedAt = 'manual-check') {
  const targetId = assertNonEmptyString(id, 'id');
  let matched = false;
  const next = createReadingList(list).map((book) => {
    if (book.id !== targetId) {
      return book;
    }
    matched = true;
    return { ...book, status: 'finished', finishedAt: assertNonEmptyString(finishedAt, 'finishedAt') };
  });
  if (!matched) {
    throw new Error(\`unknown book id: \${targetId}\`);
  }
  return next;
}

export function nextBooks(list, limit = 3) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError('limit must be a positive integer.');
  }
  return createReadingList(list)
    .filter((book) => book.status === 'queued')
    .sort((left, right) => right.priority - left.priority || left.title.localeCompare(right.title))
    .slice(0, limit);
}
`,
    'utf8'
  );

  await fs.writeFile(
    path.join(repoDir, 'test', 'reading-list.test.mjs'),
    `import test from 'node:test';
import assert from 'node:assert/strict';
import { addBook, createReadingList, markFinished, nextBooks } from '../src/reading-list.js';

test('reading list validates identity and priority', () => {
  assert.throws(() => createReadingList([{ id: '', title: 'Dune', author: 'Frank Herbert' }]), /id/);
  assert.throws(() => createReadingList([{ id: 'dune', title: 'Dune', author: 'Frank Herbert', priority: 7 }]), /priority/);
});

test('reading list prevents duplicate ids', () => {
  const list = createReadingList([{ id: 'dune', title: 'Dune', author: 'Frank Herbert' }]);
  assert.throws(() => addBook(list, { id: 'dune', title: 'Dune Messiah', author: 'Frank Herbert' }), /duplicate/);
});

test('nextBooks returns queued books by priority then title', () => {
  const list = createReadingList([
    { id: 'b', title: 'Babel', author: 'R. F. Kuang', priority: 5 },
    { id: 'a', title: 'A Memory Called Empire', author: 'Arkady Martine', priority: 5 },
    { id: 'd', title: 'Dune', author: 'Frank Herbert', priority: 4 }
  ]);
  assert.deepEqual(nextBooks(list, 2).map((book) => book.id), ['a', 'b']);
});

test('markFinished records terminal state without mutating the input list', () => {
  const list = createReadingList([{ id: 'dune', title: 'Dune', author: 'Frank Herbert', priority: 4 }]);
  const next = markFinished(list, 'dune', '2026-05-12');
  assert.equal(list[0].status, 'queued');
  assert.equal(next[0].status, 'finished');
  assert.equal(next[0].finishedAt, '2026-05-12');
});
`,
    'utf8'
  );

  await fs.writeFile(
    path.join(repoDir, 'test', 'reading-list.integration.test.mjs'),
    `import test from 'node:test';
import assert from 'node:assert/strict';
import { addBook, createReadingList, markFinished, nextBooks } from '../src/reading-list.js';

test('operator can curate a queue and finish a book', () => {
  let list = createReadingList([]);
  list = addBook(list, { id: 'dune', title: 'Dune', author: 'Frank Herbert', priority: 4 });
  list = addBook(list, { id: 'babel', title: 'Babel', author: 'R. F. Kuang', priority: 5 });
  assert.deepEqual(nextBooks(list, 1).map((book) => book.id), ['babel']);

  list = markFinished(list, 'babel', '2026-05-12');
  assert.deepEqual(nextBooks(list, 2).map((book) => book.id), ['dune']);
});
`,
    'utf8'
  );

  await fs.writeFile(
    path.join(repoDir, 'scripts', 'app-contract-check.mjs'),
    `import assert from 'node:assert/strict';
import { addBook, createReadingList, markFinished, nextBooks } from '../src/reading-list.js';

const list = addBook(createReadingList([]), {
  id: 'left-hand',
  title: 'The Left Hand of Darkness',
  author: 'Ursula K. Le Guin',
  priority: 5
});
assert.equal(nextBooks(list, 1)[0].id, 'left-hand');
assert.equal(markFinished(list, 'left-hand', '2026-05-12')[0].status, 'finished');
assert.throws(() => addBook(list, { id: 'left-hand', title: 'Duplicate', author: 'Fixture' }), /duplicate/);
console.log('[app-contract] passed.');
`,
    'utf8'
  );

  await fs.writeFile(
    path.join(repoDir, 'scripts', 'app-build.mjs'),
    `import fs from 'node:fs/promises';
import { createReadingList, nextBooks } from '../src/reading-list.js';

const list = createReadingList([
  { id: 'dune', title: 'Dune', author: 'Frank Herbert', priority: 4 },
  { id: 'babel', title: 'Babel', author: 'R. F. Kuang', priority: 5 }
]);
await fs.mkdir('dist', { recursive: true });
await fs.writeFile(
  'dist/reading-list-summary.json',
  JSON.stringify({ generatedBy: 'golden-adopted-repo', next: nextBooks(list, 2) }, null, 2) + '\\n',
  'utf8'
);
console.log('[app-build] wrote dist/reading-list-summary.json');
`,
    'utf8'
  );

  await fs.writeFile(
    path.join(repoDir, 'scripts', 'app-security-check.mjs'),
    `import fs from 'node:fs/promises';
import path from 'node:path';

const roots = ['src', 'test'];
const forbidden = [/\\beval\\s*\\(/, /process\\.env/, /SECRET|TOKEN|PASSWORD/i];

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

for (const root of roots) {
  for (const file of await walk(root)) {
    const raw = await fs.readFile(file, 'utf8');
    for (const pattern of forbidden) {
      if (pattern.test(raw)) {
        throw new Error(\`Forbidden token matched in \${file}: \${pattern}\`);
      }
    }
  }
}
console.log('[app-security] passed.');
`,
    'utf8'
  );
}

async function writeProductDocs(repoDir) {
  const currentState = [
    '# Current State',
    '',
    'Status: canonical',
    `Owner: ${replacementForToken('DOC_OWNER')}`,
    `Last Updated: ${todayIsoDate()}`,
    'Source of Truth: This document.',
    `Current State Date: ${todayIsoDate()}`,
    '',
    'This repository is a golden adopted fixture for a small Reading List Node app.',
    '',
    '## Scope Snapshot',
    '',
    '- Operators can create a reading list from book records.',
    '- Operators can add unique books, mark books finished, and ask for the next queued books.',
    '- Generated artifacts export the next reading queue as JSON.',
    '',
    '## Current Product Surface',
    '',
    '- `primary users`: individual readers maintaining a local reading queue.',
    '- `core workflows`: create list, add book, finish book, export next queue.',
    '- `critical entities`: book records with stable `id`, `title`, `author`, `priority`, and `status`.',
    '- `privileged actions`: local build scripts write generated artifacts under `dist/`.',
    '- `external systems`: none.',
    '',
    '## Behavior Contracts',
    '',
    '- Book IDs must be unique and non-empty.',
    '- Priority must be an integer from 1 through 5.',
    '- Only queued books appear in `nextBooks` results.',
    '- Finished books retain a non-empty `finishedAt` marker.',
    '',
    '## Current Risks And Open Questions',
    '',
    '- Persistence is intentionally out of scope for this fixture.',
    '- Browser rendering is intentionally out of scope for this fixture.',
    '',
    '## Agent Use',
    '',
    '- Treat `src/reading-list.js` and `test/` as the live product proof for this fixture.',
    '- Keep project gates aligned with the real app commands in `docs/governance/project-gates.json`.'
  ].join('\n');

  await fs.writeFile(path.join(repoDir, 'docs', 'product-specs', 'CURRENT-STATE.md'), `${currentState}\n`, 'utf8');
}

async function writePlanEvidence(repoDir, releaseBase) {
  const today = todayIsoDate();
  const completedPlan = [
    '# Reading List Core',
    '',
    'Plan-ID: reading-list-core',
    'Done-Evidence: docs/exec-plans/evidence-index/reading-list-core.md',
    'Risk-Tier: low',
    'Delivery-Class: product',
    'Validation-Lanes: always',
    '',
    '## Metadata',
    '',
    '- Plan-ID: reading-list-core',
    '- Status: completed',
    '- Priority: p1',
    '- Owner: reading-list-platform',
    '- Acceptance-Criteria: Reading List validates book records, rejects duplicate IDs, orders queued books by priority, exports a JSON queue artifact, and passes fast/full gates.',
    '- Delivery-Class: product',
    '- Dependencies: none',
    '- Spec-Targets: docs/product-specs/CURRENT-STATE.md, docs/governance/project-gates.json',
    '- Implementation-Targets: src/reading-list.js, test/reading-list.test.mjs, test/reading-list.integration.test.mjs, scripts/app-build.mjs',
    '- Risk-Tier: low',
    '- Validation-Lanes: always',
    '- Security-Approval: not-required',
    '- Done-Evidence: docs/exec-plans/evidence-index/reading-list-core.md',
    '',
    '## Already-True Baseline',
    '',
    '- The adopted repository contains the full blueprint payload with placeholders replaced.',
    '- Project gates are wired to app-specific commands rather than harness-only commands.',
    '',
    '## Must-Land Checklist',
    '',
    '- [x] `ml-domain-core` Implement pure reading-list domain functions for validation, adding books, finishing books, and selecting the next queue.',
    '- [x] `ml-unit-coverage` Cover validation, duplicate IDs, queue ordering, and immutable finish behavior with node:test.',
    '- [x] `ml-full-gates` Wire lint, contract, unit, build, integration, and security gates through project-gates.',
    '- [x] `ml-product-state` Update current product state so agents know what behavior is real.',
    '',
    '## Deferred Follow-Ons',
    '',
    '- Persistent storage is intentionally deferred to `persist-reading-list`.',
    '- Browser rendering is intentionally out of scope for this fixture.',
    '',
    '## Validation Evidence',
    '',
    '- `npm run verify:fast`: passes and runs app lint, contract, and unit-test gates.',
    '- `npm run verify:full`: passes and runs app build, integration, and security gates.',
    `- \`npm run release:verify -- --base ${releaseBase}\`: passes on \`release/2026.05.12.1\`.`,
    '',
    '## Closure',
    '',
    `- Completed: ${today}`,
    '- Commit evidence: release branch commit body includes `Plan-ID: reading-list-core`.',
    '- Residual risk: no persistent storage; tracked as future slice `persist-reading-list`.'
  ].join('\n');

  const evidenceIndex = [
    '# Evidence: reading-list-core',
    '',
    `Generated: ${today}`,
    '',
    '## Evidence Summary',
    '',
    '- `npm run verify:fast` passed with app lint, contract, and unit tests.',
    '- `npm run verify:full` passed with build, integration, and security gates.',
    '- `npm run quality:score` returned score 100 with no warnings in the golden adopted repo.',
    `- \`npm run release:verify -- --base ${releaseBase}\` passed for the release slice.`,
    '',
    '## Residual Risk',
    '',
    '- Persistence is deferred to `persist-reading-list`.'
  ].join('\n');

  const futurePlan = [
    '# Persist Reading List',
    '',
    '## Metadata',
    '',
    '- Plan-ID: persist-reading-list',
    '- Status: ready-for-promotion',
    '- Priority: p2',
    '- Owner: reading-list-platform',
    '- Acceptance-Criteria: Reading List can save and reload book records from a local JSON file while preserving ID uniqueness, priority validation, and finished status.',
    '- Delivery-Class: product',
    '- Dependencies: reading-list-core',
    '- Spec-Targets: docs/product-specs/CURRENT-STATE.md, docs/RELIABILITY.md',
    '- Implementation-Targets: src/reading-list-store.js, test/reading-list-store.test.mjs',
    '- Risk-Tier: medium',
    '- Validation-Lanes: always',
    '- Security-Approval: not-required',
    '- Done-Evidence: pending',
    '',
    '## Already-True Baseline',
    '',
    '- `reading-list-core` provides pure domain functions and validation rules.',
    '- The current app has no persistent storage and no external systems.',
    '',
    '## Must-Land Checklist',
    '',
    '- [ ] `ml-store-contract` Add a JSON store module that saves and loads normalized book records.',
    '- [ ] `ml-store-tests` Cover missing file, invalid JSON, duplicate IDs, and finished-book reload behavior.',
    '- [ ] `ml-store-docs` Update current state with persistence behavior and operator recovery notes.',
    '',
    '## Deferred Follow-Ons',
    '',
    '- Multi-user sync and browser UI remain out of scope.',
    '- Database migrations remain out of scope until the app adopts a database.'
  ].join('\n');

  await fs.mkdir(path.join(repoDir, 'docs', 'exec-plans', 'evidence-index'), { recursive: true });
  await fs.writeFile(
    path.join(repoDir, 'docs', 'exec-plans', 'completed', '2026-05-12-reading-list-core.md'),
    `${completedPlan}\n`,
    'utf8'
  );
  await fs.writeFile(
    path.join(repoDir, 'docs', 'exec-plans', 'evidence-index', 'reading-list-core.md'),
    `${evidenceIndex}\n`,
    'utf8'
  );
  await fs.writeFile(
    path.join(repoDir, 'docs', 'future', '2026-05-12-persist-reading-list.md'),
    `${futurePlan}\n`,
    'utf8'
  );
}

function runGit(repoDir, args) {
  const result = spawnSync('git', args, {
    cwd: repoDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Golden Adopted Repo',
      GIT_AUTHOR_EMAIL: 'golden-adopted-repo@example.com',
      GIT_COMMITTER_NAME: 'Golden Adopted Repo',
      GIT_COMMITTER_EMAIL: 'golden-adopted-repo@example.com'
    }
  });
  if (result.error) {
    throw result.error;
  }
  if ((result.status ?? 1) !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function initializeReleaseHistory(repoDir) {
  runGit(repoDir, ['init', '-b', 'release/2026.05.12.1']);
  runGit(repoDir, ['add', '.']);
  runGit(repoDir, ['commit', '-m', 'chore: adopt blueprint baseline']);
  return runGit(repoDir, ['rev-parse', 'HEAD']);
}

function commitReleaseSlice(repoDir) {
  runGit(repoDir, ['add', '.']);
  runGit(repoDir, [
    'commit',
    '-m',
    'feat: add reading list core',
    '-m',
    'Plan-ID: reading-list-core'
  ]);
}

function runCommand(repoDir, command, extraEnv = {}) {
  console.log(`[golden-adopted-repo] ${command}`);
  const result = spawnSync(command, {
    cwd: repoDir,
    shell: true,
    stdio: 'inherit',
    // This repository has its own release history, not the parent Actions commit.
    env: { ...process.env, ...extraEnv, GITHUB_ACTIONS: 'false' }
  });
  if (result.error) {
    throw result.error;
  }
  if ((result.status ?? 1) !== 0) {
    throw new Error(`Command failed (${result.status ?? 1}): ${command}`);
  }
}

async function main() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'golden-adopted-repo-'));
  const repoDir = path.join(tempRoot, 'repo');
  const newRepoDir = path.join(tempRoot, 'new-repo');
  runBlueprint('harness-sync.mjs', ['install', '--target', newRepoDir]);
  await configureBlueprint(newRepoDir);
  const newLock = JSON.parse(await fs.readFile(path.join(newRepoDir, 'package-lock.json'), 'utf8'));
  assert.equal(newLock.lockfileVersion, 3);
  const unrun = spawnSync(process.execPath, ['scripts/agent-hardening/check-evals.mjs'], { cwd: newRepoDir, encoding: 'utf8' });
  assert.equal(unrun.status, 1);
  assert.match(unrun.stderr, /not a completed passing run/);

  await fs.mkdir(repoDir, { recursive: true });
  await writePackageJson(repoDir);
  await fs.mkdir(path.join(repoDir, 'src'), { recursive: true });
  const existingSource = 'export const existingProjectFile = true;\n';
  await fs.writeFile(path.join(repoDir, 'src/existing.js'), existingSource);
  const originalPackage = JSON.parse(await fs.readFile(path.join(repoDir, 'package.json'), 'utf8'));
  await fs.writeFile(path.join(repoDir, 'package-lock.json'), JSON.stringify({
    name: originalPackage.name, version: originalPackage.version, lockfileVersion: 3,
    packages: { '': { name: originalPackage.name, version: originalPackage.version } }
  }));
  runBlueprint('harness-sync.mjs', ['adopt', '--target', repoDir]);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(repoDir, 'package.json'), 'utf8')), originalPackage);
  const configured = await configureBlueprint(repoDir);
  for (const [name, command] of Object.entries(originalPackage.scripts)) assert.equal(configured.scripts[name], command);
  assert.equal(await fs.readFile(path.join(repoDir, 'src/existing.js'), 'utf8'), existingSource);
  const releaseBase = initializeReleaseHistory(repoDir);
  await writeAppFiles(repoDir);
  await writeArchitectureFiles(repoDir);
  await writeProjectGates(repoDir);
  await writeProductDocs(repoDir);
  await writePlanEvidence(repoDir, releaseBase);
  await runFixtureEvals(repoDir);
  runCommand(repoDir, 'npm run eval:refresh', { CI: '1' });
  runCommand(repoDir, 'npm run bootstrap:cleanup', { CI: '1' });
  commitReleaseSlice(repoDir);

  const commands = [
    'npm run harness:verify',
    'npm run docs:verify',
    'npm run quality:score',
    'npm run eval:verify',
    'npm run plans:verify -- --scope all',
    // Standalone full includes fast; run the adopted application's gates once.
    'npm run verify:full',
    `npm run release:verify -- --base ${releaseBase}`,
    `npm run release:notes -- --base ${releaseBase}`
  ];

  for (const command of commands) {
    runCommand(repoDir, command, { CI: '1' });
  }

  console.log(`[golden-adopted-repo] passed (${toPosix(repoDir)})`);
}

main().catch((error) => {
  console.error('[golden-adopted-repo] failed.');
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
