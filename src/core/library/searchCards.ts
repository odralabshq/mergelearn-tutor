import { createHash } from 'node:crypto';
import type { Card, CardStatus, FsrsState } from './types.js';
import { loadCardsForSet } from './cardStore.js';
import { listSetIds, loadSet } from './setStore.js';
import { loadTags } from './tagStore.js';

export type CardHit = {
  setId: string;
  setTitle: string;
  cardId: string;
  prompt: string;
  shortAnswer: string;
  explanation: string;
  updatedAt: string;
  tagIds: string[];
  status: CardStatus;
  state: FsrsState['state'];
};

export type SearchOptions = {
  tagIds?: string[];
  setIds?: string[];
  includeArchived?: boolean;
  limit?: number;
  state?: FsrsState['state'];
};

export type SearchPageOptions = SearchOptions & { offset?: number };
export type CardSearchPage = {
  cards: CardHit[];
  total: number;
  returned: number;
  hasMore: boolean;
  nextOffset?: number;
  snapshot: string;
};

type CollectedHit = { hit: CardHit; fsrs: Card['fsrs'] };

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareHits(left: CollectedHit, right: CollectedHit): number {
  return compareCodeUnits(left.hit.setTitle, right.hit.setTitle)
    || compareCodeUnits(left.hit.prompt, right.hit.prompt)
    || compareCodeUnits(left.hit.setId, right.hit.setId)
    || compareCodeUnits(left.hit.cardId, right.hit.cardId);
}

function snapshotFor(hits: CollectedHit[]): string {
  const evidence = hits.map(({ hit, fsrs }) => [
    hit.setId, hit.cardId, hit.updatedAt, hit.status,
    fsrs.due, fsrs.stability, fsrs.difficulty, fsrs.elapsedDays,
    fsrs.scheduledDays, fsrs.reps, fsrs.lapses, fsrs.learningSteps,
    fsrs.state, fsrs.lastReviewAt ?? null,
  ]);
  return createHash('sha256').update(JSON.stringify([hits.length, evidence])).digest('hex');
}

async function collectCards(root: string, query: string, opts: SearchOptions): Promise<CollectedHit[]> {
  const needle = query.trim().toLocaleLowerCase();
  const hits: CollectedHit[] = [];
  const tagLabels = new Map((await loadTags(root)).map((tag) => [tag.id, tag.label]));
  for (const setId of await listSetIds(root)) {
    if (opts.setIds?.length && !opts.setIds.includes(setId)) continue;
    const set = await loadSet(root, setId);
    if (!set) continue;
    for (const card of await loadCardsForSet(root, setId)) {
      if (card.status === 'archived' && !opts.includeArchived) continue;
      if (opts.tagIds?.length && !opts.tagIds.some((id) => card.tagIds.includes(id))) continue;
      if (opts.state !== undefined && card.fsrs?.state !== opts.state) continue;
      const tagIds = [...new Set([...set.tagIds, ...card.tagIds])];
      const tagText = tagIds.flatMap((id) => [id, tagLabels.get(id) ?? '']).join('\n');
      const haystack = [set.id, set.title, set.folderPath ?? '', card.id, card.folderPath ?? '',
        card.front.prompt, card.back.shortAnswer, card.back.explanationMarkdown, tagText].join('\n').toLocaleLowerCase();
      if (!haystack.includes(needle)) continue;
      hits.push({
        hit: { setId, setTitle: set.title, cardId: card.id, prompt: card.front.prompt,
          shortAnswer: card.back.shortAnswer, explanation: card.back.explanationMarkdown,
          updatedAt: card.updatedAt, tagIds: card.tagIds, status: card.status, state: card.fsrs.state },
        fsrs: card.fsrs,
      });
    }
  }
  return hits.sort(compareHits);
}

export async function searchCards(root: string, query: string, opts: SearchOptions = {}): Promise<CardHit[]> {
  const hits = (await collectCards(root, query, opts)).map(({ hit }) => hit);
  // limit 0 (or negative) means "no cap". The default page exists for human
  // output only; a caller that needs completeness must be able to ask for it,
  // because a silently truncated result is indistinguishable from "no matches".
  const cap = opts.limit ?? 100;
  return cap > 0 ? hits.slice(0, cap) : hits;
}

export async function searchCardsPage(root: string, query: string, opts: SearchPageOptions = {}): Promise<CardSearchPage> {
  const hits = await collectCards(root, query, opts);
  const offset = Number.isInteger(opts.offset) && (opts.offset ?? 0) >= 0 ? opts.offset! : 0;
  const limit = Number.isInteger(opts.limit) && (opts.limit ?? 0) > 0 ? Math.min(100, opts.limit!) : 100;
  const cards = hits.slice(offset, offset + limit).map(({ hit }) => hit);
  const total = hits.length;
  const returned = cards.length;
  const hasMore = offset + returned < total;
  return { cards, total, returned, hasMore, ...(hasMore ? { nextOffset: offset + returned } : {}), snapshot: snapshotFor(hits) };
}
