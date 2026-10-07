#!/usr/bin/env node
// Project-owned: adapt these categories to the application's risk boundaries.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function metadataOnly(eventName, event) {
  return eventName === 'pull_request' &&
    event.action === 'edited' && !event.changes?.base;
}

export function classifyChanges(entries) {
  const scopes = new Set();
  for (const { status, path } of entries) {
    const words = String(path ?? "").replaceAll("\\", "/").replace(/([a-z0-9])([A-Z])/g, "$1-$2");
    const sensitiveWords = words.replace(/(^|[/._-])author(?:s|ed|ing|ship)?(?=$|[/._-])/gi, "$1");
    if (!['A', 'M'].includes(status) || !path ||
        /auth|secur|secret|credential|identity|tenancy|payment|billing|money|migration|schema|permission|deploy|database|persistence|(?:^|[/._-])db(?:[/._-]|$)|(?:^|\/)(?:shared|config)(?:[/._-]|$)/i.test(sensitiveWords) ||
        (!/\.(?:css|scss|sass|less)$/i.test(path ?? "") && /token/i.test(words)) ||
        /(?:config|lock)\.[^/]+$|(?:^|\/)package\.json$/.test(path)) return 'broad';
    if (/^(?:scripts\/(?:automation|agent-hardening|architecture|docs)\/|docs\/(?:agent-hardening|governance)\/)/.test(path)) scopes.add('harness');
    else if (/^docs\/(?:product-specs|future|exec-plans|ops\/api|ui)\/.*\.md$/.test(path)) scopes.add('docs');
    else if (/^(?:src|app|apps|lib|test|tests)\/.*\.(?:[cm]?[jt]sx?|vue|css|scss)$/.test(path)) scopes.add('product');
    else return 'broad';
  }
  return scopes.size === 1 ? [...scopes][0] : 'broad';
}

export function selectScope(eventName, event, entries) {
  if (metadataOnly(eventName, event)) return 'metadata';
  if (eventName === 'merge_group' ||
      (eventName === 'pull_request' && event.pull_request?.base?.ref === 'main') ||
      (eventName === 'push' && event.ref === 'refs/heads/main')) return 'full';
  return classifyChanges(entries);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  let entries = [];
  const base = event.pull_request?.base?.sha ?? event.before;
  if (/^[a-f0-9]{40}$/.test(base ?? '') && !/^0+$/.test(base)) {
    try {
      const fields = execFileSync('git', ['diff', '--name-status', '-z', '--no-renames', `${base}...HEAD`], { encoding: 'utf8' }).split('\0');
      entries = fields.slice(0, -1).reduce((all, field, index) => {
        if (index % 2 === 0) all.push({ status: field, path: fields[index + 1] });
        return all;
      }, []);
    } catch { /* Missing history selects broad, never a narrow success. */ }
  }
  const scope = selectScope(process.env.GITHUB_EVENT_NAME, event, entries);
  console.log(`CI scope: ${scope}`);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `scope=${scope}\n`);
}
