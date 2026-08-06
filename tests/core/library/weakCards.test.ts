import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { importAgentSet } from '../../../src/core/library/importAgentSet.js';
import { loadCardsForSet, saveCard } from '../../../src/core/library/cardStore.js';
import { writeJson } from '../../../src/core/library/io.js';
import { libraryPaths } from '../../../src/core/library/libraryStore.js';
import {
  isRetrievalFailure, loadWeakReport, weakScore,
  WEAK_MIN_ATTEMPTS, WEAK_MIN_FAILURES, WEAK_WINDOW,
} from '../../../src/core/library/weakCards.js';
import type { AgentSetPatch, ReviewAttempt, ReviewEvent, ReviewRating, ReviewSession } from '../../../src/core/library/types.js';

const SET = 'weak-deck';

/** Three cards: two tagged `arrays`, one tagged `strings`. */
async function seed(): Promise<{ root: string; ids: string[] }> {
  const root = await mkdtemp(join(tmpdir(), 'ml-weak-'));
  const patch: AgentSetPatch = {
    version: 1,
    set: { id: SET, title: 'Weak deck', folderPath: 'qa/weak', tagIds: [] },
    tagPatch: {
      reuse: [],
      add: [
        { localId: 'arr', label: 'arrays', kind: 'topic' },
        { localId: 'str', label: 'strings', kind: 'topic' },
      ],
    },
    order: ['c1', 'c2', 'c3'],
    cards: [
      { localId: 'c1', tagRefs: ['arr'], front: { prompt: 'Why does splice mutate?' }, back: { shortAnswer: 'In place.', explanationMarkdown: 'x' } },
      { localId: 'c2', tagRefs: ['arr'], front: { prompt: 'What does slice return?' }, back: { shortAnswer: 'A copy.', explanationMarkdown: 'y' } },
      { localId: 'c3', tagRefs: ['str'], front: { prompt: 'Are strings immutable?' }, back: { shortAnswer: 'Yes.', explanationMarkdown: 'z' } },
    ],
  } as AgentSetPatch;
  const res = await importAgentSet(root, patch);
  if (!res.ok) throw new Error('weak seed failed');
  return { root, ids: res.cards.map((c) => c.cardId) };
}

function event(cardId: string, rating: ReviewRating, reviewedAt: string, attempt?: ReviewAttempt): ReviewEvent {
  return {
    cardId, setId: SET, rating, reviewedAt,
    stateBefore: 2, stabilityBefore: 5, difficultyBefore: 5, elapsedDays: 1, scheduledDays: 1,
    ...(attempt ? { attempt } : {}),
  };
}

/** Write one session file the way endSession does. */
async function writeSession(root: string, startedAt: string, events: ReviewEvent[]): Promise<void> {
  const day = startedAt.slice(0, 10);
  const stamp = startedAt.replace(/[:.]/g, '-');
  const session: ReviewSession = {
    id: `s-${stamp}`, startedAt, mode: 'recommended', events,
    summary: { reviewedCount: events.length, again: 0, hard: 0, good: 0, easy: 0 },
  } as ReviewSession;
  await writeJson(join(libraryPaths(root).sessionDayDir(day), `session_${stamp}.json`), session);
}

/** n attempts on one card at increasing timestamps, first `failures` of them Again. */
function attempts(cardId: string, total: number, failures: number, startDay = 1): ReviewEvent[] {
  return Array.from({ length: total }, (_, i) =>
    event(cardId, i < failures ? 1 : 3, `2026-07-${String(startDay + i).padStart(2, '0')}T10:00:00.000Z`));
}

describe('weakScore smoothing', () => {
  it('pulls thin evidence toward 0.5 instead of certainty', () => {
    // One failure on one attempt is NOT a 100% failure rate.
    expect(weakScore(1, 1)).toBeCloseTo(0.667, 3);
    expect(weakScore(0, 1)).toBeCloseTo(0.333, 3);
  });

  it('sharpens as attempts accumulate', () => {
    expect(weakScore(5, 5)).toBeCloseTo(0.857, 3);
    expect(weakScore(0, 5)).toBeCloseTo(0.143, 3);
  });

  it('ranks a consistently failed card above an occasionally failed one', () => {
    expect(weakScore(3, 3)).toBeGreaterThan(weakScore(2, 4));
  });
});

describe('what counts as a retrieval failure', () => {
  const at = '2026-07-01T10:00:00.000Z';

  it('counts an Again rating, whatever the interaction type', () => {
    expect(isRetrievalFailure(event('c', 1, at))).toBe(true);
  });

  it('counts a deterministically wrong choice answer', () => {
    expect(isRetrievalFailure(event('c', 3, at, { interaction: 'choice', correct: false }))).toBe(true);
  });

  it('does NOT count a self-graded flashcard with no correctness recorded', () => {
    // `correct` is undefined for flashcards and self_response, which self-grade.
    // A bare !correct check would score every flashcard as a failure, and
    // flashcards are the most common card type.
    expect(isRetrievalFailure(event('c', 3, at, { interaction: 'flashcard' }))).toBe(false);
    expect(isRetrievalFailure(event('c', 3, at, { interaction: 'self_response', responseText: 'my answer' }))).toBe(false);
  });

  it('does NOT count revealedFull, which is a sticky display preference', () => {
    // The practice client seeds the disclosure panel from localStorage
    // ml-deep-open, so a learner who leaves "Show full explanation" open records
    // revealedFull:true on EVERY attempt forever. Ranking on it would surface
    // that person's layout preference, not their recall.
    expect(isRetrievalFailure(event('c', 4, at, { interaction: 'flashcard', revealedFull: true }))).toBe(false);
    expect(isRetrievalFailure(event('c', 3, at, { interaction: 'choice', correct: true, revealedFull: true }))).toBe(false);
  });

  it('still counts an Again even when the learner had the panel open', () => {
    expect(isRetrievalFailure(event('c', 1, at, { interaction: 'flashcard', revealedFull: true }))).toBe(true);
  });
});

describe('loadWeakReport evidence bar', () => {
  it('reports nothing when no card has been reviewed', async () => {
    const { root } = await seed();
    const report = await loadWeakReport(root);
    expect(report.cards).toEqual([]);
    expect(report.watch).toEqual([]);
    expect(report.attemptedCards).toBe(0);
  });

  it('does not call a card weak on one bad attempt', async () => {
    const { root, ids } = await seed();
    await writeSession(root, '2026-07-01T10:00:00.000Z', attempts(ids[0]!, 1, 1));

    const report = await loadWeakReport(root);
    expect(report.cards).toEqual([]);
    // Visible as "needs more evidence", not silently dropped.
    expect(report.watch).toHaveLength(1);
    expect(report.attemptedCards).toBe(1);
  });

  it('uses minimal evidence events without scheduling fields', async () => {
    const { root, ids } = await seed();
    const events = Array.from({ length: 3 }, (_, index): ReviewEvent => ({
      cardId: ids[0]!, setId: SET, rating: 1,
      reviewedAt: `2026-07-0${index + 1}T10:00:00.000Z`, resultClass: 'evidence',
    }));
    await writeSession(root, '2026-07-01T10:00:00.000Z', events);
    const report = await loadWeakReport(root);
    expect(report.cards).toMatchObject([{ cardId: ids[0], attempts: 3, failures: 3 }]);
  });

  it(`requires ${WEAK_MIN_ATTEMPTS} attempts and ${WEAK_MIN_FAILURES} failures`, async () => {
    const { root, ids } = await seed();
    // 3 attempts but only 1 failure: below the bar.
    await writeSession(root, '2026-07-01T10:00:00.000Z', attempts(ids[0]!, 3, 1));
    // 3 attempts, 2 failures: exactly at the bar.
    await writeSession(root, '2026-07-05T10:00:00.000Z', attempts(ids[1]!, 3, 2, 5));

    const report = await loadWeakReport(root);
    expect(report.cards.map((c) => c.cardId)).toEqual([ids[1]!]);
    expect(report.watch.map((c) => c.cardId)).toEqual([ids[0]!]);
  });

  it('ranks the most-failed card first', async () => {
    const { root, ids } = await seed();
    await writeSession(root, '2026-07-01T10:00:00.000Z', attempts(ids[0]!, 4, 2));
    await writeSession(root, '2026-07-10T10:00:00.000Z', attempts(ids[1]!, 4, 4, 10));

    const report = await loadWeakReport(root);
    expect(report.cards.map((c) => c.cardId)).toEqual([ids[1]!, ids[0]!]);
    expect(report.cards[0]!.failures).toBe(4);
  });

  it('names each weak card\'s concepts, so the tag rollup can be joined to the list', async () => {
    const { root, ids } = await seed();
    await writeSession(root, '2026-07-01T10:00:00.000Z', attempts(ids[0]!, 3, 3));

    const row = (await loadWeakReport(root)).cards[0]!;
    // Resolved labels, not raw ids: `arrays: 3/8` at the top is unusable if the
    // rows below cannot say which of them are the arrays cards.
    expect(row.tagLabels).toEqual(['arrays']);
    expect(row.tagIds).toHaveLength(1);
    expect(row.tagIds[0]).not.toBe('arrays');
  });

  it('falls back to the tag id when a label cannot be resolved', async () => {
    const { root, ids } = await seed();
    await writeSession(root, '2026-07-01T10:00:00.000Z', attempts(ids[0]!, 3, 3));

    // A card referencing a tag that no longer exists must still report a row
    // rather than dropping the card or emitting undefined.
    const card = (await loadCardsForSet(root, SET)).find((c) => c.id === ids[0]!)!;
    await saveCard(root, { ...card, tagIds: ['tag_vanished'] });

    const row = (await loadWeakReport(root)).cards[0]!;
    expect(row.tagLabels).toEqual(['tag_vanished']);
  });

  it('carries explanatory FSRS context without ranking on it', async () => {
    const { root, ids } = await seed();
    await writeSession(root, '2026-07-01T10:00:00.000Z', attempts(ids[0]!, 3, 3));

    const row = (await loadWeakReport(root)).cards[0]!;
    expect(row.prompt).toContain('splice');
    expect(row.setTitle).toBe('Weak deck');
    expect(row.lastReviewedAt).toBe('2026-07-03T10:00:00.000Z');
    expect(typeof row.lapses).toBe('number');
    expect(typeof row.stability).toBe('number');
    expect(row.retention).toBeGreaterThanOrEqual(0);
    expect(row.retention).toBeLessThanOrEqual(100);
  });
});

describe('the attempt window is the most RECENT attempts', () => {
  it(`uses the last ${WEAK_WINDOW} attempts, so improvement shows up`, async () => {
    const { root, ids } = await seed();
    // 7 attempts: the 2 OLDEST failed, the 5 newest passed. A learner who has
    // fixed their gap must stop being called weak.
    await writeSession(root, '2026-07-01T10:00:00.000Z', attempts(ids[0]!, 7, 2));

    const report = await loadWeakReport(root);
    expect(report.cards).toEqual([]);
    const watched = report.watch[0]!;
    expect(watched.attempts).toBe(WEAK_WINDOW);
    expect(watched.failures).toBe(0);
  });

  it('orders by each event reviewedAt, not by session file discovery order', async () => {
    const { root, ids } = await seed();
    // The NEWER day file holds the OLDER events, so anything relying on the
    // directory walk order would build the window backwards.
    await writeSession(root, '2026-07-20T10:00:00.000Z', [
      event(ids[0]!, 1, '2026-07-02T10:00:00.000Z'),
      event(ids[0]!, 1, '2026-07-03T10:00:00.000Z'),
    ]);
    await writeSession(root, '2026-07-02T10:00:00.000Z', [
      event(ids[0]!, 3, '2026-07-21T10:00:00.000Z'),
      event(ids[0]!, 3, '2026-07-22T10:00:00.000Z'),
      event(ids[0]!, 3, '2026-07-23T10:00:00.000Z'),
      event(ids[0]!, 3, '2026-07-24T10:00:00.000Z'),
      event(ids[0]!, 3, '2026-07-25T10:00:00.000Z'),
    ]);

    const report = await loadWeakReport(root);
    // Newest five are all passes, so the two old failures fall out of the window.
    expect(report.cards).toEqual([]);
    expect(report.watch[0]!.failures).toBe(0);
    expect(report.watch[0]!.lastReviewedAt).toBe('2026-07-25T10:00:00.000Z');
  });
});

describe('tag rollup', () => {
  it('ranks tags by weak card count and shows the honest denominator', async () => {
    const { root, ids } = await seed();
    // Both `arrays` cards have enough evidence; one is weak, one is not.
    await writeSession(root, '2026-07-01T10:00:00.000Z', attempts(ids[0]!, 3, 3));
    await writeSession(root, '2026-07-05T10:00:00.000Z', attempts(ids[1]!, 3, 0, 5));
    // The `strings` card has too little evidence to judge at all.
    await writeSession(root, '2026-07-09T10:00:00.000Z', attempts(ids[2]!, 1, 1, 9));

    const report = await loadWeakReport(root);
    const arrays = report.tags.find((t) => t.label === 'arrays')!;
    expect(arrays.weak).toBe(1);
    // Eligible counts cards that COULD be judged, so 1/2 is distinguishable
    // from 1/40 - a bare count would hide which situation you are in.
    expect(arrays.eligible).toBe(2);
    // A tag with no weak cards is not listed as a gap.
    expect(report.tags.map((t) => t.label)).not.toContain('strings');
  });
});

describe('exclusions', () => {
  it('ignores archived cards, which are not something to drill', async () => {
    const { root, ids } = await seed();
    await writeSession(root, '2026-07-01T10:00:00.000Z', attempts(ids[0]!, 3, 3));

    let report = await loadWeakReport(root);
    expect(report.cards).toHaveLength(1);

    const card = (await loadCardsForSet(root, SET)).find((c) => c.id === ids[0]!)!;
    await saveCard(root, { ...card, status: 'archived' });

    report = await loadWeakReport(root);
    expect(report.cards).toEqual([]);
    expect(report.attemptedCards).toBe(0);
  });

  it('ignores events for cards that no longer exist', async () => {
    const { root } = await seed();
    await writeSession(root, '2026-07-01T10:00:00.000Z', attempts('deleted-card-id', 3, 3));

    const report = await loadWeakReport(root);
    expect(report.cards).toEqual([]);
    expect(report.attemptedCards).toBe(0);
  });
});
