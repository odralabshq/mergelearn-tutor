import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { importAgentSet } from '../../../src/core/library/importAgentSet.js';
import { libraryPaths } from '../../../src/core/library/libraryStore.js';
import { readJson, writeJson } from '../../../src/core/library/io.js';
import type { AgentSetPatch, Card } from '../../../src/core/library/types.js';

const freshRoot = () => mkdtemp(join(tmpdir(), 'ml-reimport-'));

/** Untagged single-card lesson: keeps the tag graph out of this test. */
function lesson(overrides: { prompt?: string; answer?: string; title?: string } = {}): AgentSetPatch {
  return {
    version: 1,
    set: {
      id: 'reimport-fixture',
      title: overrides.title ?? 'Reimport fixture',
      folderPath: 'qa/reimport',
      tagIds: [],
      objective: 'Verify learner state survives an agent refresh',
    },
    tagPatch: { reuse: [], add: [] },
    order: ['c1'],
    cards: [{
      localId: 'c1',
      tagRefs: [],
      front: { prompt: overrides.prompt ?? 'Why does this behave this way?' },
      back: {
        shortAnswer: overrides.answer ?? 'Because of the documented mechanism.',
        explanationMarkdown: 'The direct cause is X.',
      },
    }],
  } as AgentSetPatch;
}

const cardPath = (root: string, cardId: string) => libraryPaths(root).cardFile('reimport-fixture', cardId);

/** Simulate a matured card by writing FSRS state directly. Deterministic, and
 * it tests the preservation invariant rather than the grader. */
async function mature(root: string, cardId: string): Promise<Card> {
  const card = (await readJson<Card>(cardPath(root, cardId)))!;
  const matured: Card = {
    ...card,
    fsrs: {
      ...card.fsrs,
      state: 2,
      reps: 4,
      lapses: 1,
      stability: 8.2956,
      difficulty: 5.12,
      scheduledDays: 8,
      due: '2026-08-08T20:00:00.000Z',
      lastReviewAt: '2026-07-31T20:00:00.000Z',
    } as Card['fsrs'],
  };
  await writeJson(cardPath(root, cardId), matured);
  return matured;
}

describe('re-importing a lesson preserves learner-owned state', () => {
  it('keeps the exact FSRS schedule when the lesson is re-applied unchanged', async () => {
    const root = await freshRoot();
    const first = await importAgentSet(root, lesson());
    expect(first.ok).toBe(true);
    const cardId = first.cards[0].cardId;
    const before = await mature(root, cardId);

    const second = await importAgentSet(root, lesson());
    expect(second.ok).toBe(true);

    const after = (await readJson<Card>(cardPath(root, cardId)))!;
    expect(after.fsrs).toEqual(before.fsrs);
    expect(after.fsrs.reps).toBe(4);
    expect(after.fsrs.state).toBe(2);
    expect(after.fsrs.stability).toBeCloseTo(8.2956, 4);
    expect(after.fsrs.due).toBe('2026-08-08T20:00:00.000Z');
  });

  it('replaces agent-authored teaching text while keeping the schedule', async () => {
    const root = await freshRoot();
    const first = await importAgentSet(root, lesson({ prompt: 'Original question?' }));
    const cardId = first.cards[0].cardId;
    const before = await mature(root, cardId);

    await importAgentSet(root, lesson({
      prompt: 'Corrected question, same card?',
      answer: 'A corrected answer.',
    }));

    const after = (await readJson<Card>(cardPath(root, cardId)))!;
    // Authored content updated: refreshing a lesson is the point of re-import.
    expect(after.front.prompt).toBe('Corrected question, same card?');
    expect(after.back.shortAnswer).toBe('A corrected answer.');
    // Learner state untouched.
    expect(after.fsrs).toEqual(before.fsrs);
  });

  it('preserves createdAt and createdBy, and still advances updatedAt', async () => {
    const root = await freshRoot();
    const first = await importAgentSet(root, lesson());
    const cardId = first.cards[0].cardId;
    const original = (await readJson<Card>(cardPath(root, cardId)))!;

    await importAgentSet(root, lesson({ prompt: 'Edited?' }), { agentName: 'second-agent' });

    const after = (await readJson<Card>(cardPath(root, cardId)))!;
    expect(after.createdAt).toBe(original.createdAt);
    expect(after.createdBy).toEqual(original.createdBy);
    expect(after.updatedAt >= original.updatedAt).toBe(true);
  });

  it('does not resurrect a card the learner archived', async () => {
    const root = await freshRoot();
    const first = await importAgentSet(root, lesson());
    const cardId = first.cards[0].cardId;
    const card = (await readJson<Card>(cardPath(root, cardId)))!;
    await writeJson(cardPath(root, cardId), { ...card, status: 'archived' });

    const second = await importAgentSet(root, lesson({ prompt: 'Refreshed?' }));

    const after = (await readJson<Card>(cardPath(root, cardId)))!;
    expect(after.status).toBe('archived');
    // The summary must report what is really on disk, not the naive status.
    expect(second.cards[0].status).toBe('archived');
    expect(second.cards[0].reasons).toContain('kept:archived');
    // Authored text still refreshed even while archived.
    expect(after.front.prompt).toBe('Refreshed?');
  });

  it('gives a genuinely new card fresh state (no false preservation)', async () => {
    const root = await freshRoot();
    await importAgentSet(root, lesson());
    const res = await importAgentSet(root, lesson());
    const cardId = res.cards[0].cardId;
    const card = (await readJson<Card>(cardPath(root, cardId)))!;
    // Never graded, so state stays at the fresh default.
    expect(card.fsrs.reps).toBe(0);
    expect(card.fsrs.state).toBe(0);
  });
});
