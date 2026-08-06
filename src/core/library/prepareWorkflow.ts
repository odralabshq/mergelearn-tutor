import { loadCardsForSet } from './cardStore.js';
import { problemRefIdentity, safeStoredObservedOn } from './problemRefs.js';
import { listSetIds, loadSet } from './setStore.js';
import { loadWeakReport } from './weakCards.js';
import type { Card, ExternalProblemRef } from './types.js';

export type PrepareFilters = {
  set?: string[];
  tag?: string[];
  source?: string[];
};

export type StrengthenRow = {
  setId: string;
  cardId: string;
  prompt: string;
  tagIds: string[];
  attempts: number;
  failures: number;
  lapses: number;
  reason: string;
};

export type ExternalRow = {
  setId: string;
  cardId: string;
  tagIds: string[];
  sourceName: string;
  sourceId: string;
  canonicalUrl: string;
  attributionDate?: string;
  reason: string;
};

export type PrepareWorkflow = {
  strengthen: StrengthenRow[];
  external: ExternalRow[];
  externalBeforeFilters: number;
  sourceFilterIgnoredForStrengthen: boolean;
};

const compare = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;

function matches(values: string[] | undefined, candidates: readonly string[]): boolean {
  return !values?.length || values.some((value) => candidates.includes(value));
}

function externalCompare(a: ExternalRow, b: ExternalRow): number {
  if (a.attributionDate && !b.attributionDate) return -1;
  if (!a.attributionDate && b.attributionDate) return 1;
  if (a.attributionDate && b.attributionDate) {
    const newestFirst = compare(b.attributionDate, a.attributionDate);
    if (newestFirst) return newestFirst;
  }
  return compare(a.sourceName, b.sourceName) || compare(a.sourceId, b.sourceId)
    || compare(a.setId, b.setId) || compare(a.cardId, b.cardId);
}

function newestAttributionDate(ref: ExternalProblemRef): string | undefined {
  return ref.attributions?.flatMap((item) => {
    const observedOn = safeStoredObservedOn(item?.observedOn);
    return observedOn ? [observedOn] : [];
  }).sort(compare).at(-1);
}

function externalRows(card: Card, refs: ExternalProblemRef[]): ExternalRow[] {
  const seen = new Set<string>();
  return refs.flatMap((ref) => {
    const identity = problemRefIdentity(ref);
    if (!identity || seen.has(identity.key)) return [];
    seen.add(identity.key);
    const attributionDate = newestAttributionDate(ref);
    return [{
      setId: card.setId, cardId: card.id, tagIds: card.tagIds,
      sourceName: identity.sourceName, sourceId: identity.sourceId,
      canonicalUrl: ref.canonicalUrl,
      ...(attributionDate ? { attributionDate } : {}),
      reason: `Problem reference supplied by ${identity.sourceName}`,
    }];
  });
}

export async function loadPrepareWorkflow(
  root: string, filters: PrepareFilters = {}, now = new Date(),
): Promise<PrepareWorkflow> {
  const weak = await loadWeakReport(root, now);
  const cards: Card[] = [];
  const setRefs = new Map<string, ExternalProblemRef[]>();
  for (const setId of await listSetIds(root)) {
    const set = await loadSet(root, setId);
    if (!set) continue;
    setRefs.set(setId, set.problemRefs ?? []);
    cards.push(...(await loadCardsForSet(root, setId)).filter((card) => card.status === 'active'));
  }
  const byCard = new Map(cards.map((card) => [`${card.setId}\u0000${card.id}`, card]));
  const strengthen = weak.cards.flatMap((row) => {
    const card = byCard.get(`${row.setId}\u0000${row.cardId}`);
    return card && matches(filters.set, [row.setId]) && matches(filters.tag, card.tagIds) ? [{
      setId: row.setId, cardId: row.cardId,
      prompt: row.prompt, tagIds: row.tagIds, attempts: row.attempts,
      failures: row.failures, lapses: card.fsrs.lapses,
      reason: `${row.failures} of ${row.attempts} recent attempts were retrieval failures`,
    }] : [];
  }).sort((a, b) => b.lapses - a.lapses || compare(a.setId, b.setId) || compare(a.cardId, b.cardId));
  const allExternal = cards.flatMap((card) => externalRows(
    card, [...(card.problemRefs ?? []), ...(setRefs.get(card.setId) ?? [])],
  )).sort(externalCompare);
  const external = allExternal.filter((row) =>
    matches(filters.set, [row.setId])
    && matches(filters.tag, row.tagIds)
    && matches(filters.source, [row.sourceName]));
  return {
    strengthen, external, externalBeforeFilters: allExternal.length,
    sourceFilterIgnoredForStrengthen: !!filters.source?.length,
  };
}
