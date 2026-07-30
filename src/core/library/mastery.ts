/**
 * Mastery: how much of a domain the learner has demonstrably retained.
 *
 * Mastery = cards at FSRS state >= 2 (Review/Relearning) / total cards. State
 * >= 2 is the honest boundary: a card only reaches Review after it survived a
 * successful recall, so it reflects demonstrated retention rather than
 * exposure. New and Learning cards count in the denominator, not the numerator.
 *
 * Two axes, and the difference matters:
 *   - folders  — where the material lives (a card belongs to exactly one set,
 *                and a set to one folderPath, so folders partition the library)
 *   - tags     — what the material is about (a card carries many tags, so tags
 *                overlap and are the right axis for a skill picture)
 *
 * Shared by the Manage tab and the `mastery` CLI command so both report the
 * same numbers from the same rules.
 */

import { listSetIds, listSetSummaries } from './setStore.js';
import { loadCardsForSet } from './cardStore.js';
import { loadTags } from './tagStore.js';
import type { Card } from './types.js';

export type FolderMastery = { path: string; cardCount: number; mastery: number };
export type TagMastery = { id: string; label: string; kind?: string; cardCount: number; mastery: number };
/** Per-card membership, so a caller can recount matches without re-reading the library. */
export type CardMembership = { folderPath: string; tagIds: string[] };

export type MasteryReport = {
  folders: FolderMastery[];
  tags: TagMastery[];
  cards: CardMembership[];
};

/** Whole percent, 0 when there is nothing to measure (never NaN). */
export function masteryPct(mastered: number, total: number): number {
  return total === 0 ? 0 : Math.round((mastered / total) * 100);
}

/** A card counts as mastered once FSRS has moved it into Review/Relearning. */
export function isMastered(card: Card): boolean {
  return card.fsrs.state >= 2;
}

function tally(
  cards: Card[],
  keysOf: (card: Card) => string[],
): { totals: Map<string, number>; mastered: Map<string, number> } {
  const totals = new Map<string, number>();
  const mastered = new Map<string, number>();
  for (const card of cards) {
    for (const key of keysOf(card)) {
      totals.set(key, (totals.get(key) ?? 0) + 1);
      if (isMastered(card)) mastered.set(key, (mastered.get(key) ?? 0) + 1);
    }
  }
  return { totals, mastered };
}

/**
 * Read the library once and compute both mastery axes.
 *
 * v1 keys folders by the set's folderPath (per-card sub-paths are deferred);
 * cards in an unfiled set contribute to tags but to no folder row.
 */
export async function loadMasteryReport(root: string): Promise<MasteryReport> {
  const allCards: Card[] = [];
  for (const setId of await listSetIds(root)) allCards.push(...(await loadCardsForSet(root, setId)));

  const setFolder = new Map((await listSetSummaries(root)).map((s) => [s.id, s.folderPath ?? '']));
  const folderOf = (card: Card): string => setFolder.get(card.setId) ?? '';

  const folderCounts = tally(allCards, (card) => {
    const path = folderOf(card);
    return path ? [path] : [];
  });
  const folders = [...folderCounts.totals.keys()].sort().map((path) => ({
    path,
    cardCount: folderCounts.totals.get(path) ?? 0,
    mastery: masteryPct(folderCounts.mastered.get(path) ?? 0, folderCounts.totals.get(path) ?? 0),
  }));

  const tagCounts = tally(allCards, (card) => card.tagIds);
  const tags = (await loadTags(root))
    .map((tag) => ({
      id: tag.id,
      label: tag.label,
      kind: tag.kind,
      cardCount: tagCounts.totals.get(tag.id) ?? 0,
      mastery: masteryPct(tagCounts.mastered.get(tag.id) ?? 0, tagCounts.totals.get(tag.id) ?? 0),
    }))
    // Declared-but-unused tags would report 0% and read as a knowledge gap.
    .filter((tag) => tag.cardCount > 0)
    .sort((a, b) => a.label.localeCompare(b.label));

  const cards = allCards.map((card) => ({ folderPath: folderOf(card), tagIds: card.tagIds }));

  return { folders, tags, cards };
}
