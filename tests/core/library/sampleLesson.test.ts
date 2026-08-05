import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { installSampleLesson, SAMPLE_SET_ID } from '../../../src/core/library/sampleLesson.js';
import { loadCardsForSet } from '../../../src/core/library/cardStore.js';
import { listSetIds, loadOrder, loadSet } from '../../../src/core/library/setStore.js';
import { loadTags } from '../../../src/core/library/tagStore.js';
import { libraryPaths } from '../../../src/core/library/libraryStore.js';
import { deleteCard, editCard } from '../../../src/core/library/cardLifecycle.js';

async function root(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'mlt-sample-test-'));
}

describe('sample lesson', () => {
  it('dry-run validates and previews without writing', async () => {
    const r = await root();
    const result = await installSampleLesson(r, { dryRun: true });
    expect(result).toMatchObject({ ok: true, status: 'installed', setId: SAMPLE_SET_ID, cardCount: 4 });
    expect(await listSetIds(r)).toEqual([]);
    expect(await loadTags(r)).toEqual([]);
  });

  it('installs once through the normal import path and is idempotent', async () => {
    const r = await root();
    const first = await installSampleLesson(r, { now: new Date('2026-07-15T12:00:00Z') });
    expect(first).toMatchObject({ ok: true, status: 'installed', setId: SAMPLE_SET_ID, cardCount: 4 });
    expect((await loadSet(r, SAMPLE_SET_ID))?.title).toBe('Sample: Safe async data loading');

    const cards = await loadCardsForSet(r, SAMPLE_SET_ID);
    expect(cards).toHaveLength(4);
    expect(cards.map((c) => c.interaction?.type).sort()).toEqual(['choice', 'flashcard', 'parsons', 'self_response']);

    const second = await installSampleLesson(r, { now: new Date('2026-07-16T12:00:00Z') });
    expect(second.status).toBe('current');
    expect(await loadCardsForSet(r, SAMPLE_SET_ID)).toHaveLength(4);
    expect(await listSetIds(r)).toEqual([SAMPLE_SET_ID]);
  });

  it('does not repair or overwrite a complete sample that the learner changed', async () => {
    const r = await root();
    await installSampleLesson(r, { now: new Date('2026-07-15T12:00:00Z') });
    const cards = await loadCardsForSet(r, SAMPLE_SET_ID);
    const edited = await editCard(r, SAMPLE_SET_ID, cards[0]!.id, {
      back: { explanationMarkdown: 'Learner-owned sample edit.' },
    });
    await deleteCard(r, SAMPLE_SET_ID, cards[1]!.id);

    const rerun = await installSampleLesson(r, { now: new Date('2026-07-16T12:00:00Z') });
    expect(rerun.status).toBe('current');
    const after = await loadCardsForSet(r, SAMPLE_SET_ID);
    expect(after).toHaveLength(3);
    expect(after.find((card) => card.id === edited.id)?.back.explanationMarkdown)
      .toBe('Learner-owned sample edit.');
    expect(after.some((card) => card.id === cards[1]!.id)).toBe(false);
  });

  it('revalidates ownership before every sample import write', async () => {
    const r = await root();
    let assertions = 0;
    await expect(installSampleLesson(r, {
      assertOwnership: async () => {
        assertions += 1;
        if (assertions === 3) throw new Error('writer lost');
      },
    })).rejects.toThrow('writer lost');

    expect(assertions).toBe(3);
    expect(await loadSet(r, SAMPLE_SET_ID)).toBeDefined();
    expect(await loadCardsForSet(r, SAMPLE_SET_ID)).toEqual([]);
    expect(await loadOrder(r, SAMPLE_SET_ID)).toBeUndefined();
    await expect(readFile(join(libraryPaths(r).setDir(SAMPLE_SET_ID), 'imports.json'))).rejects.toThrow();

    const repaired = await installSampleLesson(r, { now: new Date('2026-07-16T12:00:00Z') });
    expect(repaired).toMatchObject({ ok: true, status: 'installed', cardCount: 4 });
    expect(await loadCardsForSet(r, SAMPLE_SET_ID)).toHaveLength(4);
    expect((await loadOrder(r, SAMPLE_SET_ID))?.cardIds).toHaveLength(4);
  });
});
