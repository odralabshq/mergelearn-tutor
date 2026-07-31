/**
 * Two distinct questions about a domain, deliberately not collapsed into one
 * number:
 *
 *   coverage  - how much of the material has been learned at least once?
 *               Cards at FSRS state >= 2 (Review/Relearning) / total. A card
 *               only reaches Review after surviving a successful recall.
 *   retention - of the material actually studied, how much is still remembered
 *               RIGHT NOW? Mean FSRS retrievability over studied cards only.
 *
 * Why both: coverage alone called a single correct answer "100% mastery" while
 * the card sat at 2.3 days of stability, because reaching Review state says
 * nothing about whether the memory has since decayed. Retention alone is worse
 * in the opposite direction - it says nothing about how much of the topic has
 * been touched at all. Reported together they are interpretable; either one
 * alone invites a confident wrong conclusion.
 *
 * Unstudied cards are EXCLUDED from retention (they have retrievability 0 by
 * definition). Including them would make retention a rescaled coverage number
 * and reintroduce exactly the conflation this split removes; `studied` is
 * reported alongside so the denominator is never a mystery.
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

import { hasBeenStudied, retrievability } from './fsrs.js';
import { listSetIds, listSetSummaries } from './setStore.js';
import { loadCardsForSet } from './cardStore.js';
import { loadTags } from './tagStore.js';
import type { Card } from './types.js';

/** Both measures plus the retention denominator. */
export type ProgressStats = {
  cardCount: number;
  /** Cards at FSRS state >= 2, as a whole percent of cardCount. */
  coverage: number;
  /** Mean retrievability over STUDIED cards, as a whole percent. */
  retention: number;
  /** Cards with at least one review; the retention denominator. */
  studied: number;
};

export type FolderMastery = ProgressStats & { path: string };
export type TagMastery = ProgressStats & { id: string; label: string; kind?: string };
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

/** A card counts as covered once FSRS has moved it into Review/Relearning. */
export function isCovered(card: Card): boolean {
  return card.fsrs.state >= 2;
}

type Bucket = { total: number; covered: number; studied: number; retentionSum: number };

function statsOf(bucket: Bucket): ProgressStats {
  return {
    cardCount: bucket.total,
    coverage: masteryPct(bucket.covered, bucket.total),
    // Denominator is STUDIED cards, not all cards. With nothing studied this is
    // 0 rather than NaN, and `studied: 0` makes that unambiguous.
    retention: bucket.studied === 0 ? 0 : Math.round((bucket.retentionSum / bucket.studied) * 100),
    studied: bucket.studied,
  };
}

function tally(cards: Card[], keysOf: (card: Card) => string[], now: Date): Map<string, Bucket> {
  const buckets = new Map<string, Bucket>();
  for (const card of cards) {
    const studied = hasBeenStudied(card.fsrs);
    // Compute retrievability once per card, not once per key: a card carries
    // many tags, and this is the only non-trivial arithmetic in the loop.
    const r = studied ? retrievability(card.fsrs, now) : 0;
    for (const key of keysOf(card)) {
      const bucket = buckets.get(key) ?? { total: 0, covered: 0, studied: 0, retentionSum: 0 };
      bucket.total += 1;
      if (isCovered(card)) bucket.covered += 1;
      if (studied) { bucket.studied += 1; bucket.retentionSum += r; }
      buckets.set(key, bucket);
    }
  }
  return buckets;
}

/**
 * Read the library once and compute both mastery axes.
 *
 * v1 keys folders by the set's folderPath (per-card sub-paths are deferred);
 * cards in an unfiled set contribute to tags but to no folder row.
 */
export async function loadMasteryReport(root: string, now = new Date()): Promise<MasteryReport> {
  const allCards: Card[] = [];
  for (const setId of await listSetIds(root)) allCards.push(...(await loadCardsForSet(root, setId)));

  const setFolder = new Map((await listSetSummaries(root)).map((s) => [s.id, s.folderPath ?? '']));
  const folderOf = (card: Card): string => setFolder.get(card.setId) ?? '';

  const folderBuckets = tally(allCards, (card) => {
    const path = folderOf(card);
    return path ? [path] : [];
  }, now);
  const folders = [...folderBuckets.keys()].sort()
    .map((path) => ({ path, ...statsOf(folderBuckets.get(path)!) }));

  const tagBuckets = tally(allCards, (card) => card.tagIds, now);
  const tags = (await loadTags(root))
    .filter((tag) => tagBuckets.has(tag.id))
    .map((tag) => ({
      id: tag.id,
      label: tag.label,
      kind: tag.kind,
      ...statsOf(tagBuckets.get(tag.id)!),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const cards = allCards.map((card) => ({ folderPath: folderOf(card), tagIds: card.tagIds }));

  return { folders, tags, cards };
}
