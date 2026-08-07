import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { importAgentSet } from '../../../src/core/library/importAgentSet.js';
import { getDueCards } from '../../../src/core/library/review/dueQueue.js';
import {
  startSession, gradeCard, undoLastGrade, endSession,
  startPlannedSession, gradePlannedSession, undoPlannedGrade, advanceUnavailableEntries,
  PlannedSessionError,
} from '../../../src/core/library/review/session.js';
import { newFsrsState, gradeFsrs } from '../../../src/core/library/fsrs.js';
import { loadCard, saveCard } from '../../../src/core/library/cardStore.js';
import { archiveCard } from '../../../src/core/library/cardLifecycle.js';
import { readJson } from '../../../src/core/library/io.js';
import { libraryPaths } from '../../../src/core/library/libraryStore.js';
import type { AgentSetPatch, Card, ReviewSession } from '../../../src/core/library/types.js';

function undoRequest(session: ReviewSession, requestId = `undo-${session.plan!.revision}`) {
  const event = [...session.events].reverse().find((item) => item.resultClass === 'scheduled')!;
  return {
    requestId, revision: session.plan!.revision,
    entryId: event.entryId!, gradeRequestId: event.requestId!,
  };
}

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

function manyCardPatch(count: number): AgentSetPatch {
  const ids = Array.from({ length: count }, (_, index) => `c${index}`);
  return {
    version: 1,
    set: { title: 'Long deck', folderPath: 'topic/long', tagIds: [] },
    tagPatch: { reuse: [], add: [{ localId: 't', label: 'long', kind: 'topic' }] },
    order: ids,
    cards: ids.map((localId) => ({
      localId, tagRefs: ['t'], front: { prompt: `${localId}?` },
      back: { shortAnswer: localId, explanationMarkdown: localId },
    })),
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
  it('advances an unavailable current entry without an event or request charge', async () => {
    const root = await freshRoot();
    const now = new Date('2026-08-05T12:00:00.000Z');
    await importAgentSet(root, twoCardPatch(), { now });
    const cards = await getDueCards(root, now);
    const session = startPlannedSession('recommended', 'review_due', cards, undefined, now);
    const first = session.plan!.entries[0];
    const second = session.plan!.entries[1];
    await archiveCard(root, first.setId, first.cardId, new Date('2026-08-05T12:01:00.000Z'));

    await expect(gradePlannedSession(root, session, {
      requestId: 'unavailable', revision: 0, entryId: first.id,
      setId: first.setId, cardId: first.cardId, rating: 3,
    }, now)).rejects.toMatchObject({ code: 'card_unavailable' });

    expect(session.plan).toMatchObject({ revision: 1, currentEntryId: second.id, gradeLedger: [] });
    expect(session.events).toEqual([]);
    expect(session.summary).toMatchObject({ reviewedCount: 0, unresolved: 1 });

    await gradePlannedSession(root, session, {
      requestId: 'next', revision: 1, entryId: second.id,
      setId: second.setId, cardId: second.cardId, rating: 3,
    }, now);
    expect(session.summary).toMatchObject({ reviewedCount: 1, unresolved: 1 });
  });

  it('plans a stable cursor, replays one grade exactly, and rejects a stale revision', async () => {
    const root = await freshRoot();
    const now = new Date('2026-08-05T12:00:00.000Z');
    await importAgentSet(root, twoCardPatch(), { now });
    const cards = await getDueCards(root, now);
    const session = startPlannedSession('recommended', 'review_due', cards, undefined, now);
    const first = session.plan!.entries[0];
    const request = {
      requestId: 'request-1', revision: 0, entryId: first.id,
      setId: first.setId, cardId: first.cardId, rating: 3 as const,
    };

    const accepted = await gradePlannedSession(root, session, request, now);
    const replayed = await gradePlannedSession(root, session, request, now);

    expect(session.plan!.entries).toHaveLength(2);
    expect(session.plan!.revision).toBe(1);
    expect(session.plan!.currentEntryId).toBe(session.plan!.entries[1].id);
    expect(session.events).toHaveLength(1);
    expect((await loadCard(root, first.setId, first.cardId))!.fsrs.reps).toBe(1);
    expect(replayed).toEqual({ ...accepted, replayed: true });

    await expect(gradePlannedSession(root, session, {
      ...request, requestId: 'request-2', entryId: session.plan!.entries[1].id,
      setId: session.plan!.entries[1].setId, cardId: session.plan!.entries[1].cardId,
    }, now)).rejects.toMatchObject({ code: 'stale_revision' } satisfies Partial<PlannedSessionError>);
    expect(session.events).toHaveLength(1);
  });

  it('rejects conflicting request reuse and exhausts the fixed budget without grading', async () => {
    const root = await freshRoot();
    const now = new Date('2026-08-05T12:00:00.000Z');
    await importAgentSet(root, twoCardPatch(), { now });
    const cards = await getDueCards(root, now);
    const session = startPlannedSession('recommended', 'review_due', cards, undefined, now);
    const entry = session.plan!.entries[0];
    const request = {
      requestId: 'request-1', revision: 0, entryId: entry.id,
      setId: entry.setId, cardId: entry.cardId, rating: 3 as const,
    };
    const accepted = await gradePlannedSession(root, session, request, now);

    await expect(gradePlannedSession(root, session, { ...request, rating: 4 }, now))
      .rejects.toMatchObject({ code: 'request_id_conflict' });
    await expect(gradePlannedSession(root, session, { ...request, requestId: 'request-alias' }, now))
      .resolves.toEqual({ ...accepted, replayed: true });

    const second = session.plan!.entries[1];
    const acceptedLedger = session.plan!.gradeLedger[0];
    session.plan!.gradeLedger = [acceptedLedger, ...Array.from({ length: 511 }, (_, index) => ({
      requestId: `used-${index}`, semanticKey: `used-${index}`, response: accepted,
    }))];
    await expect(gradePlannedSession(root, session, {
      requestId: 'over-budget', revision: 1, entryId: second.id,
      setId: second.setId, cardId: second.cardId, rating: 3,
    }, new Date('2026-08-05T12:01:00.000Z'))).rejects.toMatchObject({ code: 'request_budget_exhausted' });
    expect(session.plan!.terminalReason).toBe('request_budget_exhausted');
    expect(session.plan!.currentEntryId).toBeUndefined();
    expect(session.endedAt).toBe('2026-08-05T12:01:00.000Z');
    expect((await loadCard(root, second.setId, second.cardId))!.fsrs.reps).toBe(0);
    const stamp = session.startedAt.replace(/[:.]/g, '-');
    const saved = await readJson<ReviewSession>(join(
      libraryPaths(root).sessionDayDir(session.startedAt.slice(0, 10)), `session_${stamp}.json`,
    ));
    expect(saved).toMatchObject({
      endedAt: '2026-08-05T12:01:00.000Z',
      plan: { terminalReason: 'request_budget_exhausted' },
    });
    await expect(gradePlannedSession(root, session, request, now))
      .resolves.toEqual({ ...accepted, replayed: true });
  });

  it('places a late Again revisit three cards ahead and keeps it reachable', async () => {
    const root = await freshRoot();
    const now = new Date('2026-08-05T12:00:00.000Z');
    await importAgentSet(root, manyCardPatch(10), { now });
    const session = startPlannedSession('recommended', 'review_due', await getDueCards(root, now), undefined, now);
    for (let index = 0; index < 5; index += 1) {
      const entry = session.plan!.entries.find((item) => item.id === session.plan!.currentEntryId)!;
      await gradePlannedSession(root, session, {
        requestId: `advance-${index}`, revision: index, entryId: entry.id,
        setId: entry.setId, cardId: entry.cardId, rating: index === 4 ? 1 : 3,
      }, now);
    }
    const source = session.events[4];
    const sourceIndex = session.plan!.entries.findIndex((entry) => entry.id === source.entryId);
    const revisitIndex = session.plan!.entries.findIndex((entry) =>
      entry.pass === 'revisit' && entry.cardId === source.cardId);
    const cursorIndex = session.plan!.entries.findIndex((entry) => entry.id === session.plan!.currentEntryId);
    expect(revisitIndex).toBe(sourceIndex + 4);
    expect(revisitIndex).toBeGreaterThan(cursorIndex);
  });

  it('records bounded Again revisits as evidence without scheduling twice', async () => {
    const root = await freshRoot();
    const now = new Date('2026-08-05T12:00:00.000Z');
    await importAgentSet(root, twoCardPatch(), { now });
    const cards = await getDueCards(root, now);
    const session = startPlannedSession('recommended', 'review_due', cards, undefined, now);
    const first = session.plan!.entries[0];
    const firstResult = await gradePlannedSession(root, session, {
      requestId: 'first', revision: 0, entryId: first.id,
      setId: first.setId, cardId: first.cardId, rating: 1,
    }, now);
    expect(firstResult.resultClass).toBe('scheduled');
    expect(firstResult.due).toBeDefined();

    const second = session.plan!.entries.find((entry) => entry.pass === 'first' && entry.id !== first.id)!;
    await gradePlannedSession(root, session, {
      requestId: 'second', revision: 1, entryId: second.id,
      setId: second.setId, cardId: second.cardId, rating: 3,
    }, now);
    const revisit = session.plan!.entries.find((entry) => entry.pass === 'revisit')!;
    const beforeRevisit = structuredClone((await loadCard(root, first.setId, first.cardId))!.fsrs);
    const evidence = await gradePlannedSession(root, session, {
      requestId: 'revisit-1', revision: 2, entryId: revisit.id,
      setId: revisit.setId, cardId: revisit.cardId, rating: 1,
    }, now);

    expect(evidence.resultClass).toBe('evidence');
    expect(evidence).not.toHaveProperty('due');
    expect((await loadCard(root, first.setId, first.cardId))!.fsrs).toEqual(beforeRevisit);
    expect(session.events.map((event) => event.resultClass)).toEqual(['scheduled', 'scheduled', 'evidence']);
    expect(session.plan!.entries.filter((entry) => entry.cardId === first.cardId && entry.pass === 'revisit')).toHaveLength(2);
    expect(session.summary).toMatchObject({ scheduledResults: 2, evidenceAttempts: 1, firstPass: 2, retried: 1 });
  });

  it('does not mark an unavailable revisit as an unresolved first pass', async () => {
    const root = await freshRoot();
    const now = new Date('2026-08-05T12:00:00.000Z');
    await importAgentSet(root, twoCardPatch(), { now });
    const session = startPlannedSession('recommended', 'review_due', await getDueCards(root, now), undefined, now);
    const first = session.plan!.entries[0];
    await gradePlannedSession(root, session, {
      requestId: 'scheduled-again', revision: 0, entryId: first.id,
      setId: first.setId, cardId: first.cardId, rating: 1,
    }, now);
    const second = session.plan!.entries.find((entry) => entry.pass === 'first' && entry.id !== first.id)!;
    await gradePlannedSession(root, session, {
      requestId: 'scheduled-second', revision: 1, entryId: second.id,
      setId: second.setId, cardId: second.cardId, rating: 3,
    }, now);
    expect(session.plan!.entries.find((entry) => entry.id === session.plan!.currentEntryId)?.pass).toBe('revisit');

    await archiveCard(root, first.setId, first.cardId, now);
    expect(await advanceUnavailableEntries(root, session)).toBe(1);
    expect(session.plan!.unresolvedEntryIds).toEqual([]);
    expect(session.summary.unresolved).toBe(0);
  });

  it('Retry missed revisits only Again cards without a second FSRS mutation', async () => {
    const root = await freshRoot();
    const now = new Date('2026-08-05T12:00:00.000Z');
    await importAgentSet(root, twoCardPatch(), { now });
    const cards = await getDueCards(root, now);
    const session = startPlannedSession('recommended', 'retry_missed', cards, undefined, now);
    const first = session.plan!.entries[0];
    const second = session.plan!.entries[1];
    await gradePlannedSession(root, session, {
      requestId: 'retry-first', revision: 0, entryId: first.id,
      setId: first.setId, cardId: first.cardId, rating: 1,
    }, now);
    await gradePlannedSession(root, session, {
      requestId: 'retry-second', revision: 1, entryId: second.id,
      setId: second.setId, cardId: second.cardId, rating: 3,
    }, now);
    const revisits = session.plan!.entries.filter((entry) => entry.pass === 'revisit');
    expect(revisits.length).toBeGreaterThan(0);
    expect(revisits.every((entry) => entry.cardId === first.cardId)).toBe(true);
    const revisit = revisits[0];
    const before = structuredClone((await loadCard(root, revisit.setId, revisit.cardId))!.fsrs);
    const evidence = await gradePlannedSession(root, session, {
      requestId: 'retry-evidence', revision: 2, entryId: revisit.id,
      setId: revisit.setId, cardId: revisit.cardId, rating: 3,
    }, now);

    expect(evidence.resultClass).toBe('evidence');
    expect(evidence).not.toHaveProperty('due');
    expect((await loadCard(root, revisit.setId, revisit.cardId))!.fsrs).toEqual(before);
  });

  it.each(['after_intent', 'after_card'] as const)(
    'recovers one scheduled grade after a crash %s without duplicating FSRS or events',
    async (boundary) => {
      const root = await freshRoot();
      const now = new Date('2026-08-05T12:00:00.000Z');
      await importAgentSet(root, twoCardPatch(), { now });
      const cards = await getDueCards(root, now);
      const session = startPlannedSession('recommended', 'review_due', cards, undefined, now);
      const entry = session.plan!.entries[0];
      const request = {
        requestId: `crash-${boundary}`, revision: 0, entryId: entry.id,
        setId: entry.setId, cardId: entry.cardId, rating: 3 as const,
      };
      const crash = new Error(boundary);

      await expect(gradePlannedSession(root, session, request, now, {
        afterIntent: () => { if (boundary === 'after_intent') throw crash; },
        afterCard: () => { if (boundary === 'after_card') throw crash; },
      })).rejects.toBe(crash);

      const stamp = session.startedAt.replace(/[:.]/g, '-');
      const path = join(libraryPaths(root).sessionDayDir(session.startedAt.slice(0, 10)), `session_${stamp}.json`);
      const interrupted = (await readJson<ReviewSession>(path))!;
      expect(interrupted.pendingTransition?.requestId).toBe(request.requestId);

      const replay = await gradePlannedSession(root, interrupted, request, now);
      expect(replay.replayed).toBe(true);
      expect(interrupted.pendingTransition).toBeUndefined();
      expect(interrupted.events).toHaveLength(1);
      expect(interrupted.plan!.gradeLedger).toHaveLength(1);
      expect((await loadCard(root, entry.setId, entry.cardId))!.fsrs.reps).toBe(1);
    },
  );

  it('recovers an after-card transition when the same card image has different key order', async () => {
    const root = await freshRoot();
    const now = new Date('2026-08-05T12:00:00.000Z');
    await importAgentSet(root, twoCardPatch(), { now });
    const session = startPlannedSession('recommended', 'review_due', await getDueCards(root, now), undefined, now);
    const entry = session.plan!.entries[0];
    const request = {
      requestId: 'reordered-after-card', revision: 0, entryId: entry.id,
      setId: entry.setId, cardId: entry.cardId, rating: 3 as const,
    };
    await expect(gradePlannedSession(root, session, request, now, {
      afterCard: () => { throw new Error('crash after card'); },
    })).rejects.toThrow('crash after card');
    const written = (await loadCard(root, entry.setId, entry.cardId))!;
    const reordered = Object.fromEntries(Object.entries(written).reverse()) as Card;
    await saveCard(root, reordered);
    const stamp = session.startedAt.replace(/[:.]/g, '-');
    const path = join(libraryPaths(root).sessionDayDir(session.startedAt.slice(0, 10)), `session_${stamp}.json`);
    const interrupted = (await readJson<ReviewSession>(path))!;

    await expect(gradePlannedSession(root, interrupted, request, now)).resolves.toMatchObject({
      ok: true, replayed: true,
    });
    expect(interrupted.events).toHaveLength(1);
    expect(interrupted.plan!.gradeLedger).toHaveLength(1);
  });

  it('keeps a failed scheduled intent write out of cached state', async () => {
    const root = await freshRoot();
    const now = new Date('2026-08-05T12:00:00.000Z');
    await importAgentSet(root, twoCardPatch(), { now });
    const session = startPlannedSession('recommended', 'review_due', await getDueCards(root, now), undefined, now);
    const before = structuredClone(session);
    const dayDir = libraryPaths(root).sessionDayDir(session.startedAt.slice(0, 10));
    await mkdir(join(root, 'profile', 'sessions'), { recursive: true });
    await writeFile(dayDir, 'blocks directory creation', 'utf8');
    const entry = session.plan!.entries[0];
    await expect(gradePlannedSession(root, session, {
      requestId: 'scheduled-write-fails', revision: 0, entryId: entry.id,
      setId: entry.setId, cardId: entry.cardId, rating: 3,
    }, now)).rejects.toBeTruthy();
    expect(session).toEqual(before);
    expect((await loadCard(root, entry.setId, entry.cardId))!.fsrs.reps).toBe(0);
  });

  it('preserves a lifecycle mutation that lands after Grade intent persistence', async () => {
    const root = await freshRoot();
    const now = new Date('2026-08-05T12:00:00.000Z');
    await importAgentSet(root, twoCardPatch(), { now });
    const session = startPlannedSession('recommended', 'review_due', await getDueCards(root, now), undefined, now);
    const entry = session.plan!.entries[0];
    await expect(gradePlannedSession(root, session, {
      requestId: 'archive-during-grade', revision: 0, entryId: entry.id,
      setId: entry.setId, cardId: entry.cardId, rating: 3,
    }, now, {
      afterIntent: async () => {
        await archiveCard(root, entry.setId, entry.cardId,
          new Date('2026-08-05T12:00:30.000Z'));
      },
    })).rejects.toMatchObject({ code: 'transition_diverged' });
    expect(await loadCard(root, entry.setId, entry.cardId)).toMatchObject({ status: 'archived' });
    expect(session.events).toEqual([]);
    expect(session.pendingTransition).toBeUndefined();
  });

  it('recovers a prepared grade before End persists the terminal session', async () => {
    const root = await freshRoot();
    const now = new Date('2026-08-05T12:00:00.000Z');
    await importAgentSet(root, twoCardPatch(), { now });
    const session = startPlannedSession('recommended', 'review_due', await getDueCards(root, now), undefined, now);
    const entry = session.plan!.entries[0];
    const request = {
      requestId: 'end-crash', revision: 0, entryId: entry.id,
      setId: entry.setId, cardId: entry.cardId, rating: 3 as const,
    };
    await expect(gradePlannedSession(root, session, request, now, {
      afterCard: () => { throw new Error('crash after card'); },
    })).rejects.toThrow('crash after card');
    const stamp = session.startedAt.replace(/[:.]/g, '-');
    const path = join(libraryPaths(root).sessionDayDir(session.startedAt.slice(0, 10)), `session_${stamp}.json`);
    const interrupted = (await readJson<ReviewSession>(path))!;

    await endSession(root, interrupted, new Date('2026-08-05T12:01:00.000Z'));
    expect(interrupted).toMatchObject({
      endedAt: '2026-08-05T12:01:00.000Z', summary: { reviewedCount: 1 },
    });
    expect(interrupted.pendingTransition).toBeUndefined();
    expect(interrupted.events).toHaveLength(1);
    expect(interrupted.plan!.gradeLedger).toHaveLength(1);
    await expect(gradePlannedSession(root, interrupted, request, now))
      .resolves.toMatchObject({ requestId: request.requestId, replayed: true });
    await expect(gradePlannedSession(root, interrupted, { ...request, rating: 4 }, now))
      .rejects.toMatchObject({ code: 'request_id_conflict' });
    await expect(gradePlannedSession(root, interrupted, { ...request, requestId: 'semantic-replay' }, now))
      .resolves.toMatchObject({ requestId: request.requestId, replayed: true });
  });

  it('keeps a failed End write out of cached state', async () => {
    const root = await freshRoot();
    const now = new Date('2026-08-05T12:00:00.000Z');
    await importAgentSet(root, twoCardPatch(), { now });
    const session = startPlannedSession('recommended', 'review_due', await getDueCards(root, now), undefined, now);
    const before = structuredClone(session);
    const dayDir = libraryPaths(root).sessionDayDir(session.startedAt.slice(0, 10));
    await mkdir(join(root, 'profile', 'sessions'), { recursive: true });
    await writeFile(dayDir, 'blocks directory creation', 'utf8');

    await expect(endSession(root, session, new Date('2026-08-05T12:01:00.000Z'))).rejects.toBeTruthy();
    expect(session).toEqual(before);
    expect(session.endedAt).toBeUndefined();
  });

  it('recovers prepared work before direct unavailable traversal', async () => {
    const root = await freshRoot();
    const now = new Date('2026-08-05T12:00:00.000Z');
    await importAgentSet(root, twoCardPatch(), { now });
    const session = startPlannedSession('recommended', 'review_due', await getDueCards(root, now), undefined, now);
    const [first, second] = session.plan!.entries;
    await expect(gradePlannedSession(root, session, {
      requestId: 'prepared-before-direct-traversal', revision: 0, entryId: first.id,
      setId: first.setId, cardId: first.cardId, rating: 3,
    }, now, { afterIntent: () => { throw new Error('simulated crash'); } }))
      .rejects.toThrow('simulated crash');
    await archiveCard(root, second.setId, second.cardId, new Date('2026-08-05T12:00:30.000Z'));

    expect(await advanceUnavailableEntries(root, session)).toBe(1);
    expect(session.pendingTransition).toBeUndefined();
    expect(session.events).toHaveLength(1);
    expect(session.plan).toMatchObject({ revision: 2, unresolvedEntryIds: [second.id] });
  });

  it('abandons a divergent pending grade durably and permits a fresh request', async () => {
    const root = await freshRoot();
    const now = new Date('2026-08-05T12:00:00.000Z');
    await importAgentSet(root, twoCardPatch(), { now });
    const cards = await getDueCards(root, now);
    const session = startPlannedSession('recommended', 'review_due', cards, undefined, now);
    const entry = session.plan!.entries[0];
    const request = {
      requestId: 'diverged', revision: 0, entryId: entry.id,
      setId: entry.setId, cardId: entry.cardId, rating: 3 as const,
    };
    await expect(gradePlannedSession(root, session, request, now, {
      afterIntent: () => { throw new Error('crash'); },
    })).rejects.toThrow('crash');

    const changed = (await loadCard(root, entry.setId, entry.cardId))!;
    changed.front.prompt = 'independent edit';
    changed.updatedAt = '2026-08-05T12:00:30.000Z';
    await saveCard(root, changed);
    const stamp = session.startedAt.replace(/[:.]/g, '-');
    const path = join(libraryPaths(root).sessionDayDir(session.startedAt.slice(0, 10)), `session_${stamp}.json`);
    const interrupted = (await readJson<ReviewSession>(path))!;

    await expect(gradePlannedSession(root, interrupted, request, now))
      .rejects.toMatchObject({ code: 'transition_diverged' });
    expect(interrupted.pendingTransition).toBeUndefined();
    expect(interrupted.events).toEqual([]);
    expect(interrupted.plan!.revision).toBe(0);
    expect(interrupted.plan!.currentEntryId).toBe(entry.id);
    expect(interrupted.plan!.gradeLedger).toHaveLength(1);
    await expect(gradePlannedSession(root, interrupted, request, now))
      .rejects.toMatchObject({ code: 'transition_diverged' });

    const fresh = await gradePlannedSession(root, interrupted, { ...request, requestId: 'fresh' }, now);
    expect(fresh.resultClass).toBe('scheduled');
    expect(interrupted.events).toHaveLength(1);
    expect((await loadCard(root, entry.setId, entry.cardId))!.front.prompt).toBe('independent edit');
    await endSession(root, interrupted, new Date('2026-08-05T12:05:00.000Z'));
    await expect(gradePlannedSession(root, interrupted, request, now))
      .rejects.toMatchObject({ code: 'transition_diverged' });
  });

  it('admits a fresh request immediately after abandoning another request divergence', async () => {
    const root = await freshRoot();
    const now = new Date('2026-08-05T12:00:00.000Z');
    await importAgentSet(root, twoCardPatch(), { now });
    const session = startPlannedSession('recommended', 'review_due', await getDueCards(root, now), undefined, now);
    const entry = session.plan!.entries[0];
    const original = {
      requestId: 'diverged-first', revision: 0, entryId: entry.id,
      setId: entry.setId, cardId: entry.cardId, rating: 3 as const,
    };
    await expect(gradePlannedSession(root, session, original, now, {
      afterIntent: () => { throw new Error('crash'); },
    })).rejects.toThrow('crash');
    const changed = (await loadCard(root, entry.setId, entry.cardId))!;
    changed.front.prompt = 'independent edit';
    changed.updatedAt = '2026-08-05T12:00:30.000Z';
    await saveCard(root, changed);

    const fresh = await gradePlannedSession(root, session, { ...original, requestId: 'fresh-first' }, now);
    expect(fresh.resultClass).toBe('scheduled');
    expect(session.plan!.gradeLedger.find((item) => item.requestId === original.requestId))
      .toMatchObject({ error: { code: 'transition_diverged' } });
    expect(session.events).toHaveLength(1);
  });

  it('refuses Undo when the latest answer is evidence-only', async () => {
    const root = await freshRoot();
    const now = new Date('2026-08-05T12:00:00.000Z');
    await importAgentSet(root, twoCardPatch(), { now });
    const session = startPlannedSession('recommended', 'retry_missed', await getDueCards(root, now), undefined, now);
    for (const [revision, rating] of [[0, 1], [1, 3], [2, 3]] as const) {
      const entry = session.plan!.entries.find((item) => item.id === session.plan!.currentEntryId)!;
      await gradePlannedSession(root, session, {
        requestId: `answer-${revision}`, revision, entryId: entry.id,
        setId: entry.setId, cardId: entry.cardId, rating,
      }, now);
    }
    const before = structuredClone(session.events);
    await expect(undoPlannedGrade(root, session, undoRequest(session, 'undo-evidence'), now))
      .rejects.toMatchObject({ code: 'undo_unavailable' });
    expect(session.events).toEqual(before);
  });

  it('persists an evidence-only revisit inside the core transition', async () => {
    const root = await freshRoot();
    const now = new Date('2026-08-05T12:00:00.000Z');
    await importAgentSet(root, twoCardPatch(), { now });
    const session = startPlannedSession('recommended', 'retry_missed', await getDueCards(root, now), undefined, now);
    for (const [revision, rating] of [[0, 1], [1, 3], [2, 3]] as const) {
      const entry = session.plan!.entries.find((item) => item.id === session.plan!.currentEntryId)!;
      await gradePlannedSession(root, session, {
        requestId: `persist-${revision}`, revision, entryId: entry.id,
        setId: entry.setId, cardId: entry.cardId, rating,
      }, now);
    }
    const stamp = session.startedAt.replace(/[:.]/g, '-');
    const saved = await readJson<ReviewSession>(join(
      libraryPaths(root).sessionDayDir(session.startedAt.slice(0, 10)), `session_${stamp}.json`,
    ));
    expect(saved.events.at(-1)).toMatchObject({ resultClass: 'evidence', requestId: 'persist-2' });
    expect(saved.plan!.gradeLedger.at(-1)).toMatchObject({ requestId: 'persist-2' });
  });

  it('keeps evidence-only state out of memory when its session write fails', async () => {
    const root = await freshRoot();
    const now = new Date('2026-08-05T12:00:00.000Z');
    await importAgentSet(root, twoCardPatch(), { now });
    const session = startPlannedSession('recommended', 'retry_missed', await getDueCards(root, now), undefined, now);
    for (const [revision, rating] of [[0, 1], [1, 3]] as const) {
      const entry = session.plan!.entries.find((item) => item.id === session.plan!.currentEntryId)!;
      await gradePlannedSession(root, session, {
        requestId: `before-failure-${revision}`, revision, entryId: entry.id,
        setId: entry.setId, cardId: entry.cardId, rating,
      }, now);
    }
    const before = structuredClone(session);
    const dayDir = libraryPaths(root).sessionDayDir(session.startedAt.slice(0, 10));
    await rm(dayDir, { recursive: true });
    await writeFile(dayDir, 'blocks directory creation', 'utf8');
    const revisit = session.plan!.entries.find((item) => item.id === session.plan!.currentEntryId)!;
    await expect(gradePlannedSession(root, session, {
      requestId: 'evidence-write-fails', revision: 2, entryId: revisit.id,
      setId: revisit.setId, cardId: revisit.cardId, rating: 3,
    }, now)).rejects.toBeTruthy();
    expect(session).toEqual(before);
  });

  it('counts an unavailable entry once after Undo rewinds and re-grades', async () => {
    const root = await freshRoot();
    const now = new Date('2026-08-05T12:00:00.000Z');
    await importAgentSet(root, twoCardPatch(), { now });
    const session = startPlannedSession('recommended', 'review_due', await getDueCards(root, now), undefined, now);
    const first = session.plan!.entries[0];
    const second = session.plan!.entries[1];
    await gradePlannedSession(root, session, {
      requestId: 'first-grade', revision: 0, entryId: first.id,
      setId: first.setId, cardId: first.cardId, rating: 3,
    }, now);
    await archiveCard(root, second.setId, second.cardId, new Date('2026-08-05T12:00:30.000Z'));
    await advanceUnavailableEntries(root, session);
    expect(session.summary.unresolved).toBe(1);
    await undoPlannedGrade(root, session, undoRequest(session, 'undo-rewind'), new Date('2026-08-05T12:01:00.000Z'));
    await gradePlannedSession(root, session, {
      requestId: 'corrected', revision: 3, entryId: first.id,
      setId: first.setId, cardId: first.cardId, rating: 4,
    }, new Date('2026-08-05T12:02:00.000Z'));
    await advanceUnavailableEntries(root, session);
    expect(session.summary.unresolved).toBe(1);
    expect(session.plan!.unresolvedEntryIds).toEqual([second.id]);
  });

  it('refuses planned Undo when the graded card is no longer active', async () => {
    const root = await freshRoot();
    const now = new Date('2026-08-05T12:00:00.000Z');
    await importAgentSet(root, twoCardPatch(), { now });
    const session = startPlannedSession('recommended', 'review_due', await getDueCards(root, now), undefined, now);
    const entry = session.plan!.entries[0];
    await gradePlannedSession(root, session, {
      requestId: 'inactive-undo', revision: 0, entryId: entry.id,
      setId: entry.setId, cardId: entry.cardId, rating: 3,
    }, now);
    await archiveCard(root, entry.setId, entry.cardId, new Date('2026-08-05T12:00:30.000Z'));
    const before = structuredClone(session);

    await expect(undoPlannedGrade(root, session, undoRequest(session, 'undo-inactive'), new Date('2026-08-05T12:01:00.000Z')))
      .rejects.toMatchObject({ code: 'undo_unavailable' });
    expect(session).toEqual(before);
  });

  it('prunes unresolved revisit identities when Undo removes those entries', async () => {
    const root = await freshRoot();
    const now = new Date('2026-08-05T12:00:00.000Z');
    await importAgentSet(root, twoCardPatch(), { now });
    const session = startPlannedSession('recommended', 'review_due', await getDueCards(root, now), undefined, now);
    const entry = session.plan!.entries[0];
    await gradePlannedSession(root, session, {
      requestId: 'again-with-revisit', revision: 0, entryId: entry.id,
      setId: entry.setId, cardId: entry.cardId, rating: 1,
    }, now);
    const revisit = session.plan!.entries.find((item) => item.pass === 'revisit')!;
    session.plan!.unresolvedEntryIds = [revisit.id];
    session.summary.unresolved = 1;

    await undoPlannedGrade(root, session, undoRequest(session, 'undo-prune'), new Date('2026-08-05T12:01:00.000Z'));
    expect(session.plan!.entries.some((item) => item.id === revisit.id)).toBe(false);
    expect(session.plan!.unresolvedEntryIds).toEqual([]);
    expect(session.summary.unresolved).toBe(0);
  });

  it('undoes a planned scheduled grade with a fresh card version and tombstones its request', async () => {
    const root = await freshRoot();
    const now = new Date('2026-08-05T12:00:00.000Z');
    await importAgentSet(root, twoCardPatch(), { now });
    const cards = await getDueCards(root, now);
    const session = startPlannedSession('recommended', 'review_due', cards, undefined, now);
    const entry = session.plan!.entries[0];
    const before = structuredClone((await loadCard(root, entry.setId, entry.cardId))!);
    const request = {
      requestId: 'original', revision: 0, entryId: entry.id,
      setId: entry.setId, cardId: entry.cardId, rating: 3 as const,
    };
    await gradePlannedSession(root, session, request, now);

    const undo = undoRequest(session, 'undo-original');
    const undone = await undoPlannedGrade(root, session, undo, new Date('2026-08-05T12:01:00.000Z'));
    const restored = (await loadCard(root, entry.setId, entry.cardId))!;
    expect(undone).toMatchObject({ ok: true, revision: 2, currentEntryId: entry.id });
    expect(restored.fsrs).toEqual(before.fsrs);
    expect(restored.updatedAt).toBe('2026-08-05T12:01:00.000Z');
    expect(restored.updatedAt).not.toBe(before.updatedAt);
    expect(session.events).toEqual([]);
    expect(session.plan!.currentEntryId).toBe(entry.id);
    expect(session.plan!.gradeLedger.find((item) => item.requestId === 'original'))
      .toMatchObject({ error: { code: 'request_undone' } });
    await expect(gradePlannedSession(root, session, request, now))
      .rejects.toMatchObject({ code: 'request_undone' });
    await expect(gradePlannedSession(root, session, { ...request, rating: 4 }, now))
      .rejects.toMatchObject({ code: 'request_undone' });

    const corrected = await gradePlannedSession(root, session, {
      ...request, requestId: 'corrected', revision: 2, rating: 4,
    }, new Date('2026-08-05T12:02:00.000Z'));
    expect(corrected.resultClass).toBe('scheduled');
    expect(session.events).toHaveLength(1);
    expect((await loadCard(root, entry.setId, entry.cardId))!.fsrs.reps).toBe(1);

    await endSession(root, session, new Date('2026-08-05T12:03:00.000Z'));
    await expect(gradePlannedSession(root, session, { ...request, rating: 2 }, now))
      .rejects.toMatchObject({ code: 'request_undone' });
  });

  it.each(['after_intent', 'after_card'] as const)(
    'recovers one planned undo after a crash %s without leaving a live event',
    async (boundary) => {
      const root = await freshRoot();
      const now = new Date('2026-08-05T12:00:00.000Z');
      await importAgentSet(root, twoCardPatch(), { now });
      const cards = await getDueCards(root, now);
      const session = startPlannedSession('recommended', 'review_due', cards, undefined, now);
      const entry = session.plan!.entries[0];
      const request = {
        requestId: `undo-${boundary}`, revision: 0, entryId: entry.id,
        setId: entry.setId, cardId: entry.cardId, rating: 3 as const,
      };
      await gradePlannedSession(root, session, request, now);
      const crash = new Error(boundary);
      const undoNow = new Date('2026-08-05T12:01:00.000Z');
      const undo = undoRequest(session, `undo-request-${boundary}`);

      await expect(undoPlannedGrade(root, session, undo, undoNow, async () => {}, {
        afterIntent: () => { if (boundary === 'after_intent') throw crash; },
        afterCard: () => { if (boundary === 'after_card') throw crash; },
      })).rejects.toBe(crash);

      const stamp = session.startedAt.replace(/[:.]/g, '-');
      const path = join(libraryPaths(root).sessionDayDir(session.startedAt.slice(0, 10)), `session_${stamp}.json`);
      const interrupted = (await readJson<ReviewSession>(path))!;
      expect(interrupted.pendingTransition).toMatchObject({ kind: 'undo', requestId: undo.requestId });

      const recovered = await undoPlannedGrade(root, interrupted, undo, undoNow);
      expect(recovered).toMatchObject({ ok: true, revision: 2, currentEntryId: entry.id });
      expect(interrupted.pendingTransition).toBeUndefined();
      expect(interrupted.events).toEqual([]);
      expect(interrupted.plan!.gradeLedger.find((item) => item.requestId === request.requestId))
        .toMatchObject({ error: { code: 'request_undone' } });
      expect((await loadCard(root, entry.setId, entry.cardId))!.fsrs.reps).toBe(0);
    },
  );

  it('keeps a failed Undo intent write out of cached state', async () => {
    const root = await freshRoot();
    const now = new Date('2026-08-05T12:00:00.000Z');
    await importAgentSet(root, twoCardPatch(), { now });
    const session = startPlannedSession('recommended', 'review_due', await getDueCards(root, now), undefined, now);
    const entry = session.plan!.entries[0];
    await gradePlannedSession(root, session, {
      requestId: 'before-undo-write-failure', revision: 0, entryId: entry.id,
      setId: entry.setId, cardId: entry.cardId, rating: 3,
    }, now);
    const before = structuredClone(session);
    const dayDir = libraryPaths(root).sessionDayDir(session.startedAt.slice(0, 10));
    await rm(dayDir, { recursive: true });
    await writeFile(dayDir, 'blocks directory creation', 'utf8');
    await expect(undoPlannedGrade(root, session, undoRequest(session, 'undo-write-fails'),
      new Date('2026-08-05T12:01:00.000Z'))).rejects.toBeTruthy();
    expect(session).toEqual(before);
    expect((await loadCard(root, entry.setId, entry.cardId))!.fsrs.reps).toBe(1);
  });

  it('keeps failed unavailable traversal out of cached state', async () => {
    const root = await freshRoot();
    const now = new Date('2026-08-05T12:00:00.000Z');
    await importAgentSet(root, twoCardPatch(), { now });
    const session = startPlannedSession('recommended', 'review_due', await getDueCards(root, now), undefined, now);
    const entry = session.plan!.entries[0];
    await archiveCard(root, entry.setId, entry.cardId, new Date('2026-08-05T12:00:30.000Z'));
    const before = structuredClone(session);
    const dayDir = libraryPaths(root).sessionDayDir(session.startedAt.slice(0, 10));
    await mkdir(join(root, 'profile', 'sessions'), { recursive: true });
    await writeFile(dayDir, 'blocks directory creation', 'utf8');
    await expect(advanceUnavailableEntries(root, session)).rejects.toBeTruthy();
    expect(session).toEqual(before);
  });

  it('attributes a diverged prepared Undo to the Undo retry, not a fresh grade', async () => {
    const root = await freshRoot();
    const now = new Date('2026-08-05T12:00:00.000Z');
    await importAgentSet(root, twoCardPatch(), { now });
    const session = startPlannedSession('recommended', 'review_due', await getDueCards(root, now), undefined, now);
    const first = session.plan!.entries[0];
    await gradePlannedSession(root, session, {
      requestId: 'undo-diverged', revision: 0, entryId: first.id,
      setId: first.setId, cardId: first.cardId, rating: 3,
    }, now);
    const undo = undoRequest(session, 'undo-diverged-request');
    await expect(undoPlannedGrade(root, session, undo, new Date('2026-08-05T12:01:00.000Z'), async () => {}, {
      afterIntent: () => { throw new Error('crash before undo card write'); },
    })).rejects.toThrow('crash before undo card write');

    const changed = (await loadCard(root, first.setId, first.cardId))!;
    changed.front.prompt = 'independent edit after undo intent';
    changed.updatedAt = '2026-08-05T12:01:30.000Z';
    await saveCard(root, changed);
    const stamp = session.startedAt.replace(/[:.]/g, '-');
    const path = join(libraryPaths(root).sessionDayDir(session.startedAt.slice(0, 10)), `session_${stamp}.json`);
    const interrupted = (await readJson<ReviewSession>(path))!;

    await expect(undoPlannedGrade(root, interrupted, undo, new Date('2026-08-05T12:02:00.000Z')))
      .rejects.toMatchObject({ code: 'transition_diverged' });
    expect(interrupted.pendingTransition).toBeUndefined();
    expect(interrupted.plan!.undoLedger).toContainEqual(expect.objectContaining({
      requestId: undo.requestId, error: { code: 'transition_diverged' },
    }));
    const second = interrupted.plan!.entries.find((entry) => entry.id === interrupted.plan!.currentEntryId)!;
    await expect(gradePlannedSession(root, interrupted, {
      requestId: 'fresh-after-undo-divergence', revision: 1, entryId: second.id,
      setId: second.setId, cardId: second.cardId, rating: 3,
    }, new Date('2026-08-05T12:03:00.000Z'))).resolves.toMatchObject({ resultClass: 'scheduled' });
  });

  it('does not retarget an older event after a newer prepared grade diverges', async () => {
    const root = await freshRoot();
    const now = new Date('2026-08-05T12:00:00.000Z');
    await importAgentSet(root, twoCardPatch(), { now });
    const session = startPlannedSession('recommended', 'review_due', await getDueCards(root, now), undefined, now);
    const first = session.plan!.entries[0];
    await gradePlannedSession(root, session, {
      requestId: 'older-live-event', revision: 0, entryId: first.id,
      setId: first.setId, cardId: first.cardId, rating: 3,
    }, now);
    const second = session.plan!.entries.find((item) => item.id === session.plan!.currentEntryId)!;
    await expect(gradePlannedSession(root, session, {
      requestId: 'newer-diverged-grade', revision: 1, entryId: second.id,
      setId: second.setId, cardId: second.cardId, rating: 3,
    }, now, { afterIntent: () => { throw new Error('grade crash'); } })).rejects.toThrow('grade crash');
    const changed = (await loadCard(root, second.setId, second.cardId))!;
    changed.front.prompt = 'independent edit';
    changed.updatedAt = '2026-08-05T12:00:30.000Z';
    await saveCard(root, changed);

    const undo = undoRequest(session, 'undo-after-diverged-grade');
    await expect(undoPlannedGrade(root, session, undo, new Date('2026-08-05T12:01:00.000Z')))
      .rejects.toMatchObject({ code: 'transition_diverged' });
    await expect(undoPlannedGrade(root, session, undo, new Date('2026-08-05T12:02:00.000Z')))
      .rejects.toMatchObject({ code: 'transition_diverged' });
    expect(session.events).toHaveLength(1);
    expect(session.events[0].requestId).toBe('older-live-event');
  });

  it('undo restores the exact persisted card state and session counters', async () => {
    const root = await freshRoot();
    const now = new Date('2026-07-07T12:00:00.000Z');
    const res = await importAgentSet(root, twoCardPatch(), { now });
    const card = (await getDueCards(root, now))[0];
    const before = structuredClone(card);
    const session = startSession('recommended', undefined, now);

    await gradeCard(root, session, card, 3, now);
    expect(session.events).toHaveLength(1);
    await undoLastGrade(root, session);

    expect(await loadCard(root, res.setId!, card.id)).toEqual(before);
    expect(session.events).toEqual([]);
    expect(session.summary).toEqual({
      reviewedCount: 0, distinctCardCount: 0, again: 0, hard: 0, good: 0, easy: 0, unresolved: 0,
    });
  });

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

  it('refuses stale undo after another session advances the card', async () => {
    const root = await freshRoot();
    const now = new Date('2026-07-16T12:00:00Z');
    await importAgentSet(root, twoCardPatch(), { now });
    const card = (await getDueCards(root, now))[0];
    const first = startSession('recommended', undefined, now);
    const afterFirst = await gradeCard(root, first, card, 3, new Date('2026-07-16T12:01:00Z'));
    const second = startSession('recommended', undefined, new Date('2026-07-16T12:02:00Z'));
    await gradeCard(root, second, afterFirst, 2, new Date('2026-07-16T12:03:00Z'));
    await expect(undoLastGrade(root, first)).rejects.toThrow(/changed after this grade/);
    expect(first.events).toHaveLength(1);
  });

  it('rejects grading and undo after a session has ended', async () => {
    const root = await freshRoot();
    const now = new Date('2026-07-16T12:00:00Z');
    await importAgentSet(root, twoCardPatch(), { now });
    const card = (await getDueCards(root, now))[0];
    const session = startSession('recommended', undefined, now);
    await gradeCard(root, session, card, 3, now);
    await endSession(root, session, new Date('2026-07-16T12:02:00Z'));
    await expect(gradeCard(root, session, card, 3)).rejects.toThrow(/session already ended/);
    await expect(undoLastGrade(root, session)).rejects.toThrow(/session already ended/);
  });
});
