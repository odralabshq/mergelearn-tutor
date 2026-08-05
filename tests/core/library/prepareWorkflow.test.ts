import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadCardsForSet, saveCard } from '../../../src/core/library/cardStore.js';
import { importAgentSet } from '../../../src/core/library/importAgentSet.js';
import { writeJson } from '../../../src/core/library/io.js';
import { libraryPaths } from '../../../src/core/library/libraryStore.js';
import { loadPrepareWorkflow } from '../../../src/core/library/prepareWorkflow.js';
import { loadSet, saveSet } from '../../../src/core/library/setStore.js';
import type { AgentSetPatch, ReviewEvent, ReviewSession } from '../../../src/core/library/types.js';

async function seed(): Promise<{ root: string; weakId: string; watchId: string }> {
  const root = await mkdtemp(join(tmpdir(), 'mlt-prepare-'));
  const patch: AgentSetPatch = {
    version: 1,
    set: {
      id: 'prepare-set', title: 'Prepare set', tagIds: [],
      problemRefs: [{ sourceName: 'List', sourceId: 'set-ref', canonicalUrl: 'https://example.org/set' }],
    },
    tagPatch: { reuse: [], add: [{ localId: 'arrays', label: 'arrays', kind: 'topic' }] },
    order: ['weak', 'watch'],
    cards: [
      {
        localId: 'weak', tagRefs: ['arrays'],
        problemRefs: [{ sourceName: 'List', sourceId: 'card-ref', canonicalUrl: 'https://example.org/card' }],
        front: { prompt: 'Why use a complement map?' },
        back: { shortAnswer: 'One pass lookup.', explanationMarkdown: 'Store prior values.' },
      },
      {
        localId: 'watch', tagRefs: ['arrays'], front: { prompt: 'What is a near miss?' },
        back: { shortAnswer: 'A similar case.', explanationMarkdown: 'Compare constraints.' },
      },
    ],
  };
  const result = await importAgentSet(root, patch, { now: new Date('2026-08-05T12:00:00Z') });
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  const [weakId, watchId] = result.cards.map((card) => card.cardId);
  const events: ReviewEvent[] = [1, 1, 3].map((rating, index) => ({
    cardId: weakId!, setId: 'prepare-set', rating: rating as 1 | 3,
    reviewedAt: `2026-08-0${index + 1}T10:00:00.000Z`, resultClass: 'evidence',
  }));
  events.push({ cardId: watchId!, setId: 'prepare-set', rating: 1,
    reviewedAt: '2026-08-04T10:00:00.000Z', resultClass: 'evidence' });
  const session: ReviewSession = {
    id: 'prepare-evidence', startedAt: '2026-08-01T10:00:00.000Z', mode: 'recommended', events,
    summary: { reviewedCount: 4, distinctCardCount: 2, again: 3, hard: 0, good: 1, easy: 0 },
  };
  await writeJson(join(libraryPaths(root).sessionDayDir('2026-08-01'), 'session_prepare.json'), session);
  return { root, weakId: weakId!, watchId: watchId! };
}

describe('loadPrepareWorkflow', () => {
  it('projects only factual weak-card and external-reference lanes', async () => {
    const { root, weakId, watchId } = await seed();
    const result = await loadPrepareWorkflow(root, {}, new Date('2026-08-05T12:00:00Z'));

    expect(result.strengthen).toEqual([expect.objectContaining({
      setId: 'prepare-set', cardId: weakId, attempts: 3, failures: 2,
      reason: '2 of 3 recent attempts were retrieval failures',
    })]);
    expect(result.strengthen.some((row) => row.cardId === watchId)).toBe(false);
    const setRefCardIds = [weakId, watchId].sort();
    expect(result.external.map((row) => [row.cardId, row.sourceName, row.sourceId])).toEqual([
      [weakId, 'List', 'card-ref'],
      [setRefCardIds[0], 'List', 'set-ref'],
      [setRefCardIds[1], 'List', 'set-ref'],
    ]);
    expect(result.external.every((row) => row.reason === 'Problem reference supplied by List')).toBe(true);
  });

  it('uses transparent ordering and repeated filter algebra without source leakage', async () => {
    const { root, weakId, watchId } = await seed();
    const set = (await loadSet(root, 'prepare-set'))!;
    await saveSet(root, { ...set, problemRefs: [{
      sourceName: 'List', sourceId: 'newer-set', canonicalUrl: 'https://example.org/newer',
      attributions: [{ kind: 'list', label: 'New list', observedOn: '2026-08-04' }],
    }] });
    const cards = await loadCardsForSet(root, 'prepare-set');
    const weak = cards.find((card) => card.id === weakId)!;
    const watch = cards.find((card) => card.id === watchId)!;
    await saveCard(root, { ...weak, fsrs: { ...weak.fsrs, lapses: 1 }, problemRefs: [
      { sourceName: 'List', sourceId: 'older-card', canonicalUrl: 'https://example.org/older',
        attributions: [
          { kind: 'list', label: 'Older list', observedOn: '2026-08-01' },
          { kind: 'list', label: 'Old list', observedOn: '2026-08-02' },
          { kind: 'list', label: 'Malformed', observedOn: 'tomorrow' },
        ] },
      { sourceName: 'Alpha', sourceId: 'undated', canonicalUrl: 'https://example.org/undated',
        attributions: [{ kind: 'list', label: 'Malformed', observedOn: 'tomorrow' }] },
    ] });
    await saveCard(root, { ...watch, fsrs: { ...watch.fsrs, lapses: 9 } });
    const extraEvents: ReviewEvent[] = [1, 1, 3].map((rating, index) => ({
      cardId: watchId, setId: 'prepare-set', rating: rating as 1 | 3,
      reviewedAt: `2026-08-1${index + 1}T10:00:00.000Z`, resultClass: 'evidence',
    }));
    const session: ReviewSession = {
      id: 'prepare-more-evidence', startedAt: '2026-08-11T10:00:00.000Z',
      mode: 'recommended', events: extraEvents,
      summary: { reviewedCount: 3, distinctCardCount: 1, again: 2, hard: 0, good: 1, easy: 0 },
    };
    await writeJson(join(libraryPaths(root).sessionDayDir('2026-08-11'), 'session_more.json'), session);

    const baseline = await loadPrepareWorkflow(root, {}, new Date('2026-08-15T12:00:00Z'));
    expect(baseline.strengthen.map((row) => row.cardId)).toEqual([watchId, weakId]);
    expect(baseline.external.map((row) => [row.attributionDate, row.sourceName, row.sourceId])).toEqual([
      ['2026-08-04', 'List', 'newer-set'],
      ['2026-08-04', 'List', 'newer-set'],
      ['2026-08-02', 'List', 'older-card'],
      [undefined, 'Alpha', 'undated'],
    ]);

    const tagId = baseline.strengthen[0]!.tagIds[0]!;
    const sourceOnly = await loadPrepareWorkflow(root, { source: ['Missing', 'List'] }, new Date('2026-08-15T12:00:00Z'));
    expect(sourceOnly.strengthen).toEqual(baseline.strengthen);
    expect(sourceOnly.external).toHaveLength(3);
    expect(sourceOnly.sourceFilterIgnoredForStrengthen).toBe(true);
    expect(sourceOnly.externalBeforeFilters).toBe(4);

    const noSource = await loadPrepareWorkflow(root, { source: ['Missing'] }, new Date('2026-08-15T12:00:00Z'));
    expect(noSource.strengthen).toEqual(baseline.strengthen);
    expect(noSource.external).toEqual([]);
    expect(noSource.externalBeforeFilters).toBe(4);

    const matchingAnd = await loadPrepareWorkflow(root, {
      set: ['missing', 'prepare-set'], tag: ['missing', tagId], source: ['List'],
    }, new Date('2026-08-15T12:00:00Z'));
    expect(matchingAnd.strengthen).toEqual(baseline.strengthen);
    expect(matchingAnd.external).toHaveLength(3);

    const unknownTag = await loadPrepareWorkflow(root, { tag: ['missing'] }, new Date('2026-08-15T12:00:00Z'));
    expect(unknownTag.strengthen).toEqual([]);
    expect(unknownTag.external).toEqual([]);
    expect(unknownTag.externalBeforeFilters).toBe(4);
  });
});
