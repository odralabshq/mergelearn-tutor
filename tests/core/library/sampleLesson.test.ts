import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { installSampleLesson, SAMPLE_SET_ID } from '../../../src/core/library/sampleLesson.js';
import { loadCardsForSet } from '../../../src/core/library/cardStore.js';
import { listSetIds, loadSet } from '../../../src/core/library/setStore.js';
import { loadTags } from '../../../src/core/library/tagStore.js';

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
});
