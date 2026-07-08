/**
 * Due-cards query (docs/design/redesign-2026-07/01 sec 5, 04 Practice).
 *
 * "Due today" = every ACTIVE card across all sets with fsrs.due <= now,
 * optionally narrowed by set / folder / tag. Sets are containers, never
 * schedulers — scheduling is strictly per card.
 */

import type { Card, ReviewSession } from '../types.js';
import { listSetIds, loadSet } from '../setStore.js';
import { loadCardsForSet } from '../cardStore.js';

export type DueFilter = NonNullable<ReviewSession['filter']>;

/**
 * Faceted match. Within one dimension (several tags, several folders), values
 * are always OR'd. Across dimensions (folders vs tags vs sets), the combinator
 * decides: 'union' (default) = a card matches if it satisfies ANY populated
 * dimension; 'intersection' = it must satisfy ALL of them. An absent or empty
 * array is "no constraint" and does not participate.
 */
function matchesFilter(card: Card, setFolderPath: string | undefined, filter?: DueFilter): boolean {
  if (!filter) return true;
  const results: boolean[] = [];

  if (filter.setIds && filter.setIds.length) {
    results.push(filter.setIds.includes(card.setId));
  }
  if (filter.tagIds && filter.tagIds.length) {
    results.push(filter.tagIds.some((t) => card.tagIds.includes(t)));
  }
  if (filter.folderPaths && filter.folderPaths.length) {
    const path = card.folderPath ?? setFolderPath;
    results.push(!!path && filter.folderPaths.some((f) => path === f || path.startsWith(`${f}/`)));
  }

  if (results.length === 0) return true; // nothing selected → everything matches
  return (filter.combinator ?? 'union') === 'intersection'
    ? results.every(Boolean)
    : results.some(Boolean);
}

/** All active cards due at or before `now`, matching the optional filter. */
export async function getDueCards(root: string, now = new Date(), filter?: DueFilter): Promise<Card[]> {
  const nowMs = now.getTime();
  const due: Card[] = [];
  for (const setId of await listSetIds(root)) {
    const set = await loadSet(root, setId);
    const cards = await loadCardsForSet(root, setId);
    for (const card of cards) {
      if (card.status !== 'active') continue;
      if (new Date(card.fsrs.due).getTime() > nowMs) continue;
      if (!matchesFilter(card, set?.folderPath, filter)) continue;
      due.push(card);
    }
  }
  // Most-overdue first, so the oldest debt is cleared first.
  due.sort((a, b) => new Date(a.fsrs.due).getTime() - new Date(b.fsrs.due).getTime());
  return due;
}
