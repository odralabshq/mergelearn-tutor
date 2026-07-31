import type { CardStatus } from './types.js';
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
  const tagLabels = new Map((await loadTags(root)).map((tag) => [tag.id, tag.label]));
  for (const setId of await listSetIds(root)) {
    if (opts.setIds?.length && !opts.setIds.includes(setId)) continue;
    const set = await loadSet(root, setId);
    if (!set) continue;
    for (const card of await loadCardsForSet(root, setId)) {
      if (card.status === 'archived' && !opts.includeArchived) continue;
      if (opts.tagIds?.length && !opts.tagIds.some((id) => card.tagIds.includes(id))) continue;
      const tagIds = [...new Set([...set.tagIds, ...card.tagIds])];
      const tagText = tagIds.flatMap((id) => [id, tagLabels.get(id) ?? '']).join('\n');
      const haystack = [
        set.id, set.title, set.folderPath ?? '',
        card.id, card.folderPath ?? '',
        card.front.prompt, card.back.shortAnswer, card.back.explanationMarkdown,
        tagText,
      ].join('\n').toLocaleLowerCase();
      if (!haystack.includes(needle)) continue;
      hits.push({ setId, setTitle: set.title, cardId: card.id, prompt: card.front.prompt, shortAnswer: card.back.shortAnswer, explanation: card.back.explanationMarkdown, updatedAt: card.updatedAt, tagIds: card.tagIds, status: card.status });
    }
  }
  hits.sort((a, b) => a.setTitle.localeCompare(b.setTitle) || a.prompt.localeCompare(b.prompt));
  // limit 0 (or negative) means "no cap". The default page exists for human
  // output only; a caller that needs completeness must be able to ask for it,
  // because a silently truncated result is indistinguishable from "no matches".
  const cap = opts.limit ?? 100;
  return cap > 0 ? hits.slice(0, cap) : hits;
}
