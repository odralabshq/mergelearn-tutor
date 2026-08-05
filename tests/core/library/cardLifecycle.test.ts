import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { importAgentSet } from '../../../src/core/library/importAgentSet.js';
import { archiveCard, deleteCard, deleteSet, editCard, unarchiveCard } from '../../../src/core/library/cardLifecycle.js';
import { listCardIds, loadCard, saveCard } from '../../../src/core/library/cardStore.js';
import { endSession, gradeCard, startSession } from '../../../src/core/library/review/session.js';
import { loadTags } from '../../../src/core/library/tagStore.js';
import { getDueCards } from '../../../src/core/library/review/dueQueue.js';
import { listSetIds, loadOrder } from '../../../src/core/library/setStore.js';
import type { AgentSetPatch } from '../../../src/core/library/types.js';

const patch: AgentSetPatch = {
  version: 1, set: { id: 'curation', title: 'Curation', tagIds: [] },
  tagPatch: { reuse: [], add: [] }, order: ['a', 'b'],
  cards: [
    { localId: 'a', tagRefs: [], front: { prompt: 'A?' }, back: { shortAnswer: 'A', explanationMarkdown: 'A.' } },
    { localId: 'b', tagRefs: [], front: { prompt: 'B?' }, back: { shortAnswer: 'B', explanationMarkdown: 'B.' } },
  ],
};

async function root(): Promise<string> {
  const r = await mkdtemp(join(tmpdir(), 'mlt-curation-'));
  const result = await importAgentSet(r, patch, { now: new Date('2026-07-16T12:00:00Z') });
  if (!result.ok) throw new Error('seed failed');
  return r;
}

describe('card lifecycle', () => {
  it('archives reversibly without losing authored position', async () => {
    const r = await root();
    const [card] = await getDueCards(r, new Date('2026-07-16T12:00:00Z'));
    const orderBefore = await loadOrder(r, 'curation');
    const archived = await archiveCard(r, 'curation', card.id, new Date('2026-07-17T00:00:00Z'));
    expect(archived.status).toBe('archived');
    expect((await getDueCards(r, new Date('2026-07-17T00:00:00Z'))).map((c) => c.id)).not.toContain(card.id);
    expect(await loadOrder(r, 'curation')).toEqual(orderBefore);

    const restored = await unarchiveCard(r, 'curation', card.id, new Date('2026-07-18T00:00:00Z'));
    expect(restored.status).toBe('active');
    expect((await getDueCards(r, new Date('2026-07-18T00:00:00Z'))).map((c) => c.id)).toContain(card.id);
  });

  it('edits teaching content without changing the schedule and rejects protected fields', async () => {
    const r = await root();
    const [card] = await getDueCards(r, new Date('2026-07-16T12:00:00Z'));
    const fsrs = structuredClone(card.fsrs);
    const edited = await editCard(r, 'curation', card.id, {
      front: { prompt: 'Fixed prompt' }, back: { explanationMarkdown: 'Better explanation.' },
    }, new Date('2026-07-17T00:00:00Z'));
    expect(edited.front.prompt).toBe('Fixed prompt');
    expect(edited.back.explanationMarkdown).toBe('Better explanation.');
    expect(edited.fsrs).toEqual(fsrs);
    expect((await loadCard(r, 'curation', card.id))?.fsrs).toEqual(fsrs);
    await expect(editCard(r, 'curation', card.id, { fsrs } as never)).rejects.toThrow(/cannot edit fsrs/);
  });

  it('deletes the card and order entry but leaves shared tags untouched', async () => {
    const r = await root();
    const order = await loadOrder(r, 'curation');
    const deletedId = order!.cardIds[0];
    const tagsBefore = await loadTags(r);
    expect((await deleteCard(r, 'curation', deletedId)).deleted).toBe(true);
    expect(await listCardIds(r, 'curation')).not.toContain(deletedId);
    expect((await loadOrder(r, 'curation'))?.cardIds).toEqual(order!.cardIds.slice(1));
    expect(await loadTags(r)).toEqual(tagsBefore);
  });

  it('cannot resurrect a deleted card when ownership is lost before order cleanup', async () => {
    const r = await root();
    const order = await loadOrder(r, 'curation');
    const deletedId = order!.cardIds[0];
    let assertions = 0;
    await expect(deleteCard(r, 'curation', deletedId, {
      assertOwnership: async () => {
        assertions += 1;
        if (assertions === 2) throw new Error('writer lost');
      },
    })).rejects.toThrow('writer lost');
    expect(await loadCard(r, 'curation', deletedId)).toBeUndefined();
    expect((await loadOrder(r, 'curation'))?.cardIds).toContain(deletedId);
    expect(await listCardIds(r, 'curation')).not.toContain(deletedId);
  });

  it('refuses to delete a set with history unless force is explicit', async () => {
    const r = await root();
    const card = (await getDueCards(r, new Date('2026-07-16T12:00:00Z')))[0];
    const session = startSession('set', { setIds: ['curation'] }, new Date('2026-07-16T12:00:00Z'));
    await gradeCard(r, session, card, 3, new Date('2026-07-16T12:00:00Z'));
    await endSession(r, session, new Date('2026-07-16T12:01:00Z'));
    await expect(deleteSet(r, 'curation')).rejects.toThrow(/review history/);
    expect(await listSetIds(r)).toContain('curation');
    expect((await deleteSet(r, 'curation', { force: true })).deleted).toBe(true);
    expect(await listSetIds(r)).not.toContain('curation');
  });

  it('restores the status held before archive', async () => {
    const r = await root();
    const card = (await getDueCards(r, new Date('2026-07-16T12:00:00Z')))[0];
    await saveCard(r, { ...card, status: 'needs_review' });
    await archiveCard(r, 'curation', card.id);
    expect((await unarchiveCard(r, 'curation', card.id)).status).toBe('needs_review');
  });

  it('refuses stale and unsafe lifecycle mutations', async () => {
    const r = await root();
    const card = (await getDueCards(r, new Date('2026-07-16T12:00:00Z')))[0];
    await expect(archiveCard(r, 'curation', card.id, undefined, { expectedUpdatedAt: 'stale' })).rejects.toThrow(/refresh and retry/);
    await expect(deleteCard(r, '../escape', card.id)).rejects.toThrow(/set id/);
    expect(await loadCard(r, 'curation', card.id)).toBeDefined();
  });
});
