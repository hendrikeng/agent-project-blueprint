import fs from 'node:fs/promises';

export async function decisions() {
  const questionnaire = JSON.parse(await fs.readFile(new URL('../distribution/bootstrap-questionnaire.json', import.meta.url), 'utf8'));
  const values = {};
  for (const placeholder of questionnaire.sections.flatMap((section) => section.questions.flatMap((question) => question.placeholders))) {
    values[placeholder] = placeholder.startsWith('SCORE_') ? '4' : placeholder.toLowerCase();
  }
  Object.assign(values, {
    LAST_UPDATED_ISO_DATE: '2026-03-22',
    CURRENT_STATE_DATE: '2026-03-22',
    GENERATED_AT_UTC_ISO: '2026-03-22T12:00:00.000Z',
    PRODUCT: 'Configured Project',
    PROJECT_LINT_COMMAND: 'eslint "src/**/*.ts"',
    NODE_VERSION: '26',
    CI_INSTALL_COMMAND: 'npm ci',
    PACKAGE_MANAGER_CACHE: 'npm',
    CODEOWNERS_DEFAULT_TEAM: '@acme/platform',
    CODEOWNERS_SECURITY_TEAM: '@acme/security',
    PACKAGE_MANAGER_LOCKFILE: 'package-lock.json'
  });
  return { schemaVersion: 1, values };
}
