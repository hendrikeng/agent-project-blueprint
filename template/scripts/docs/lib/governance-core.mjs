import fs from 'node:fs/promises';
import path from 'node:path';
import { parseMustLandChecklist, parseMetadata, metadataValue as planMetadataValue } from '../../automation/lib/plan-metadata.mjs';

const DOC_REF_IN_CODE_REGEX = /`(AGENTS\.md|README\.md|ARCHITECTURE\.md|VISION\.md|docs\/[A-Za-z0-9_./-]+\.(?:md|MD|json|ya?ml))`/g;
const MD_LINK_REGEX = /\[[^\]]*\]\(([^)]+)\)/g;

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function normalizePrefixList(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((entry) => toPosix(String(entry ?? '').trim()).replace(/^\/+/, ''))
      .filter(Boolean)
      .map((entry) => (entry.endsWith('/') ? entry : `${entry}/`))
  )];
}

function hasAnyPrefix(value, prefixes) {
  const normalized = toPosix(String(value ?? '').trim()).replace(/^\/+/, '');
  return prefixes.some((prefix) => normalized.startsWith(prefix));
}

function toDate(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function parseIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) {
    return null;
  }
  return toDate(`${value}T00:00:00Z`);
}

function metadataValue(content, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = content.match(new RegExp(`^${escaped}:\\s+(.+)$`, 'm'));
  return match ? match[1].trim() : null;
}

function isTemplatePlaceholder(value) {
  return /^\{\{[A-Z0-9_]+\}\}$/.test((value ?? '').trim());
}

function extractRawDateByStrategy(content, strategy) {
  if (!strategy || typeof strategy !== 'object') {
    return null;
  }

  if (strategy.type === 'metadata_field') {
    return metadataValue(content, strategy.field);
  }

  if (strategy.type === 'regex') {
    const regex = new RegExp(strategy.pattern, 'm');
    const match = content.match(regex);
    if (!match) {
      return null;
    }
    const capture = match[Number(strategy.group ?? 1)] ?? null;
    return capture ? capture.trim() : null;
  }

  return null;
}

function normalizeRef(rawRef, sourceFile) {
  const trimmed = rawRef.trim();
  if (!trimmed) {
    return null;
  }

  if (
    trimmed.startsWith('#') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://')
  ) {
    return null;
  }

  const noHash = trimmed.split('#')[0]?.split('?')[0] ?? '';
  if (!noHash) {
    return null;
  }

  if (noHash.startsWith('/')) {
    return toPosix(noHash.slice(1));
  }

  if (/^(?:AGENTS\.md|README\.md|ARCHITECTURE\.md|VISION\.md|docs\/)/.test(noHash)) {
    return toPosix(path.normalize(noHash));
  }

  const sourceDir = path.dirname(sourceFile);
  return toPosix(path.normalize(path.join(sourceDir, noHash)));
}

function extractRefs(content, sourceFile) {
  const refs = new Set();

  for (const match of content.matchAll(DOC_REF_IN_CODE_REGEX)) {
    refs.add(match[1]);
  }

  for (const match of content.matchAll(MD_LINK_REGEX)) {
    const normalized = normalizeRef(match[1], sourceFile);
    if (normalized) {
      refs.add(normalized);
    }
  }

  return refs;
}

function parseDateByStrategy(content, strategy) {
  const rawValue = extractRawDateByStrategy(content, strategy);
  if (!rawValue) {
    return null;
  }

  if (strategy?.format === 'iso-date') {
    return parseIsoDate(rawValue);
  }

  return toDate(rawValue);
}

function daysBetween(a, b) {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function makeFinding(level, code, message, file = null) {
  return { level, code, message, file };
}

function formatRefForExistence(ref) {
  return ref.endsWith('/') ? ref.slice(0, -1) : ref;
}

async function exists(absPath) {
  try {
    await fs.access(absPath);
    return true;
  } catch {
    return false;
  }
}

function isWithinRoot(rootDir, absPath) {
  const relative = path.relative(rootDir, absPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveConfigPath(rootDir, relPath, errors, code, label) {
  const normalized = toPosix(String(relPath ?? '').trim()).replace(/^\/+/, '');
  const abs = path.resolve(rootDir, normalized);
  if (!normalized || !isWithinRoot(rootDir, abs)) {
    errors.push(makeFinding('error', code, `${label} escapes repository root: ${String(relPath)}`, String(relPath)));
    return null;
  }
  return { rel: normalized, abs };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function schemaTypeMatches(value, type) {
  if (type === 'object') return isPlainObject(value);
  if (type === 'array') return Array.isArray(value);
  if (type === 'integer') return Number.isInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'string') return typeof value === 'string';
  if (type === 'boolean') return typeof value === 'boolean';
  return true;
}

function validateJsonSchemaSubset(value, schema, pathLabel = '$') {
  const findings = [];

  function visit(currentValue, currentSchema, currentPath) {
    if (!isPlainObject(currentSchema)) {
      return;
    }

    const type = currentSchema.type;
    if (type && !schemaTypeMatches(currentValue, type)) {
      findings.push(`${currentPath} must be ${type}.`);
      return;
    }

    if (Array.isArray(currentSchema.enum) && !currentSchema.enum.includes(currentValue)) {
      findings.push(`${currentPath} must be one of: ${currentSchema.enum.join(', ')}.`);
    }

    if (typeof currentValue === 'string') {
      if (Number.isInteger(currentSchema.minLength) && currentValue.length < currentSchema.minLength) {
        findings.push(`${currentPath} must be at least ${currentSchema.minLength} characters.`);
      }
      if (currentSchema.pattern) {
        const regex = new RegExp(currentSchema.pattern);
        if (!regex.test(currentValue)) {
          findings.push(`${currentPath} must match pattern ${currentSchema.pattern}.`);
        }
      }
    }

    if (Number.isInteger(currentSchema.minimum) && typeof currentValue === 'number' && currentValue < currentSchema.minimum) {
      findings.push(`${currentPath} must be >= ${currentSchema.minimum}.`);
    }

    if (Array.isArray(currentValue)) {
      if (Number.isInteger(currentSchema.minItems) && currentValue.length < currentSchema.minItems) {
        findings.push(`${currentPath} must contain at least ${currentSchema.minItems} item(s).`);
      }
      if (currentSchema.items) {
        currentValue.forEach((item, index) => visit(item, currentSchema.items, `${currentPath}[${index}]`));
      }
    }

    if (isPlainObject(currentValue)) {
      const required = Array.isArray(currentSchema.required) ? currentSchema.required : [];
      for (const key of required) {
        if (!Object.prototype.hasOwnProperty.call(currentValue, key)) {
          findings.push(`${currentPath}.${key} is required.`);
        }
      }

      const properties = isPlainObject(currentSchema.properties) ? currentSchema.properties : {};
      for (const [key, propertySchema] of Object.entries(properties)) {
        if (Object.prototype.hasOwnProperty.call(currentValue, key)) {
          visit(currentValue[key], propertySchema, `${currentPath}.${key}`);
        }
      }

      const keys = Object.keys(currentValue);
      if (Number.isInteger(currentSchema.minProperties) && keys.length < currentSchema.minProperties) {
        findings.push(`${currentPath} must contain at least ${currentSchema.minProperties} propert(ies).`);
      }

      if (currentSchema.additionalProperties === false) {
        for (const key of keys) {
          if (!Object.prototype.hasOwnProperty.call(properties, key)) {
            findings.push(`${currentPath}.${key} is not allowed.`);
          }
        }
      } else if (isPlainObject(currentSchema.additionalProperties)) {
        for (const key of keys) {
          if (!Object.prototype.hasOwnProperty.call(properties, key)) {
            visit(currentValue[key], currentSchema.additionalProperties, `${currentPath}.${key}`);
          }
        }
      }
    }
  }

  visit(value, schema, pathLabel);
  return findings;
}

async function walkMarkdownFiles(baseDir) {
  const results = [];

  async function walk(current) {
    let entries = [];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'dist') {
        continue;
      }

      const nextPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(nextPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        results.push(nextPath);
      }
    }
  }

  await walk(baseDir);
  return results;
}

export async function loadGovernanceConfig(configPath) {
  const raw = await fs.readFile(configPath, 'utf8');
  return JSON.parse(raw);
}

export async function runGovernanceAnalysis({
  rootDir,
  configPath,
  now = new Date(),
  staleDaysOverride = null
}) {
  const config = await loadGovernanceConfig(configPath);
  const errors = [];
  const warnings = [];
  let activePlansAnalyzed = 0;

  const docsDir = path.join(rootDir, 'docs');
  const markdownFilesAbs = await walkMarkdownFiles(docsDir);
  const markdownExcludePrefixes = normalizePrefixList(
    config.markdownExcludePrefixes ?? []
  );
  const markdownFilesRel = markdownFilesAbs
    .map((entry) => toPosix(path.relative(rootDir, entry)))
    .filter((rel) => !hasAnyPrefix(rel, markdownExcludePrefixes) &&
      !/^docs\/(?:future|exec-plans\/(?:active|completed))\/(?:.*\/)?evidence\//.test(rel));

  const explicitScanFilesRel = [
    'AGENTS.md',
    'README.md',
    'ARCHITECTURE.md',
    ...((config.scanFiles ?? []).map((rel) => toPosix(String(rel ?? '').trim())).filter(Boolean))
  ];

  const sourceFiles = [...new Set([...explicitScanFilesRel, ...markdownFilesRel])];

  const contents = new Map();
  const refsGraph = new Map();

  for (const rel of sourceFiles) {
    const resolved = resolveConfigPath(rootDir, rel, errors, 'OUT_OF_REPO_SCAN_FILE', 'Scan file');
    if (!resolved) {
      continue;
    }
    const fileAbs = resolved.abs;
    if (!(await exists(fileAbs))) {
      continue;
    }

    const content = await fs.readFile(fileAbs, 'utf8');
    contents.set(resolved.rel, content);
    refsGraph.set(resolved.rel, extractRefs(content, resolved.rel));
  }

  for (const rel of config.canonicalDocs ?? []) {
    const resolved = resolveConfigPath(rootDir, rel, errors, 'OUT_OF_REPO_CANONICAL_DOC', 'Canonical doc');
    if (!resolved) {
      continue;
    }
    const abs = resolved.abs;
    if (!(await exists(abs))) {
      errors.push(makeFinding('error', 'MISSING_CANONICAL_DOC', `Missing canonical doc: ${resolved.rel}`, resolved.rel));
    }
  }

  const budgets = config.sizeBudgets;
  if (budgets) {
    const excluded = normalizePrefixList(budgets.excludePrefixes);
    const limits = budgets.limits ?? {};
    if (!Number.isInteger(budgets.defaultMaxBytes) || budgets.defaultMaxBytes <= 0 ||
        !isPlainObject(limits) || Object.values(limits).some(value => !Number.isInteger(value) || value <= 0)) {
      errors.push(makeFinding('error', 'INVALID_DOC_BUDGET', 'Documentation byte budgets must be positive integers.'));
    } else {
      for (const [file, content] of contents) {
        if (!file.endsWith('.md') || hasAnyPrefix(file, excluded)) continue;
        const limit = limits[file] ?? budgets.defaultMaxBytes;
        const bytes = Buffer.byteLength(content, 'utf8');
        if (bytes > limit) errors.push(makeFinding('error', 'DOC_SIZE_BUDGET',
          `${bytes} UTF-8 bytes exceeds ${limit}. Replace obsolete claims and link detailed contracts; preserve historical evidence.`, file));
        if ((file.startsWith('docs/future/') || file.startsWith('docs/exec-plans/active/')) && path.basename(file) !== 'README.md' && !file.split('/').includes('evidence')) {
          const items = parseMustLandChecklist(content);
          const awaitingValidation = file.startsWith('docs/exec-plans/active/') &&
            ['validation', 'in-review'].includes(planMetadataValue(parseMetadata(content), 'Status'));
          if (items.length && items.every(item => item.checked) && !awaitingValidation) errors.push(makeFinding('error', 'FINISHED_PLAN_IN_QUEUE',
            'No unchecked must-land items remain. Close or correct this plan and update current product state.', file));
        }
      }
    }
  }

  for (const rel of config.requiredDirs ?? []) {
    const resolved = resolveConfigPath(rootDir, rel, errors, 'OUT_OF_REPO_REQUIRED_DIR', 'Required directory');
    if (!resolved) {
      continue;
    }
    const abs = resolved.abs;
    let stat = null;
    try {
      stat = await fs.stat(abs);
    } catch {
      stat = null;
    }

    if (!stat?.isDirectory()) {
      errors.push(makeFinding('error', 'MISSING_REQUIRED_DIR', `Missing required docs directory: ${resolved.rel}`, resolved.rel));
    }
  }

  const docsIndexPath = config.docsIndexPath ?? 'docs/MANIFEST.md';
  const docsIndexContent = contents.get(docsIndexPath);
  if (!docsIndexContent) {
    errors.push(makeFinding('error', 'MISSING_DOCS_INDEX', `Missing docs index: ${docsIndexPath}`, docsIndexPath));
  } else {
    for (const requiredEntry of config.requiredIndexEntries ?? []) {
      const backtickRef = `\`${requiredEntry}\``;
      const parenRef = `(${requiredEntry})`;
      if (!docsIndexContent.includes(backtickRef) && !docsIndexContent.includes(parenRef)) {
        errors.push(
          makeFinding(
            'error',
            'MISSING_INDEX_ENTRY',
            `${docsIndexPath} is missing required entry: ${requiredEntry}`,
            docsIndexPath
          )
        );
      }
    }
  }

  const requiredLinks = config.requiredLinks ?? {};
  for (const [sourceFile, links] of Object.entries(requiredLinks)) {
    const content = contents.get(sourceFile);
    if (!content) {
      errors.push(makeFinding('error', 'MISSING_REQUIRED_LINK_SOURCE', `Missing required link source: ${sourceFile}`, sourceFile));
      continue;
    }

    for (const link of links) {
      if (!content.includes(link)) {
        errors.push(
          makeFinding(
            'error',
            'MISSING_REQUIRED_LINK',
            `${sourceFile} is missing required reference: ${link}`,
            sourceFile
          )
        );
      }
    }
  }

  const requiredHeadings = config.requiredHeadings ?? {};
  for (const [sourceFile, headings] of Object.entries(requiredHeadings)) {
    const content = contents.get(sourceFile);
    if (!content) {
      errors.push(makeFinding('error', 'MISSING_HEADING_SOURCE', `Missing heading source file: ${sourceFile}`, sourceFile));
      continue;
    }

    for (const heading of headings) {
      const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`^##\\s+${escaped}\\s*$`, 'm');
      if (!regex.test(content)) {
        errors.push(
          makeFinding(
            'error',
            'MISSING_REQUIRED_HEADING',
            `Missing required heading \"## ${heading}\" in ${sourceFile}`,
            sourceFile
          )
        );
      }
    }
  }

  const metadataRules = config.metadataRules ?? [];
  for (const rule of metadataRules) {
    const content = contents.get(rule.path);
    if (!content) {
      errors.push(makeFinding('error', 'MISSING_METADATA_TARGET', `Missing metadata target: ${rule.path}`, rule.path));
      continue;
    }

    for (const field of rule.requiredFields ?? []) {
      if (!metadataValue(content, field)) {
        errors.push(
          makeFinding(
            'error',
            'MISSING_METADATA_FIELD',
            `Missing metadata field \"${field}:\" in ${rule.path}`,
            rule.path
          )
        );
      }
    }
  }

  const staleness = config.staleness ?? null;
  const templateMode =
    isTemplatePlaceholder(metadataValue(contents.get('AGENTS.md') ?? '', 'Owner')) &&
    isTemplatePlaceholder(metadataValue(contents.get('AGENTS.md') ?? '', 'Last Updated')) &&
    isTemplatePlaceholder(metadataValue(contents.get('README.md') ?? '', 'Owner')) &&
    isTemplatePlaceholder(metadataValue(contents.get('README.md') ?? '', 'Last Updated')) &&
    isTemplatePlaceholder(metadataValue(contents.get('README.md') ?? '', 'Current State Date')) &&
    isTemplatePlaceholder(metadataValue(contents.get('ARCHITECTURE.md') ?? '', 'Owner')) &&
    isTemplatePlaceholder(metadataValue(contents.get('ARCHITECTURE.md') ?? '', 'Last Updated'));

  if (staleness) {
    const maxAgeDays = Number.isInteger(staleDaysOverride) && staleDaysOverride > 0
      ? staleDaysOverride
      : Number(staleness.maxAgeDays ?? 0);

    if (!Number.isInteger(maxAgeDays) || maxAgeDays <= 0) {
      errors.push(makeFinding('error', 'INVALID_STALE_DAYS', 'staleness.maxAgeDays must be a positive integer.'));
    } else {
      for (const target of staleness.targets ?? []) {
        const entry = typeof target === 'string'
          ? { path: target, strategy: staleness.defaultStrategy }
          : target;

        const filePath = entry.path;
        const content = contents.get(filePath);
        if (!content) {
          errors.push(makeFinding('error', 'MISSING_STALENESS_TARGET', `Missing staleness target: ${filePath}`, filePath));
          continue;
        }

        const strategy = entry.strategy ?? staleness.defaultStrategy;
        const rawDate = extractRawDateByStrategy(content, strategy);
        const parsedDate = parseDateByStrategy(content, strategy);
        if (!parsedDate) {
          if (templateMode && isTemplatePlaceholder(rawDate)) {
            continue;
          }
          errors.push(
            makeFinding(
              'error',
              'MISSING_STALENESS_TIMESTAMP',
              `Missing or invalid freshness timestamp in ${filePath}`,
              filePath
            )
          );
          continue;
        }

        const age = daysBetween(parsedDate, now);
        if (age < 0) {
          errors.push(
            makeFinding(
              'error',
              'FUTURE_DOC_TIMESTAMP',
              `Freshness timestamp is in the future for ${filePath}`,
              filePath
            )
          );
          continue;
        }
        if (age > maxAgeDays) {
          const level = staleness.level === 'warning' ? 'warning' : 'error';
          (level === 'warning' ? warnings : errors).push(
            makeFinding(
              level,
              'STALE_DOC',
              `Stale document (${age} days): ${filePath} (max ${maxAgeDays})`,
              filePath
            )
          );
        }
      }
    }
  }

  for (const [sourceFile, refs] of refsGraph.entries()) {
    for (const ref of refs) {
      const normalized = formatRefForExistence(ref);
      const abs = path.resolve(rootDir, normalized);
      if (!isWithinRoot(rootDir, abs)) {
        errors.push(
          makeFinding(
            'error',
            'OUT_OF_REPO_DOC_REF',
            `Reference escapes repository root in ${sourceFile}: ${ref}`,
            sourceFile
          )
        );
        continue;
      }
      if (!(await exists(abs))) {
        errors.push(
          makeFinding(
            'error',
            'BROKEN_DOC_REF',
            `Broken reference in ${sourceFile}: ${ref}`,
            sourceFile
          )
        );
      }
    }
  }

  const activePlansConfig = config.activePlans ?? null;
  if (activePlansConfig) {
    const activeDirRel = activePlansConfig.directory;
    const activeDir = resolveConfigPath(rootDir, activeDirRel, errors, 'OUT_OF_REPO_ACTIVE_PLAN_DIR', 'Active plans directory');
    const activeDirAbs = activeDir?.abs;
    let activeEntries = [];
    try {
      activeEntries = activeDirAbs ? await fs.readdir(activeDirAbs, { withFileTypes: true }) : [];
    } catch {
      errors.push(makeFinding('error', 'MISSING_ACTIVE_PLAN_DIR', `Missing active plans directory: ${activeDirRel}`, activeDirRel));
      activeEntries = [];
    }

    const exclude = new Set(activePlansConfig.excludeFiles ?? ['README.md']);
    const planFiles = activeEntries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md') && !exclude.has(entry.name))
      .map((entry) => `${activeDirRel}/${entry.name}`)
      .sort((a, b) => a.localeCompare(b));
    activePlansAnalyzed = planFiles.length;

    for (const planFile of planFiles) {
      const content = contents.get(planFile) ?? (await fs.readFile(path.join(rootDir, planFile), 'utf8'));

      if (activePlansConfig.requireMetadataSection && !content.includes('## Metadata')) {
        errors.push(makeFinding('error', 'MISSING_PLAN_METADATA_SECTION', `Missing ## Metadata section: ${planFile}`, planFile));
      }

      for (const field of activePlansConfig.requiredMetadataFields ?? []) {
        if (!content.includes(`- ${field}:`)) {
          errors.push(
            makeFinding(
              'error',
              'MISSING_PLAN_METADATA_FIELD',
              `Missing metadata field \"${field}\" in ${planFile}`,
              planFile
            )
          );
        }
      }
    }
  }

  const completedPlansConfig = config.completedPlans ?? null;
  if (completedPlansConfig) {
    const completedDirRel = completedPlansConfig.directory;
    const completedDir = resolveConfigPath(rootDir, completedDirRel, errors, 'OUT_OF_REPO_COMPLETED_PLAN_DIR', 'Completed plans directory');
    const completedDirAbs = completedDir?.abs;
    try {
      if (completedDirAbs) await fs.readdir(completedDirAbs);
    } catch {
      errors.push(makeFinding('error', 'MISSING_COMPLETED_PLAN_DIR', `Missing completed plans directory: ${completedDirRel}`, completedDirRel));
    }

    const exclude = new Set(completedPlansConfig.excludeFiles ?? ['README.md']);
    const completedFiles = completedDirAbs ? (await walkMarkdownFiles(completedDirAbs))
      .filter(file => !exclude.has(path.basename(file)) && !path.relative(completedDirAbs, file).split(path.sep).includes('evidence'))
      .map(file => toPosix(path.relative(rootDir, file))).sort() : [];

    for (const filePath of completedFiles) {
      const content = contents.get(filePath) ?? (await fs.readFile(path.join(rootDir, filePath), 'utf8'));
      for (const patternRule of completedPlansConfig.requiredPatterns ?? []) {
        const regex = new RegExp(patternRule.regex, 'm');
        if (!regex.test(content)) {
          errors.push(
            makeFinding(
              'error',
              'MISSING_COMPLETED_PLAN_FIELD',
              `${filePath} missing completed-plan requirement: ${patternRule.message}`,
              filePath
            )
          );
        }
      }
    }
  }

  const dateCoupling = config.currentStateDateCoupling ?? null;
  if (dateCoupling) {
    const readme = contents.get(dateCoupling.readmePath);
    const currentState = contents.get(dateCoupling.currentStatePath);

    if (!readme) {
      errors.push(makeFinding('error', 'MISSING_DATE_COUPLING_README', `Missing file: ${dateCoupling.readmePath}`, dateCoupling.readmePath));
    }
    if (!currentState) {
      errors.push(makeFinding('error', 'MISSING_DATE_COUPLING_STATE', `Missing file: ${dateCoupling.currentStatePath}`, dateCoupling.currentStatePath));
    }

    if (readme && currentState) {
      const field = dateCoupling.fieldName ?? 'Current State Date';
      const readmeDateRaw = metadataValue(readme, field);
      const stateDateRaw = metadataValue(currentState, field);

      const readmeDate = parseIsoDate(readmeDateRaw ?? '');
      const stateDate = parseIsoDate(stateDateRaw ?? '');
      const skipTemplateCoupling =
        templateMode &&
        isTemplatePlaceholder(readmeDateRaw) &&
        isTemplatePlaceholder(stateDateRaw);

      if (!skipTemplateCoupling) {
        if (!readmeDate) {
          errors.push(makeFinding('error', 'INVALID_README_STATE_DATE', `Invalid ${field} in ${dateCoupling.readmePath}`, dateCoupling.readmePath));
        }
        if (!stateDate) {
          errors.push(makeFinding('error', 'INVALID_PRODUCT_STATE_DATE', `Invalid ${field} in ${dateCoupling.currentStatePath}`, dateCoupling.currentStatePath));
        }
        if (readmeDate && stateDate && stateDate.getTime() < readmeDate.getTime()) {
          errors.push(
            makeFinding(
              'error',
              'PRODUCT_STATE_DATE_BEHIND_README',
              `${dateCoupling.currentStatePath} ${field} must be >= ${dateCoupling.readmePath}`,
              dateCoupling.currentStatePath
            )
          );
        }
      }
    }
  }

  for (const validation of config.jsonSchemaValidation ?? []) {
    const dataPath = validation.dataPath;
    const schemaPath = validation.schemaPath;
    if (!dataPath || !schemaPath) {
      errors.push(makeFinding('error', 'INVALID_SCHEMA_VALIDATION_CONFIG', 'jsonSchemaValidation entries require dataPath and schemaPath.'));
      continue;
    }

    let data = null;
    let schema = null;
    const resolvedDataPath = resolveConfigPath(rootDir, dataPath, errors, 'OUT_OF_REPO_SCHEMA_VALIDATION_DATA', 'Schema validation data path');
    const resolvedSchemaPath = resolveConfigPath(rootDir, schemaPath, errors, 'OUT_OF_REPO_SCHEMA_VALIDATION_SCHEMA', 'Schema validation schema path');
    if (!resolvedDataPath || !resolvedSchemaPath) {
      continue;
    }
    try {
      data = JSON.parse(await fs.readFile(resolvedDataPath.abs, 'utf8'));
    } catch (error) {
      errors.push(
        makeFinding(
          'error',
          'INVALID_SCHEMA_VALIDATION_DATA',
          `Unable to read or parse schema validation data ${dataPath}: ${error instanceof Error ? error.message : String(error)}`,
          dataPath
        )
      );
      continue;
    }
    try {
      schema = JSON.parse(await fs.readFile(resolvedSchemaPath.abs, 'utf8'));
    } catch (error) {
      errors.push(
        makeFinding(
          'error',
          'INVALID_SCHEMA_VALIDATION_SCHEMA',
          `Unable to read or parse schema ${schemaPath}: ${error instanceof Error ? error.message : String(error)}`,
          schemaPath
        )
      );
      continue;
    }

    const schemaFindings = validateJsonSchemaSubset(data, schema);
    for (const finding of schemaFindings) {
      errors.push(
        makeFinding(
          'error',
          'JSON_SCHEMA_VALIDATION_FAILED',
          `${dataPath} does not satisfy ${schemaPath}: ${finding}`,
          dataPath
        )
      );
    }
  }

  const techDebt = config.techDebtTracker ?? null;
  if (techDebt) {
    const content = contents.get(techDebt.path);
    if (!content) {
      errors.push(makeFinding('error', 'MISSING_TECH_DEBT_TRACKER', `Missing file: ${techDebt.path}`, techDebt.path));
    } else {
      const regex = new RegExp(techDebt.activePlanRegex, 'g');
      for (const match of content.matchAll(regex)) {
        const activePlanPath = match[1];
        if (!(await exists(path.join(rootDir, activePlanPath)))) {
          errors.push(
            makeFinding(
              'error',
              'MISSING_ACTIVE_PLAN_REF',
              `Tech debt tracker references missing active plan: ${activePlanPath}`,
              techDebt.path
            )
          );
        }
      }
    }
  }

  for (const artifact of config.generatedArtifacts ?? []) {
    const resolvedArtifact = resolveConfigPath(rootDir, artifact.path, errors, 'OUT_OF_REPO_GENERATED_ARTIFACT', 'Generated artifact path');
    if (!resolvedArtifact) {
      continue;
    }
    const artifactAbs = resolvedArtifact.abs;
    if (!(await exists(artifactAbs))) {
      errors.push(makeFinding('error', 'MISSING_GENERATED_ARTIFACT', `Missing generated artifact: ${artifact.path}`, artifact.path));
      continue;
    }

    const raw = await fs.readFile(artifactAbs, 'utf8');
    let parsedDate = null;

    if (artifact.timestampRegex) {
      const regex = new RegExp(artifact.timestampRegex, 'm');
      const match = raw.match(regex);
      const capture = match?.[Number(artifact.timestampGroup ?? 1)] ?? null;
      parsedDate = capture ? toDate(capture.trim()) : null;
    } else if (artifact.timestampJsonField) {
      try {
        const json = JSON.parse(raw);
        parsedDate = toDate(json[artifact.timestampJsonField]);
      } catch {
        parsedDate = null;
      }
    }

    if (!parsedDate) {
      errors.push(
        makeFinding(
          'error',
          'MISSING_GENERATED_ARTIFACT_TIMESTAMP',
          `Generated artifact missing parsable timestamp: ${artifact.path}`,
          artifact.path
        )
      );
      continue;
    }

    const maxAgeDays = Number(artifact.maxAgeDays ?? 0);
    if (!Number.isInteger(maxAgeDays) || maxAgeDays <= 0) {
      errors.push(makeFinding('error', 'INVALID_GENERATED_ARTIFACT_MAX_AGE', `Invalid maxAgeDays for ${artifact.path}`, artifact.path));
      continue;
    }

    const age = daysBetween(parsedDate, now);
    if (age < 0) {
      errors.push(
        makeFinding(
          'error',
          'FUTURE_GENERATED_ARTIFACT_TIMESTAMP',
          `Generated artifact timestamp is in the future for ${artifact.path}`,
          artifact.path
        )
      );
      continue;
    }
    if (age > maxAgeDays) {
      errors.push(
        makeFinding(
          'error',
          'STALE_GENERATED_ARTIFACT',
          `Stale generated artifact (${age} days): ${artifact.path} (max ${maxAgeDays})`,
          artifact.path
        )
      );
    }
  }

  const docFiles = [...contents.keys()].filter((file) => file.startsWith('docs/') && file.toLowerCase().endsWith('.md'));
  const seeds = config.graphSeeds ?? ['AGENTS.md', 'README.md', docsIndexPath];
  const visited = new Set();
  const queue = [...seeds];

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next || visited.has(next)) {
      continue;
    }

    visited.add(next);

    const refs = refsGraph.get(next);
    if (!refs) {
      continue;
    }

    for (const ref of refs) {
      if (contents.has(ref) && !visited.has(ref)) {
        queue.push(ref);
      }
    }
  }

  const unreachablePolicy = config.unreachablePolicy ?? { scope: 'all_docs', level: 'warning' };
  const unreachableLevel = unreachablePolicy.level === 'error' ? 'error' : 'warning';
  const canonicalDocSet = new Set(
    (config.canonicalDocs ?? []).filter((file) => file.startsWith('docs/') && file.toLowerCase().endsWith('.md'))
  );

  const reachabilityScope = unreachablePolicy.scope ?? 'all_docs';
  const reachabilityTargets = reachabilityScope === 'canonical'
    ? docFiles.filter((file) => canonicalDocSet.has(file))
    : docFiles;

  const unreachable = reachabilityTargets
    .filter((file) => !visited.has(file))
    .sort((a, b) => a.localeCompare(b));

  const unreachableCollection = unreachableLevel === 'error' ? errors : warnings;
  for (const file of unreachable) {
    unreachableCollection.push(
      makeFinding(
        unreachableLevel,
        'UNREACHABLE_DOC',
        `Doc is not reachable from AGENTS/README/docs-index graph: ${file}`,
        file
      )
    );
  }

  return {
    config,
    errors,
    warnings,
    stats: {
      markdownFilesAnalyzed: sourceFiles.length,
      docFilesAnalyzed: docFiles.length,
      activePlansAnalyzed,
      brokenRefCount: errors.filter((finding) => finding.code === 'BROKEN_DOC_REF').length
    }
  };
}
