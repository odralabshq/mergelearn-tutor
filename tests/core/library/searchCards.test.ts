import { describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { importAgentSet } from '../../../src/core/library/importAgentSet.js';
import { archiveCard } from '../../../src/core/library/cardLifecycle.js';
import { loadCard, saveCard } from '../../../src/core/library/cardStore.js';
import { searchCards, searchCardsPage } from '../../../src/core/library/searchCards.js';
import { loadOrder } from '../../../src/core/library/setStore.js';
import type { AgentSetPatch } from '../../../src/core/library/types.js';

const patch: AgentSetPatch = {
  version: 1, set: { id: 'search', title: 'TypeScript Unions', folderPath: 'docs/types', tagIds: [] },
  tagPatch: { reuse: [], add: [{ localId: 't', label: 'taxonomy-types', kind: 'topic' }] }, order: ['a', 'b'],
  cards: [
    { localId: 'a', folderPath: 'cards/narrowing', tagRefs: ['t'], front: { prompt: 'Narrow a union' }, back: { shortAnswer: 'Use a guard', explanationMarkdown: 'Sentinel explanation prose.' } },
    { localId: 'b', tagRefs: ['t'], front: { prompt: 'Never type' }, back: { shortAnswer: 'Impossible value', explanationMarkdown: 'Never.' } },
  ],
};

describe('searchCards', () => {
  it('matches content and set titles while excluding archived cards by default', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mlt-search-'));
    await importAgentSet(root, patch, { now: new Date('2026-07-16T00:00:00Z') });
    const order = await loadOrder(root, 'search');
    await archiveCard(root, 'search', order!.cardIds[1]);
    expect((await searchCards(root, 'GUARD')).map((h) => h.prompt)).toEqual(['Narrow a union']);
    expect(await searchCards(root, 'typescript unions')).toHaveLength(1);
    expect(await searchCards(root, 'sentinel explanation')).toHaveLength(1);
    expect(await searchCards(root, 'taxonomy-types')).toHaveLength(1);
    expect(await searchCards(root, 'search')).toHaveLength(1);
    expect(await searchCards(root, order!.cardIds[0])).toHaveLength(1);
    expect(await searchCards(root, 'docs/types')).toHaveLength(1);
    expect(await searchCards(root, 'cards/narrowing')).toHaveLength(1);
    expect(await searchCards(root, 'never')).toEqual([]);
    expect(await searchCards(root, 'never', { includeArchived: true })).toHaveLength(1);
  });

  it('pages 101 deterministic matches without gaps and reports exact completeness', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mlt-search-page-'));
    const cards = Array.from({ length: 101 }, (_, index) => ({
      localId: `card-${String(index).padStart(3, '0')}`,
      tagRefs: [],
      front: { prompt: `Prompt ${String(100 - index).padStart(3, '0')}` },
      back: { shortAnswer: `Answer ${index}`, explanationMarkdown: `Explanation ${index}` },
    }));
    await importAgentSet(root, {
      version: 1,
      set: { id: 'paged', title: 'Paged set', tagIds: [] },
      tagPatch: { reuse: [], add: [] },
      order: cards.map((card) => card.localId),
      cards,
    }, { now: new Date('2026-07-17T00:00:00Z') });

    const first = await searchCardsPage(root, '', { offset: 0, limit: 100 });
    const second = await searchCardsPage(root, '', { offset: 100, limit: 100 });
    const beyond = await searchCardsPage(root, '', { offset: 999, limit: 100 });
    const unchanged = await searchCardsPage(root, '', { offset: 0, limit: 1 });

    expect(first).toMatchObject({ total: 101, returned: 100, hasMore: true, nextOffset: 100 });
    expect(second).toMatchObject({ total: 101, returned: 1, hasMore: false });
    expect(second.nextOffset).toBeUndefined();
    expect(beyond).toMatchObject({ cards: [], total: 101, returned: 0, hasMore: false });
    expect(beyond.nextOffset).toBeUndefined();
    expect(unchanged.snapshot).toBe(first.snapshot);
    expect([...first.cards, ...second.cards].map((card) => card.cardId)).toHaveLength(101);
    expect(new Set([...first.cards, ...second.cards].map((card) => card.cardId))).toHaveLength(101);
    expect([...first.cards, ...second.cards].map((card) => card.prompt)).toEqual(
      [...first.cards, ...second.cards].map((card) => card.prompt).sort(),
    );
    expect(await searchCards(root, '', { limit: 0 })).toHaveLength(101);
  });

  it('composes set, tag, stored state, archive, and text filters and snapshots persisted changes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mlt-search-filter-'));
    const alphaImport = await importAgentSet(root, {
      version: 1,
      set: { id: 'alpha', title: 'Alpha', tagIds: [] },
      tagPatch: { reuse: [], add: [{ localId: 'red', label: 'Red' }, { localId: 'blue', label: 'Blue' }] },
      order: ['one', 'two'],
      cards: [
        { localId: 'one', tagRefs: ['red'], front: { prompt: 'Same prompt' }, back: { shortAnswer: 'First answer', explanationMarkdown: 'Needle alpha' } },
        { localId: 'two', tagRefs: ['blue'], front: { prompt: 'Same prompt' }, back: { shortAnswer: 'Second answer', explanationMarkdown: 'Needle beta' } },
      ],
    }, { now: new Date('2026-07-18T00:00:00Z') });
    expect(alphaImport.ok).toBe(true);
    const betaImport = await importAgentSet(root, {
      version: 1,
      set: { id: 'beta', title: 'Beta', tagIds: [] },
      tagPatch: { reuse: ['tag_red', 'tag_blue'], add: [] }, order: ['one'],
      cards: [{ localId: 'one', tagRefs: ['tag_red'], front: { prompt: 'Same prompt' }, back: { shortAnswer: 'Third answer', explanationMarkdown: 'Needle beta' } }],
    }, { now: new Date('2026-07-18T00:01:00Z') });
    expect(betaImport.ok).toBe(true);

    const alpha = await searchCardsPage(root, '', { setIds: ['alpha'] });
    const first = await loadCard(root, 'alpha', alpha.cards[0]!.cardId);
    const second = await loadCard(root, 'alpha', alpha.cards[1]!.cardId);
    await saveCard(root, { ...first!, fsrs: { ...first!.fsrs, state: 2, reps: 1 }, updatedAt: '2026-07-18T01:00:00Z' });
    await saveCard(root, { ...second!, fsrs: { ...second!.fsrs, state: 9 as 0 }, updatedAt: '2026-07-18T01:01:00Z' });
    await archiveCard(root, 'alpha', second!.id, new Date('2026-07-18T02:00:00Z'));

    expect((await searchCardsPage(root, 'needle', { setIds: ['alpha'], tagIds: ['tag_red'], state: 2 })).cards)
      .toMatchObject([{ setId: 'alpha', state: 2, tagIds: ['tag_red'] }]);
    expect((await searchCardsPage(root, '', { tagIds: ['tag_red', 'tag_blue'] })).total).toBe(2);
    expect((await searchCardsPage(root, '', { state: 0 })).cards.map((card) => card.setId)).toEqual(['beta']);
    expect((await searchCardsPage(root, '', { includeArchived: true })).total).toBe(3);
    expect((await searchCardsPage(root, '', { includeArchived: true, state: 0 })).cards.map((card) => card.setId)).toEqual(['beta']);

    const before = await searchCardsPage(root, '', { includeArchived: true });
    const changed = await loadCard(root, 'beta', before.cards.find((card) => card.setId === 'beta')!.cardId);
    await saveCard(root, { ...changed!, fsrs: { ...changed!.fsrs, lapses: changed!.fsrs.lapses + 1 } });
    const after = await searchCardsPage(root, '', { includeArchived: true });
    expect(after.snapshot).not.toBe(before.snapshot);
    expect(after.cards.map((card) => `${card.setTitle}/${card.prompt}/${card.setId}/${card.cardId}`)).toEqual(
      [...after.cards].sort((a, b) => a.setTitle < b.setTitle ? -1 : a.setTitle > b.setTitle ? 1
        : a.prompt < b.prompt ? -1 : a.prompt > b.prompt ? 1
          : a.setId < b.setId ? -1 : a.setId > b.setId ? 1 : a.cardId < b.cardId ? -1 : 1)
        .map((card) => `${card.setTitle}/${card.prompt}/${card.setId}/${card.cardId}`),
    );
  });
});
