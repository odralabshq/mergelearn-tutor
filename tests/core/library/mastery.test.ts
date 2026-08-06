import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { importAgentSet } from '../../../src/core/library/importAgentSet.js';
import { loadCardsForSet, saveCard } from '../../../src/core/library/cardStore.js';
import { loadTags, saveTags } from '../../../src/core/library/tagStore.js';
import { gradeFsrs, retrievability } from '../../../src/core/library/fsrs.js';
import { loadMasteryReport, masteryPct } from '../../../src/core/library/mastery.js';
import type { AgentSetPatch } from '../../../src/core/library/types.js';

const T0 = new Date('2026-07-30T12:00:00Z');

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
  const result = await importAgentSet(root, patch, { now: T0 });
  if (!result.ok) throw new Error('mastery seed import failed');
  return root;
}

/** Index of the card carrying BOTH tags, so per-axis maths is unambiguous. */
async function bothTagsIndex(root: string): Promise<number> {
  const cards = await loadCardsForSet(root, 'ts-deck');
  return cards[0]!.tagIds.length === 2 ? 0 : 1;
}

/** Grade a card for real, through the same FSRS path the app uses. */
async function grade(root: string, index: number, now = T0): Promise<void> {
  const cards = await loadCardsForSet(root, 'ts-deck');
  const card = cards[index]!;
  await saveCard(root, { ...card, fsrs: gradeFsrs(card.fsrs, 3, now) });
}

/** Force Review state WITHOUT any review. Impossible in normal use, but it
 * isolates coverage from retention: coverage counts it, retention must not. */
async function forceReviewState(root: string, index: number): Promise<void> {
  const cards = await loadCardsForSet(root, 'ts-deck');
  const card = cards[index]!;
  await saveCard(root, { ...card, fsrs: { ...card.fsrs, state: 2 } });
}

describe('progress reporting (shared by the Manage tab and the CLI)', () => {
  it('reports nothing learned and nothing studied while every card is new', async () => {
    const report = await loadMasteryReport(await seed(), T0);
    expect(report.folders).toEqual([
      { path: 'ts/basics', cardCount: 2, coverage: 0, retention: 0, studied: 0 },
    ]);
    expect(report.tags.map((t) => [t.label, t.cardCount, t.coverage, t.studied]))
      .toEqual([['generics', 1, 0, 0], ['unions', 2, 0, 0]]);
  });

  it('counts coverage per axis once FSRS reaches Review', async () => {
    const root = await seed();
    await grade(root, await bothTagsIndex(root));

    const report = await loadMasteryReport(root, T0);
    expect(report.folders[0]!.coverage).toBe(50);   // 1 of 2 cards in the folder
    const byLabel = new Map(report.tags.map((t) => [t.label, t.coverage]));
    expect(byLabel.get('generics')).toBe(100);      // its only card is covered
    expect(byLabel.get('unions')).toBe(50);         // 1 of its 2 cards
  });

  it('reports full retention immediately after a review', async () => {
    const root = await seed();
    await grade(root, await bothTagsIndex(root));

    const generics = (await loadMasteryReport(root, T0)).tags.find((t) => t.label === 'generics')!;
    expect(generics.studied).toBe(1);
    // Recall probability is 1.0 at the moment of a successful review.
    expect(generics.retention).toBe(100);
  });

  it('separates the two measures: coverage holds while retention decays', async () => {
    const root = await seed();
    const index = await bothTagsIndex(root);
    await grade(root, index);

    const card = (await loadCardsForSet(root, 'ts-deck'))[index]!;
    const atDue = new Date(card.fsrs.due);

    const fresh = await loadMasteryReport(root, T0);
    const later = await loadMasteryReport(root, atDue);

    // THE POINT OF THE SPLIT: reaching Review state is permanent, but the memory
    // is not. One number could never express both.
    expect(later.folders[0]!.coverage).toBe(fresh.folders[0]!.coverage);
    expect(later.folders[0]!.retention).toBeLessThan(fresh.folders[0]!.retention);
    // At the scheduled due date FSRS targets ~90% recall.
    const generics = later.tags.find((t) => t.label === 'generics')!;
    expect(generics.retention).toBeGreaterThan(80);
    expect(generics.retention).toBeLessThan(96);
  });

  it('excludes unstudied cards from retention instead of scoring them 0', async () => {
    const root = await seed();
    // Only ONE of the two 'unions' cards is studied.
    await grade(root, await bothTagsIndex(root));

    const unions = (await loadMasteryReport(root, T0)).tags.find((t) => t.label === 'unions')!;
    expect(unions.cardCount).toBe(2);
    expect(unions.studied).toBe(1);
    // Averaging the unstudied card in at 0 would give 50 and make retention a
    // rescaled coverage number, which is the conflation this split removes.
    expect(unions.retention).toBe(100);
  });

  it('does not credit retention for a card that reached Review without a review', async () => {
    const root = await seed();
    await forceReviewState(root, await bothTagsIndex(root));

    const report = await loadMasteryReport(root, T0);
    expect(report.folders[0]!.coverage).toBe(50);  // counted as covered
    expect(report.folders[0]!.studied).toBe(0);    // but never actually reviewed
    expect(report.folders[0]!.retention).toBe(0);  // so no retention is claimed
  });

  it('reports per-card membership so callers can recount without re-reading', async () => {
    const report = await loadMasteryReport(await seed(), T0);
    expect(report.cards).toHaveLength(2);
    expect(report.cards.every((card) => card.folderPath === 'ts/basics')).toBe(true);
    expect(report.cards.map((card) => card.tagIds.length).sort()).toEqual([1, 2]);
  });

  it('omits declared-but-unused tags, which would read as a false knowledge gap', async () => {
    const root = await seed();
    await saveTags(root, [...(await loadTags(root)), { id: 'orphan', label: 'never-used', kind: 'topic' }]);

    const report = await loadMasteryReport(root, T0);
    expect(report.tags.map((tag) => tag.id)).not.toContain('orphan');
  });

  it('reports 0 rather than NaN for an empty domain', () => {
    expect(masteryPct(0, 0)).toBe(0);
    expect(masteryPct(1, 3)).toBe(33);
  });

  it('keeps retrievability finite and bounded, including for a new card', async () => {
    const root = await seed();
    const [fresh] = await loadCardsForSet(root, 'ts-deck');
    // A never-reviewed card has retrievability 0, which is exactly why callers
    // must gate on `studied` rather than averaging the raw number.
    expect(retrievability(fresh!.fsrs, T0)).toBe(0);
    const graded = gradeFsrs(fresh!.fsrs, 3, T0);
    const r = retrievability(graded, T0);
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThanOrEqual(1);
  });
});
