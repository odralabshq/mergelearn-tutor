import type { CardStatus } from './types.js';
import { loadCardsForSet } from './cardStore.js';
import { listSetIds, loadSet } from './setStore.js';

export type CardHit = {
  setId: string;
  setTitle: string;
  cardId: string;
  prompt: string;
  shortAnswer: string;
  explanation: string;
  tagIds: string[];
  status: CardStatus;
};

export type SearchOptions = {
  tagIds?: string[];
  setIds?: string[];
  includeArchived?: boolean;
  limit?: number;
};

export async function searchCards(root: string, query: string, opts: SearchOptions = {}): Promise<CardHit[]> {
  const needle = query.trim().toLocaleLowerCase();
  const hits: CardHit[] = [];
  for (const setId of await listSetIds(root)) {
    if (opts.setIds?.length && !opts.setIds.includes(setId)) continue;
    const set = await loadSet(root, setId);
    if (!set) continue;
    for (const card of await loadCardsForSet(root, setId)) {
      if (card.status === 'archived' && !opts.includeArchived) continue;
      if (opts.tagIds?.length && !opts.tagIds.some((id) => card.tagIds.includes(id))) continue;
      const haystack = `${set.title}\n${card.front.prompt}\n${card.back.shortAnswer}`.toLocaleLowerCase();
      if (!haystack.includes(needle)) continue;
      hits.push({ setId, setTitle: set.title, cardId: card.id, prompt: card.front.prompt, shortAnswer: card.back.shortAnswer, explanation: card.back.explanationMarkdown, tagIds: card.tagIds, status: card.status });
    }
  }
  hits.sort((a, b) => a.setTitle.localeCompare(b.setTitle) || a.prompt.localeCompare(b.prompt));
  return hits.slice(0, opts.limit ?? 100);
}
