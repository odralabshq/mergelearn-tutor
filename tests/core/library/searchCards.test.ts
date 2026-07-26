import { describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { importAgentSet } from '../../../src/core/library/importAgentSet.js';
import { archiveCard } from '../../../src/core/library/cardLifecycle.js';
import { searchCards } from '../../../src/core/library/searchCards.js';
import { loadOrder } from '../../../src/core/library/setStore.js';
import type { AgentSetPatch } from '../../../src/core/library/types.js';

const patch: AgentSetPatch = {
  version: 1, set: { id: 'search', title: 'TypeScript Unions', tagIds: [] },
  tagPatch: { reuse: [], add: [{ localId: 't', label: 'types', kind: 'topic' }] }, order: ['a', 'b'],
  cards: [
    { localId: 'a', tagRefs: ['t'], front: { prompt: 'Narrow a union' }, back: { shortAnswer: 'Use a guard', explanationMarkdown: 'Guard it.' } },
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
    expect(await searchCards(root, 'never')).toEqual([]);
    expect(await searchCards(root, 'never', { includeArchived: true })).toHaveLength(1);
  });
});
