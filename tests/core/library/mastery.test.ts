import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { importAgentSet } from '../../../src/core/library/importAgentSet.js';
import { loadCardsForSet, saveCard } from '../../../src/core/library/cardStore.js';
import { loadTags, saveTags } from '../../../src/core/library/tagStore.js';
import { loadMasteryReport, masteryPct } from '../../../src/core/library/mastery.js';
import type { AgentSetPatch } from '../../../src/core/library/types.js';

/** Two cards in one folder: one tagged unions+generics, one tagged unions only. */
async function seed(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'mlt-mastery-'));
  const patch: AgentSetPatch = {
    version: 1,
    set: { id: 'ts-deck', title: 'TS Deck', folderPath: 'ts/basics', tagIds: [] },
    tagPatch: {
      reuse: [],
      add: [
        { localId: 'u', label: 'unions', kind: 'topic' },
        { localId: 'g', label: 'generics', kind: 'topic' },
      ],
    },
    order: ['c1', 'c2'],
    cards: [
      {
        localId: 'c1', tagRefs: ['u', 'g'],
        front: { prompt: 'What is a union type?' },
        back: { shortAnswer: 'One of several types.', explanationMarkdown: 'A | B.' },
      },
      {
        localId: 'c2', tagRefs: ['u'],
        front: { prompt: 'How do you narrow a union?' },
        back: { shortAnswer: 'A type guard.', explanationMarkdown: 'typeof / in / predicate.' },
      },
    ],
  };
  const result = await importAgentSet(root, patch, { now: new Date('2026-07-30T12:00:00Z') });
  if (!result.ok) throw new Error('mastery seed import failed');
  return root;
}

/** Promote one card into FSRS Review, the boundary mastery counts from. */
async function promoteToReview(root: string, cardIndex: number): Promise<void> {
  const cards = await loadCardsForSet(root, 'ts-deck');
  const card = cards[cardIndex]!;
  await saveCard(root, { ...card, fsrs: { ...card.fsrs, state: 2 } });
}

describe('mastery (shared by the Manage tab and the CLI)', () => {
  it('reports zero mastery while every card is still new', async () => {
    const report = await loadMasteryReport(await seed());
    expect(report.folders).toEqual([{ path: 'ts/basics', cardCount: 2, mastery: 0 }]);
    expect(report.tags.map((tag) => [tag.label, tag.cardCount, tag.mastery]))
      .toEqual([['generics', 1, 0], ['unions', 2, 0]]);
  });

  it('counts a card as mastered once FSRS moves it to Review, per axis', async () => {
    const root = await seed();
    // Promote the card carrying both tags: unions 1/2, generics 1/1.
    const [first] = await loadCardsForSet(root, 'ts-deck');
    const promoted = first!.tagIds.length === 2 ? 0 : 1;
    await promoteToReview(root, promoted);

    const report = await loadMasteryReport(root);
    expect(report.folders).toEqual([{ path: 'ts/basics', cardCount: 2, mastery: 50 }]);
    const byLabel = new Map(report.tags.map((tag) => [tag.label, tag.mastery]));
    expect(byLabel.get('generics')).toBe(100);
    expect(byLabel.get('unions')).toBe(50);
  });

  it('reports per-card membership so callers can recount without re-reading', async () => {
    const report = await loadMasteryReport(await seed());
    expect(report.cards).toHaveLength(2);
    expect(report.cards.every((card) => card.folderPath === 'ts/basics')).toBe(true);
    expect(report.cards.map((card) => card.tagIds.length).sort()).toEqual([1, 2]);
  });

  it('omits declared-but-unused tags, which would read as a false knowledge gap', async () => {
    const root = await seed();
    const tags = await loadTags(root);
    await saveTags(root, [...tags, { id: 'orphan', label: 'never-used', kind: 'topic' }]);

    const report = await loadMasteryReport(root);
    expect(report.tags.map((tag) => tag.id)).not.toContain('orphan');
  });

  it('reports 0 rather than NaN for an empty domain', () => {
    expect(masteryPct(0, 0)).toBe(0);
    expect(masteryPct(1, 3)).toBe(33);
  });
});
