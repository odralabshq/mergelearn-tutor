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
