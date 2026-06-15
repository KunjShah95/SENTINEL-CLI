import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const DismissedFile = '.sentinel/dismissed.json';

function getFilePath() {
  return join(process.cwd(), DismissedFile);
}

function readDismissals() {
  try {
    const fp = getFilePath();
    if (!existsSync(fp)) return { dismissals: {}, metadata: { version: 1, createdAt: Date.now() } };
    return JSON.parse(readFileSync(fp, 'utf-8'));
  } catch {
    return { dismissals: {}, metadata: { version: 1, createdAt: Date.now() } };
  }
}

function writeDismissals(data) {
  const dir = join(process.cwd(), '.sentinel');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(getFilePath(), JSON.stringify(data, null, 2), 'utf-8');
}

export function getDismissedKeys() {
  const data = readDismissals();
  return new Set(Object.keys(data.dismissals));
}

export function isDismissed(file, line, rule) {
  const key = `${file}:${line}:${rule}`;
  const data = readDismissals();
  return !!data.dismissals[key];
}

export function dismissIssue(file, line, rule, reason, issue = {}) {
  const data = readDismissals();
  const key = `${file}:${line}:${rule}`;
  data.dismissals[key] = {
    dismissedAt: new Date().toISOString(),
    reason: reason || 'User dismissed',
    issue,
  };
  data.metadata.updatedAt = Date.now();
  writeDismissals(data);
  return true;
}

export function undismissIssue(file, line, rule) {
  const data = readDismissals();
  const key = `${file}:${line}:${rule}`;
  if (data.dismissals[key]) {
    delete data.dismissals[key];
    data.metadata.updatedAt = Date.now();
    writeDismissals(data);
    return true;
  }
  return false;
}

export function getDismissals() {
  return readDismissals();
}
