import fs from 'node:fs/promises';
import path from 'node:path';

export const FUTURE_STATUSES = new Set(['draft', 'ready-for-promotion']);
export const ACTIVE_STATUSES = new Set(['queued', 'in-progress', 'in-review', 'budget-exhausted', 'blocked', 'validation']);
export const COMPLETED_STATUSES = new Set(['completed']);
export const PRIORITIES = new Set(['p0', 'p1', 'p2', 'p3']);
export const RISK_TIERS = new Set(['low', 'medium', 'high']);
export const SECURITY_APPROVAL_VALUES = new Set(['not-required', 'pending', 'approved']);
export const DELIVERY_CLASSES = new Set(['product', 'docs', 'ops', 'reconciliation']);
export const VALIDATION_LANES = new Set(['always', 'host-required']);
export const PLAN_ID_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const REQUIRED_METADATA_FIELDS = {
  future: [
    'Plan-ID',
    'Status',
    'Priority',
    'Owner',
    'Acceptance-Criteria',
    'Delivery-Class',
    'Dependencies',
    'Spec-Targets',
    'Implementation-Targets',
    'Risk-Tier',
    'Validation-Lanes',
    'Security-Approval',
    'Done-Evidence'
  ],
  active: [
    'Plan-ID',
    'Status',
    'Priority',
    'Owner',
    'Acceptance-Criteria',
    'Delivery-Class',
    'Dependencies',
    'Spec-Targets',
    'Implementation-Targets',
    'Risk-Tier',
    'Validation-Lanes',
    'Security-Approval',
    'Done-Evidence'
  ],
  completed: [
    'Plan-ID',
    'Status',
    'Priority',
    'Owner',
    'Acceptance-Criteria',
    'Delivery-Class',
    'Dependencies',
    'Spec-Targets',
    'Implementation-Targets',
    'Risk-Tier',
    'Validation-Lanes',
    'Security-Approval',
    'Done-Evidence'
  ]
};

function normalizeKey(key) {
  return String(key ?? '').trim().toLowerCase();
}

export function normalizePlanId(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function isValidPlanId(value) {
  const normalized = normalizePlanId(value);
  return normalized.length > 0 && PLAN_ID_REGEX.test(normalized);
}

export function parsePlanId(value, fallback = null) {
  const normalized = normalizePlanId(value);
  return isValidPlanId(normalized) ? normalized : fallback;
}

function parseMetadataSectionRange(content) {
  const lines = String(content ?? '').split(/\r?\n/);
  let start = -1;

  for (let index = 0; index < lines.length; index += 1) {
    if (/^##\s+Metadata\s*$/i.test(lines[index])) {
      start = index;
      break;
    }
  }

  if (start === -1) {
    return null;
  }

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^##\s+/.test(line)) {
      end = index;
      break;
    }
  }

  return { lines, start, end };
}

export function parseMetadata(content) {
  const range = parseMetadataSectionRange(content);
  const fields = new Map();
  if (!range) {
    return fields;
  }

  for (const line of range.lines.slice(range.start + 1, range.end)) {
    const match = line.match(/^\s*-\s*([A-Za-z][A-Za-z0-9- ]+):\s*(.*)$/);
    if (!match) {
      continue;
    }
    const key = match[1].trim();
    const normalizedKey = normalizeKey(key);
    if (fields.has(normalizedKey)) {
      continue;
    }
    fields.set(normalizedKey, {
      key,
      value: match[2].trim()
    });
  }

  return fields;
}

export function metadataValue(metadata, key, fallback = '') {
  if (!(metadata instanceof Map)) {
    return fallback;
  }
  const entry = metadata.get(normalizeKey(key));
  return entry ? entry.value : fallback;
}

function metadataKeysInOrder(content) {
  const range = parseMetadataSectionRange(content);
  if (!range) {
    return [];
  }
  const keys = [];
  for (const line of range.lines.slice(range.start + 1, range.end)) {
    const match = line.match(/^\s*-\s*([A-Za-z][A-Za-z0-9- ]+):\s*(.*)$/);
    if (!match) {
      continue;
    }
    keys.push(match[1].trim());
  }
  return keys;
}

export function setMetadataFields(content, fields = {}) {
  const metadata = parseMetadata(content);
  const orderedKeys = metadataKeysInOrder(content);
  const nextEntries = new Map();

  for (const key of orderedKeys) {
    nextEntries.set(key, metadataValue(metadata, key));
  }
  for (const [key, value] of Object.entries(fields)) {
    if (value == null) {
      continue;
    }
    if (!nextEntries.has(key)) {
      orderedKeys.push(key);
    }
    nextEntries.set(key, String(value));
  }

  const renderedSection = [
    '## Metadata',
    '',
    ...orderedKeys.map((key) => `- ${key}: ${nextEntries.get(key)}`),
    ''
  ].join('\n');

  const range = parseMetadataSectionRange(content);
  if (!range) {
    const trimmed = String(content ?? '').trimEnd();
    return trimmed ? `${trimmed}\n\n${renderedSection}\n` : `${renderedSection}\n`;
  }

  const before = range.lines.slice(0, range.start).join('\n').trimEnd();
  const after = range.lines.slice(range.end).join('\n').trimStart();
  if (!before && !after) {
    return `${renderedSection}\n`;
  }
  if (!after) {
    return `${before}\n\n${renderedSection}\n`;
  }
  if (!before) {
    return `${renderedSection}\n${after}\n`;
  }
  return `${before}\n\n${renderedSection}\n${after}\n`.replace(/\n{3,}/g, '\n\n');
}

export function sectionBounds(content, sectionTitle) {
  const escaped = String(sectionTitle).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^##\\s+${escaped}\\s*$`, 'm');
  const match = regex.exec(String(content ?? ''));
  if (!match || match.index == null) {
    return null;
  }

  const start = match.index;
  const bodyStart = start + match[0].length;
  const remainder = String(content).slice(bodyStart);
  const nextSectionMatch = /^##\s+/m.exec(remainder);
  const end = nextSectionMatch && nextSectionMatch.index != null
    ? bodyStart + nextSectionMatch.index
    : String(content).length;
  return { start, bodyStart, end };
}

export function sectionBody(content, sectionTitle) {
  const bounds = sectionBounds(content, sectionTitle);
  if (!bounds) {
    return '';
  }
  return String(content).slice(bounds.bodyStart, bounds.end).trim();
}

export function parseListField(rawValue) {
  const normalized = String(rawValue ?? '').trim();
  if (!normalized || normalized.toLowerCase() === 'none' || normalized.toLowerCase() === 'pending') {
    return [];
  }
  return [...new Set(
    normalized
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
  )];
}

export function parsePriority(value, fallback = '') {
  const normalized = String(value ?? '').trim().toLowerCase();
  return PRIORITIES.has(normalized) ? normalized : fallback;
}

export function parseDeliveryClass(value, fallback = '') {
  const normalized = String(value ?? '').trim().toLowerCase();
  return DELIVERY_CLASSES.has(normalized) ? normalized : fallback;
}

export function parseRiskTier(value, fallback = '') {
  const normalized = String(value ?? '').trim().toLowerCase();
  return RISK_TIERS.has(normalized) ? normalized : fallback;
}

export function parseSecurityApproval(value, fallback = '') {
  const normalized = String(value ?? '').trim().toLowerCase();
  return SECURITY_APPROVAL_VALUES.has(normalized) ? normalized : fallback;
}

export function parseValidationLanes(rawValue, fallback = []) {
  const normalized = parseListField(rawValue)
    .map((entry) => String(entry).trim().toLowerCase())
    .filter((entry) => VALIDATION_LANES.has(entry));
  if (normalized.length === 0) {
    return fallback;
  }
  return [...new Set(normalized)];
}

export function normalizeStatus(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function parseMustLandChecklist(content) {
  const body = sectionBody(content, 'Must-Land Checklist');
  if (!body) {
    return [];
  }

  return body
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^\s*-\s+\[([ xX])\]\s+(.*)$/);
      if (!match) {
        return null;
      }
      const checked = String(match[1]).toLowerCase() === 'x';
      const rawText = String(match[2] ?? '').trim();
      const idMatch = rawText.match(/^`([a-z0-9]+(?:-[a-z0-9]+)*)`\s+(.*)$/);
      return {
        checked,
        text: idMatch ? idMatch[2].trim() : rawText,
        rawText,
        id: idMatch ? idMatch[1] : null
      };
    })
    .filter(Boolean);
}

export function inferPlanId(content, filePath) {
  const metadata = parseMetadata(content);
  const explicit = parsePlanId(metadataValue(metadata, 'Plan-ID'), null);
  if (explicit) {
    return explicit;
  }
  const stem = path.basename(String(filePath ?? ''), path.extname(String(filePath ?? '')));
  return parsePlanId(stem.replace(/^\d{4}-\d{2}-\d{2}-/, ''), null);
}

export async function listMarkdownFiles(directoryPath) {
  try {
    const entries = await fs.readdir(directoryPath, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const fullPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) {
        files.push(...await listMarkdownFiles(fullPath));
        continue;
      }
      if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }
    return files.sort((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
}


const PLAN_SECTION_TITLES = ['Already-True Baseline', 'Must-Land Checklist', 'Deferred Follow-Ons'];
const SUPPORTED_METADATA_FIELDS = new Set(REQUIRED_METADATA_FIELDS.future.map(field => field.toLowerCase()));
function addFinding(findings, code, message, filePath) { findings.push({ code, message, filePath }); }
function statusSetForPhase(phase) {
  return phase === 'future' ? FUTURE_STATUSES : phase === 'active' ? ACTIVE_STATUSES : COMPLETED_STATUSES;
}
function isDocPath(value) {
  const normalized = String(value ?? '').trim().replaceAll('\\', '/').replace(/^\.?\//, '');
  return normalized.startsWith('docs/') || normalized.endsWith('.md') || normalized.endsWith('.mdx');
}

function validateRequiredMetadata(plan, findings) {
  const requiredFields = REQUIRED_METADATA_FIELDS[plan.phase] ?? [];
  for (const field of requiredFields) {
    const value = metadataValue(plan.metadata, field);
    if (!String(value ?? '').trim()) {
      addFinding(findings, 'MISSING_METADATA_FIELD', `Missing metadata field '${field}'.`, plan.rel);
    }
  }
}

function validateSupportedMetadata(plan, findings) {
  for (const field of plan.metadata.keys()) {
    if (!SUPPORTED_METADATA_FIELDS.has(field)) {
      addFinding(
        findings,
        'UNSUPPORTED_METADATA_FIELD',
        `Unsupported metadata field '${field}'.`,
        plan.rel
      );
    }
  }
  const topLevelValidationReady = String(plan.content.match(/^Validation-Ready:\s*(.+)$/m)?.[1] ?? '').trim();
  if (topLevelValidationReady) {
    addFinding(
      findings,
      'UNSUPPORTED_TOP_LEVEL_FIELD',
      "Top-level plan state fields are not supported; keep plan state in the Metadata section.",
      plan.rel
    );
  }
}

function validatePlanIdentity(plan, findings, seenPlanIds) {
  const explicitPlanId = metadataValue(plan.metadata, 'Plan-ID');
  if (!PLAN_ID_REGEX.test(String(explicitPlanId ?? '').trim())) {
    addFinding(findings, 'INVALID_PLAN_ID', 'Plan-ID must be lowercase kebab-case.', plan.rel);
  }
  if (!plan.planId) {
    addFinding(findings, 'UNREADABLE_PLAN_ID', 'Unable to infer Plan-ID from metadata or filename.', plan.rel);
    return;
  }
  if (seenPlanIds.has(plan.planId)) {
    addFinding(findings, 'DUPLICATE_PLAN_ID', `Duplicate Plan-ID '${plan.planId}'.`, plan.rel);
    return;
  }
  seenPlanIds.add(plan.planId);
}

function validateStatus(plan, findings) {
  const status = String(metadataValue(plan.metadata, 'Status')).trim().toLowerCase();
  if (!statusSetForPhase(plan.phase).has(status)) {
    addFinding(findings, 'INVALID_STATUS', `Status '${status || 'missing'}' is invalid for ${plan.phase} plans.`, plan.rel);
  }
  const topLevelStatus = String(plan.content.match(/^Status:\s*(.+)$/m)?.[1] ?? '').trim().toLowerCase();
  if (topLevelStatus && topLevelStatus !== status) {
    addFinding(
      findings,
      'STATUS_MISMATCH',
      `Top-level Status '${topLevelStatus}' does not match metadata Status '${status}'.`,
      plan.rel
    );
  }
}

function validateMetadataValues(plan, findings, allPlanIds) {
  const priority = parsePriority(metadataValue(plan.metadata, 'Priority'), '');
  if (!PRIORITIES.has(priority)) {
    addFinding(findings, 'INVALID_PRIORITY', 'Priority must be one of p0, p1, p2, p3.', plan.rel);
  }

  const deliveryClass = parseDeliveryClass(metadataValue(plan.metadata, 'Delivery-Class'), '');
  if (!DELIVERY_CLASSES.has(deliveryClass)) {
    addFinding(findings, 'INVALID_DELIVERY_CLASS', `Unsupported Delivery-Class '${metadataValue(plan.metadata, 'Delivery-Class')}'.`, plan.rel);
  }

  const riskTier = parseRiskTier(metadataValue(plan.metadata, 'Risk-Tier'), '');
  if (!RISK_TIERS.has(riskTier)) {
    addFinding(findings, 'INVALID_RISK_TIER', `Unsupported Risk-Tier '${metadataValue(plan.metadata, 'Risk-Tier')}'.`, plan.rel);
  }

  const securityApproval = parseSecurityApproval(metadataValue(plan.metadata, 'Security-Approval'), '');
  if (!SECURITY_APPROVAL_VALUES.has(securityApproval)) {
    addFinding(
      findings,
      'INVALID_SECURITY_APPROVAL',
      `Unsupported Security-Approval '${metadataValue(plan.metadata, 'Security-Approval')}'.`,
      plan.rel
    );
  }
  if (plan.phase === 'completed' && !['approved', 'not-required'].includes(securityApproval)) {
    addFinding(findings, 'UNRESOLVED_SECURITY_APPROVAL', 'Completed plans require resolved required approval.', plan.rel);
  }

  const validationLanes = parseListField(metadataValue(plan.metadata, 'Validation-Lanes')).map(lane => lane.toLowerCase());
  if (!validationLanes.includes('always')) {
    addFinding(findings, 'MISSING_VALIDATION_LANES', 'Validation-Lanes must include always; add host-required for environment-bound checks.', plan.rel);
  }
  for (const lane of validationLanes) {
    if (!VALIDATION_LANES.has(lane)) {
      addFinding(findings, 'INVALID_VALIDATION_LANE', `Unsupported validation lane '${lane}'.`, plan.rel);
    }
  }

  const dependencies = parseListField(metadataValue(plan.metadata, 'Dependencies'));
  for (const dependency of dependencies) {
    if (dependency.toLowerCase() === 'none') {
      continue;
    }
    if (!parsePlanId(dependency, null)) {
      addFinding(findings, 'INVALID_DEPENDENCY', `Dependency '${dependency}' must be a Plan-ID or 'none'.`, plan.rel);
      continue;
    }
    if (allPlanIds && !allPlanIds.has(dependency)) {
      addFinding(findings, 'UNKNOWN_DEPENDENCY', `Dependency '${dependency}' does not match any known plan.`, plan.rel);
    }
  }

  const specTargets = parseListField(metadataValue(plan.metadata, 'Spec-Targets'));
  if (specTargets.length === 0) {
    addFinding(findings, 'MISSING_SPEC_TARGETS', 'Spec-Targets must contain at least one path.', plan.rel);
  }

  const implementationTargets = parseListField(metadataValue(plan.metadata, 'Implementation-Targets'));
  if (deliveryClass === 'product') {
    if (implementationTargets.length === 0) {
      addFinding(findings, 'MISSING_IMPLEMENTATION_TARGETS', 'Product plans require Implementation-Targets.', plan.rel);
    }
    if (!implementationTargets.some((target) => !isDocPath(target))) {
      addFinding(
        findings,
        'DOC_ONLY_IMPLEMENTATION_TARGETS',
        'Product plans require at least one non-doc Implementation-Target.',
        plan.rel
      );
    }
  }

  const doneEvidence = String(metadataValue(plan.metadata, 'Done-Evidence')).trim();
  if (plan.phase === 'completed') {
    if (!doneEvidence || doneEvidence.toLowerCase() === 'pending') {
      addFinding(findings, 'MISSING_DONE_EVIDENCE', 'Completed plans require non-pending Done-Evidence.', plan.rel);
    }
  } else if (!doneEvidence || doneEvidence.toLowerCase() !== 'pending') {
    addFinding(findings, 'INVALID_DONE_EVIDENCE', "Future and active plans must keep Done-Evidence as 'pending'.", plan.rel);
  }
}

function validatePlanSections(plan, findings) {
  for (const title of PLAN_SECTION_TITLES) {
    if (!sectionBody(plan.content, title)) {
      addFinding(findings, 'MISSING_SECTION', `Missing required section '## ${title}'.`, plan.rel);
    }
  }

  if (plan.phase === 'completed') {
    for (const title of ['Closure', 'Validation Evidence']) {
      if (!sectionBody(plan.content, title)) addFinding(findings, 'MISSING_COMPLETION_SECTION', `Missing nonempty completed-plan section '## ${title}'.`, plan.rel);
    }
  }
  const mustLand = parseMustLandChecklist(plan.content);
  if (mustLand.length === 0) {
    addFinding(findings, 'EMPTY_MUST_LAND', 'Must-Land Checklist must contain at least one checkbox item.', plan.rel);
  }
  for (const entry of mustLand) {
    if (!entry.id) {
      addFinding(findings, 'MISSING_MUST_LAND_ID', 'Each must-land checkbox should begin with a backticked stable ID.', plan.rel);
      break;
    }
  }
  if (plan.phase === 'completed' && mustLand.some((entry) => !entry.checked)) {
    addFinding(findings, 'UNCHECKED_MUST_LAND', 'Completed plans must have every must-land item checked.', plan.rel);
  }
}

export function validatePlanRecord(plan, { knownPlanIds = null, seenPlanIds = new Set() } = {}) {
  const findings = [];
  validateRequiredMetadata(plan, findings);
  validateSupportedMetadata(plan, findings);
  validatePlanIdentity(plan, findings, seenPlanIds);
  validateStatus(plan, findings);
  validateMetadataValues(plan, findings, knownPlanIds);
  validatePlanSections(plan, findings);
  return findings;
}
