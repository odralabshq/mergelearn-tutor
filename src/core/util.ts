import { createHash } from 'node:crypto';

export function nowIso(): string {
  return new Date().toISOString();
}

export function stableId(prefix: string, value: unknown): string {
  return `${prefix}_${createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 10)}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function addDays(dateIso: string, days: number): string {
  const date = new Date(dateIso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

export function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export function normalizeRepoPath(repoPath: string): string {
  return repoPath.replace(/\\/g, '/').replace(/\/$/, '');
}
