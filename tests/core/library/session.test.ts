import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { importAgentSet } from '../../../src/core/library/importAgentSet.js';
import { getDueCards } from '../../../src/core/library/review/dueQueue.js';
import { startSession, gradeCard, endSession } from '../../../src/core/library/review/session.js';
import { newFsrsState, gradeFsrs } from '../../../src/core/library/fsrs.js';
import { loadCard } from '../../../src/core/library/cardStore.js';
import { readJson } from '../../../src/core/library/io.js';
import type { AgentSetPatch, ReviewSession } from '../../../src/core/library/types.js';

async function freshRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'mlt-sess-'));
}

function twoCardPatch(): AgentSetPatch {
  return {
    version: 1,
    set: { title: 'Deck', folderPath: 'topic/deck', tagIds: [] },
    tagPatch: { reuse: [], add: [{ localId: 't', label: 'topic-a', kind: 'topic' }] },
    order: ['c1', 'c2'],
    cards: [
      { localId: 'c1', tagRefs: ['t'], front: { prompt: 'Q1?' }, back: { shortAnswer: 'A1', explanationMarkdown: 'E1' } },
      { localId: 'c2', tagRefs: ['t'], front: { prompt: 'Q2?' }, back: { shortAnswer: 'A2', explanationMarkdown: 'E2' } },
    ],
  };
}

// A single-card set with its own folderPath + tag, for cross-dimension tests.
function oneCardPatch(folderPath: string, tagLabel: string, suffix: string): AgentSetPatch {
  return {
    version: 1,
    set: { title: `Deck ${suffix}`, folderPath, tagIds: [] },
    tagPatch: { reuse: [], add: [{ localId: 't', label: tagLabel, kind: 'topic' }] },
    order: [`c${suffix}`],
    cards: [
      { localId: `c${suffix}`, tagRefs: ['t'], front: { prompt: 'Q?' }, back: { shortAnswer: 'A', explanationMarkdown: 'E' } },
    ],
  };
}

describe('fsrs adapter', () => {
  it('a new card is due at/near creation and Good pushes the due date out', () => {
    const now = new Date('2026-07-07T12:00:00.000Z');
    const fresh = newFsrsState(now);
    expect(new Date(fresh.due).getTime()).toBeLessThanOrEqual(now.getTime() + 1000);
    const graded = gradeFsrs(fresh, 3, now); // Good
    expect(new Date(graded.due).getTime()).toBeGreaterThan(now.getTime());
    expect(graded.reps).toBe(1);
  });

  it('Again keeps the card due very soon (short interval)', () => {
    const now = new Date('2026-07-07T12:00:00.000Z');
    const again = gradeFsrs(newFsrsState(now), 1, now);
    // relearning/again stays within a day at daily cadence
    expect(new Date(again.due).getTime() - now.getTime()).toBeLessThanOrEqual(2 * 86400_000);
  });
});

describe('due queue + review session', () => {
  it('surfaces both fresh cards as due, then grading removes one from the queue', async () => {
    const root = await freshRoot();
    const now = new Date('2026-07-07T12:00:00.000Z');
    const res = await importAgentSet(root, twoCardPatch(), { now });
    const setId = res.setId!;

    let due = await getDueCards(root, now);
    expect(due).toHaveLength(2);

    const session = startSession('recommended', undefined, now);
    const updated = await gradeCard(root, session, due[0], 3, now); // Good
    expect(new Date(updated.fsrs.due).getTime()).toBeGreaterThan(now.getTime());

    // the graded card is persisted with its new schedule
    const reloaded = await loadCard(root, setId, due[0].id);
    expect(reloaded!.fsrs.reps).toBe(1);

    // and is no longer due right now
    due = await getDueCards(root, now);
    expect(due.map((c) => c.id)).not.toContain(updated.id);
    expect(due).toHaveLength(1);
  });

  it('filters due cards by tag', async () => {
    const root = await freshRoot();
    const now = new Date('2026-07-07T12:00:00.000Z');
    const res = await importAgentSet(root, twoCardPatch(), { now });
    const cards = await getDueCards(root, now);
    const tagId = cards[0].tagIds[0];
    const filtered = await getDueCards(root, now, { tagIds: [tagId] });
    expect(filtered).toHaveLength(2);
    const none = await getDueCards(root, now, { tagIds: ['tag_nope'] });
    expect(none).toHaveLength(0);
    expect(res.ok).toBe(true);
  });

  it('combines dimensions by union (default) or intersection', async () => {
    const root = await freshRoot();
    const now = new Date('2026-07-07T12:00:00.000Z');
    const resA = await importAgentSet(root, oneCardPatch('python/basics', 'python', 'A'), { now });
    const resB = await importAgentSet(root, oneCardPatch('rust/basics', 'rust', 'B'), { now });
    const setA = resA.setId!;
    const setB = resB.setId!;

    const all = await getDueCards(root, now);
    expect(all).toHaveLength(2);
    // tagB belongs to the card in setB — a different card than setA's.
    const cardB = all.find((c) => c.setId === setB)!;
    const tagB = cardB.tagIds[0];

    // union: (in setA) OR (has tagB) → both distinct cards match.
    const union = await getDueCards(root, now, { setIds: [setA], tagIds: [tagB], combinator: 'union' });
    expect(union).toHaveLength(2);

    // intersection: (in setA) AND (has tagB) → no single card satisfies both.
    const inter = await getDueCards(root, now, { setIds: [setA], tagIds: [tagB], combinator: 'intersection' });
    expect(inter).toHaveLength(0);

    // default (no combinator) behaves as union.
    const dflt = await getDueCards(root, now, { setIds: [setA], tagIds: [tagB] });
    expect(dflt).toHaveLength(2);

    // multi-select within one dimension is always OR, regardless of combinator.
    const bothSets = await getDueCards(root, now, { setIds: [setA, setB], combinator: 'intersection' });
    expect(bothSets).toHaveLength(2);
  });

  it('records pre-reveal confidence on the review event when provided', async () => {
    const root = await freshRoot();
    const now = new Date('2026-07-07T12:00:00.000Z');
    await importAgentSet(root, twoCardPatch(), { now });
    const due = await getDueCards(root, now);

    const session = startSession('recommended', undefined, now);
    await gradeCard(root, session, due[0], 3, now, 5); // Good, "Certain" before reveal
    await gradeCard(root, session, due[1], 1, now); // no confidence supplied

    expect(session.events[0].confidenceBeforeReveal).toBe(5);
    expect(session.events[1].confidenceBeforeReveal).toBeUndefined();

    const path = await endSession(root, session, now);
    const saved = await readJson<ReviewSession>(path);
    expect(saved?.events[0].confidenceBeforeReveal).toBe(5);
    expect(saved?.events[1]).not.toHaveProperty('confidenceBeforeReveal');
  });

  it('records the pre-reveal attempt on the event and persists it', async () => {
    const root = await freshRoot();
    const now = new Date('2026-07-07T12:00:00.000Z');
    await importAgentSet(root, twoCardPatch(), { now });
    const due = await getDueCards(root, now);

    const session = startSession('lesson', undefined, now);
    // A deterministic choice attempt (correct) on card 1; nothing on card 2.
    await gradeCard(root, session, due[0], 3, now, 4, {
      interaction: 'choice', selectedOptionIds: ['b'], correct: true, revealedFull: false, elapsedMs: 4200,
    });
    await gradeCard(root, session, due[1], 1, now);

    expect(session.mode).toBe('lesson');
    expect(session.events[0].attempt?.interaction).toBe('choice');
    expect(session.events[0].attempt?.correct).toBe(true);
    expect(session.events[0].attempt?.selectedOptionIds).toEqual(['b']);
    expect(session.events[1].attempt).toBeUndefined();

    const path = await endSession(root, session, now);
    const saved = await readJson<ReviewSession>(path);
    expect(saved?.events[0].attempt?.elapsedMs).toBe(4200);
    expect(saved?.events[1]).not.toHaveProperty('attempt');
  });

  it('endSession writes a per-day session file with the correct summary', async () => {
    const root = await freshRoot();
    const now = new Date('2026-07-07T12:00:00.000Z');
    await importAgentSet(root, twoCardPatch(), { now });
    const due = await getDueCards(root, now);

    const session = startSession('set', { setIds: [due[0].setId] }, now);
    await gradeCard(root, session, due[0], 3, now);
    await gradeCard(root, session, due[1], 1, now);
    const path = await endSession(root, session, now);

    const saved = await readJson<ReviewSession>(path);
    expect(saved?.summary.reviewedCount).toBe(2);
    expect(saved?.summary.good).toBe(1);
    expect(saved?.summary.again).toBe(1);
    expect(saved?.events).toHaveLength(2);
    expect(saved?.endedAt).toBeDefined();
    expect(path).toContain(join('sessions', '2026-07-07'));
  });
});
