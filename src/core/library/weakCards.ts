/**
 * Weak-card analysis: which material does the learner keep failing to recall?
 *
 * Every input here was already being written to disk and never read back. The
 * point of this module is to turn that dormant evidence into something the
 * learner can drill and the authoring agent can target.
 *
 * WHAT COUNTS AS A FAILURE
 *
 * A failure is an unaided retrieval failure, and exactly two signals qualify:
 *
 *   1. `rating === 1` (Again). Present on EVERY review event regardless of
 *      interaction type, and it is the learner stating plainly that they could
 *      not recall the material.
 *   2. `attempt.correct === false`. Deterministic, but only recorded for
 *      `choice` and `parsons` cards.
 *
 * Note the `=== false` in (2) rather than `!correct`: `correct` is OPTIONAL and
 * is never set for flashcards or self_response, which are self-graded. A bare
 * falsiness check would score every flashcard as a failure, and flashcards are
 * the most common card type in a real library.
 *
 * WHAT DELIBERATELY DOES NOT COUNT
 *
 * `revealedFull` looks like a "needed help" signal and is not one. The practice
 * client seeds the disclosure panel from a STICKY preference
 * (`localStorage['ml-deep-open']`), so a learner who once expanded "Show full
 * explanation" and left it open records `revealedFull: true` on every attempt
 * forever. Ranking by it would surface that person's layout preference, not
 * their recall. Do not add it back.
 *
 * FSRS `stability`, `difficulty`, `retrievability` and lifetime `lapses` are
 * reported as explanatory context but never ranked on: they are correlated
 * consequences of the same review history, so blending them into the score
 * would double-count the same evidence behind an opaque formula.
 *
 * HOW RANKING HANDLES SPARSE DATA
 *
 * Most cards have very few reviews, so a raw failure ratio is mostly noise:
 * one Again on one attempt is not a 100% failure rate. The score is a
 * Beta(1,1) posterior mean over the recent window,
 *
 *     score = (failures + 1) / (attempts + 2)
 *
 * which pulls thin evidence toward 0.5 instead of certainty, and sharpens as
 * attempts accumulate. On top of that, a card must clear an explicit evidence
 * bar before it is called weak at all (see WEAK_MIN_ATTEMPTS/FAILURES). Cards
 * below the bar are reported as "watch" rather than silently ranked, because a
 * command that confidently names noise is worse than one that admits it does
 * not know yet.
 */

import { retrievability } from './fsrs.js';
import { listSessions } from './review/sessionHistory.js';
import { listSetIds, listSetSummaries } from './setStore.js';
import { loadCardsForSet } from './cardStore.js';
import { loadTags } from './tagStore.js';
import type { Card, ReviewEvent } from './types.js';

/** Attempts considered per card. Recent behaviour, so improvement shows up. */
export const WEAK_WINDOW = 5;
/** Minimum evidence before a card may be called weak. */
export const WEAK_MIN_ATTEMPTS = 3;
export const WEAK_MIN_FAILURES = 2;

export type WeakCard = {
  setId: string;
  setTitle: string;
  cardId: string;
  prompt: string;
  tagIds: string[];
  /** Resolved labels for `tagIds`, in the same order. Present so a card row can
   * name its concepts: the tag rollup above the list says which concepts are
   * weak, but without labels on each row you cannot tell WHICH cards are the
   * `arrays` ones. */
  tagLabels: string[];
  /** Attempts in the recent window (<= WEAK_WINDOW). */
  attempts: number;
  /** Unaided retrieval failures within those attempts. */
  failures: number;
  /** Smoothed failure rate, 0..1. Ranking key; see module docs. */
  score: number;
  /** Explanatory only, never ranked on. */
  lapses: number;
  stability: number;
  retention: number;
  lastReviewedAt?: string;
};

export type WeakTag = {
  id: string;
  label: string;
  /** Cards over the evidence bar and failing. */
  weak: number;
  /** Cards with enough evidence to judge either way; the honest denominator. */
  eligible: number;
};

export type WeakReport = {
  /** Weakest first. Only cards over the evidence bar. */
  cards: WeakCard[];
  /** Tags ranked by how many weak cards they carry. */
  tags: WeakTag[];
  /** Attempted, but not yet enough evidence to judge. */
  watch: WeakCard[];
  /** Cards with at least one recorded attempt. */
  attemptedCards: number;
};

/** Beta(1,1) posterior mean: thin evidence stays near 0.5, not 0 or 1. */
export function weakScore(failures: number, attempts: number): number {
  return (failures + 1) / (attempts + 2);
}

/** An unaided retrieval failure. See module docs for the two signals and for
 * why `revealedFull` is excluded. */
export function isRetrievalFailure(event: ReviewEvent): boolean {
  return event.rating === 1 || event.attempt?.correct === false;
}

export function hasEnoughEvidence(attempts: number, failures: number): boolean {
  return attempts >= WEAK_MIN_ATTEMPTS && failures >= WEAK_MIN_FAILURES;
}

/**
 * Most recent events per card, newest last.
 *
 * Ordered by each event's own `reviewedAt` rather than by session file order:
 * `listSessions` returns whatever order the directory walk produced, so relying
 * on it would make the window non-deterministic.
 */
async function recentEventsByCard(root: string): Promise<Map<string, ReviewEvent[]>> {
  const byCard = new Map<string, ReviewEvent[]>();
  for (const session of await listSessions(root)) {
    for (const event of session.events) {
      if (!event?.cardId) continue;
      const list = byCard.get(event.cardId);
      if (list) list.push(event);
      else byCard.set(event.cardId, [event]);
    }
  }
  for (const [cardId, events] of byCard) {
    events.sort((a, b) => (a.reviewedAt ?? '').localeCompare(b.reviewedAt ?? ''));
    byCard.set(cardId, events.slice(-WEAK_WINDOW));
  }
  return byCard;
}

export async function loadWeakReport(root: string, now = new Date()): Promise<WeakReport> {
  const eventsByCard = await recentEventsByCard(root);
  const setTitles = new Map((await listSetSummaries(root)).map((s) => [s.id, s.title]));
  const tagLabels = new Map((await loadTags(root)).map((t) => [t.id, t.label]));

  const measure = (card: Card, events: ReviewEvent[]): WeakCard => {
    const failures = events.filter(isRetrievalFailure).length;
    return {
      setId: card.setId,
      setTitle: setTitles.get(card.setId) ?? card.setId,
      cardId: card.id,
      prompt: card.front.prompt,
      tagIds: card.tagIds,
      tagLabels: card.tagIds.map((id) => tagLabels.get(id) ?? id),
      attempts: events.length,
      failures,
      score: weakScore(failures, events.length),
      lapses: card.fsrs.lapses,
      stability: Math.round(card.fsrs.stability * 100) / 100,
      retention: Math.round(retrievability(card.fsrs, now) * 100),
      lastReviewedAt: events[events.length - 1]?.reviewedAt,
    };
  };

  const weak: WeakCard[] = [];
  const watch: WeakCard[] = [];
  // Tag denominators count cards that could be judged, not cards that failed.
  const eligibleByTag = new Map<string, number>();
  const weakByTag = new Map<string, number>();
  let attemptedCards = 0;

  for (const setId of await listSetIds(root)) {
    for (const card of await loadCardsForSet(root, setId)) {
      // An archived card is not something to drill.
      if (card.status === 'archived') continue;
      const events = eventsByCard.get(card.id);
      if (!events || events.length === 0) continue;
      attemptedCards += 1;

      const row = measure(card, events);
      const enough = hasEnoughEvidence(row.attempts, row.failures);
      // "Eligible" means the window is long enough to say something either way,
      // independent of whether this card actually failed.
      if (row.attempts >= WEAK_MIN_ATTEMPTS) {
        for (const tagId of card.tagIds) {
          eligibleByTag.set(tagId, (eligibleByTag.get(tagId) ?? 0) + 1);
        }
      }
      if (enough) {
        weak.push(row);
        for (const tagId of card.tagIds) weakByTag.set(tagId, (weakByTag.get(tagId) ?? 0) + 1);
      } else {
        watch.push(row);
      }
    }
  }

  // Ties broken by raw failure count then card id, so output is stable.
  weak.sort((a, b) => b.score - a.score || b.failures - a.failures || a.cardId.localeCompare(b.cardId));
  watch.sort((a, b) => b.score - a.score || a.cardId.localeCompare(b.cardId));

  const tags: WeakTag[] = [...weakByTag.keys()]
    .map((id) => ({
      id,
      label: tagLabels.get(id) ?? id,
      weak: weakByTag.get(id) ?? 0,
      eligible: eligibleByTag.get(id) ?? 0,
    }))
    .sort((a, b) => b.weak - a.weak || a.label.localeCompare(b.label));

  return { cards: weak, tags, watch, attemptedCards };
}
