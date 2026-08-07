import type { ExternalProblemRef, ProblemAttribution } from './types.js';

export type ProblemRefError = { code: string; message: string };
export type ProblemRefResult =
  | { ok: true; refs?: ExternalProblemRef[]; errors: [] }
  | { ok: false; errors: ProblemRefError[] };

const unsafe = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/;

export type ProblemRefIdentity = { sourceName: string; sourceId: string; key: string };

export function safeStoredProblemText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.normalize('NFC').trim();
  return normalized && normalized.length <= max && !unsafe.test(normalized) ? normalized : undefined;
}

export function safeStoredObservedOn(value: unknown): string | undefined {
  const normalized = safeStoredProblemText(value, 10);
  if (!normalized || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return undefined;
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === normalized
    && normalized >= '1970-01-01' ? normalized : undefined;
}

export function problemRefIdentity(value: unknown): ProblemRefIdentity | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const ref = value as Record<string, unknown>;
  const sourceName = safeStoredProblemText(ref.sourceName, 100);
  const sourceId = safeStoredProblemText(ref.sourceId, 100);
  if (!sourceName || !sourceId) return undefined;
  return {
    sourceName, sourceId,
    key: `${sourceName.toLocaleLowerCase('en-US')}\u0000${sourceId.toLocaleLowerCase('en-US')}`,
  };
}

function text(value: unknown, field: string, max: number, errors: ProblemRefError[]): string {
  if (typeof value !== 'string') { errors.push({ code: `problem_ref:${field}`, message: `${field} must be a string` }); return ''; }
  const normalized = value.normalize('NFC').trim();
  if (!normalized || normalized.length > max || unsafe.test(normalized)) {
    errors.push({ code: `problem_ref:${field}`, message: `${field} must be 1-${max} safe code units` });
  }
  return normalized;
}

function date(value: unknown, today: string, errors: ProblemRefError[]): string {
  const normalized = text(value, 'observedOn', 10, errors);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  const parsed = match ? new Date(`${normalized}T00:00:00.000Z`) : undefined;
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized
    || normalized < '1970-01-01' || normalized > today) {
    errors.push({ code: 'problem_ref:observedOn', message: 'observedOn must be a real UTC date from 1970 through today' });
  }
  return normalized;
}

export function normalizeProblemRefs(value: unknown, now: Date): ProblemRefResult {
  if (value === undefined) return { ok: true, refs: undefined, errors: [] };
  const errors: ProblemRefError[] = [];
  if (!Array.isArray(value) || value.length > 20
    || Array.from({ length: value.length }, (_, index) => index).some((index) => !(index in value))) {
    return { ok: false, errors: [{ code: 'problem_ref:count', message: 'problemRefs must contain at most 20 references without gaps' }] };
  }
  const seen = new Set<string>();
  const refs = value.map((raw) => {
    const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const sourceName = text(item.sourceName, 'sourceName', 100, errors);
    const sourceId = text(item.sourceId, 'sourceId', 100, errors);
    const title = item.title === undefined ? undefined : text(item.title, 'title', 200, errors);
    const key = problemRefIdentity({ sourceName, sourceId })?.key ?? '';
    if (seen.has(key)) errors.push({ code: 'problem_ref:duplicate', message: 'duplicate sourceName/sourceId' }); else seen.add(key);
    let canonicalUrl = '';
    try {
      if (typeof item.canonicalUrl !== 'string' || item.canonicalUrl.length > 2048
        || unsafe.test(item.canonicalUrl)) throw new Error();
      const url = new URL(item.canonicalUrl);
      if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error();
      canonicalUrl = url.toString();
    } catch {
      errors.push({ code: 'problem_ref:canonicalUrl', message: 'canonicalUrl must be absolute HTTPS without credentials or fragment' });
    }
    const attrs = item.attributions;
    const attributions = attrs === undefined ? undefined : Array.isArray(attrs) && attrs.length <= 50 ? attrs.map((rawAttr) => {
      const attr = rawAttr && typeof rawAttr === 'object' ? rawAttr as Record<string, unknown> : {};
      const kind = attr.kind === 'list' || attr.kind === 'company' ? attr.kind : 'list';
      if (kind !== attr.kind) errors.push({ code: 'problem_ref:attribution_kind', message: 'attribution kind must be list or company' });
      return { kind, label: text(attr.label, 'attribution_label', 100, errors), observedOn: date(attr.observedOn, now.toISOString().slice(0, 10), errors) } satisfies ProblemAttribution;
    }) : (errors.push({ code: 'problem_ref:attribution_count', message: 'attributions must contain at most 50 values' }), []);
    return { sourceName, sourceId, canonicalUrl, ...(title === undefined ? {} : { title }), ...(attributions === undefined ? {} : { attributions }) };
  });
  return errors.length ? { ok: false, errors } : { ok: true, refs, errors: [] };
}
