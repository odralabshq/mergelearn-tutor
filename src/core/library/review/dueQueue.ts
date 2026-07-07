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

function matchesFilter(card: Card, setFolderPath: string | undefined, filter?: DueFilter): boolean {
  if (!filter) return true;
  if (filter.setIds && !filter.setIds.includes(card.setId)) return false;
  if (filter.tagIds && !filter.tagIds.some((t) => card.tagIds.includes(t))) return false;
  if (filter.folderPaths) {
    const path = card.folderPath ?? setFolderPath;
    if (!path || !filter.folderPaths.some((f) => path === f || path.startsWith(`${f}/`))) return false;
  }
  return true;
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
