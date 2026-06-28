import { describe, expect, it } from 'vitest';

import { buildPracticeQueue, sortPracticeQueue } from '../../src/core/practiceQueue.js';
import type { TutorState } from '../../src/core/types.js';

function baseState(overrides: Partial<TutorState> = {}): TutorState {
  return {
    version: 1,
    repoPath: '/repo',
    goals: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    artifacts: [],
    concepts: [],
    conceptStates: [],
    learningItems: [
      { id: 'item_a', conceptId: 'c1', type: 'explain_back', questionPlane: 'local_behavior', title: 'A', snippet: { path: 'a.ts', label: 'a', code: 'a' }, bodyMarkdown: '', prompt: 'A?', explanationMarkdown: 'A', expectedFocus: ['a'], difficulty: 'beginner', createdAt: '2026-01-02T00:00:00.000Z', status: 'active', batchId: 'batch_1', generation: 1, source: 'manual_generate' },
      { id: 'item_b', conceptId: 'c2', type: 'explain_back', questionPlane: 'local_behavior', title: 'B', snippet: { path: 'b.ts', label: 'b', code: 'b' }, bodyMarkdown: '', prompt: 'B?', explanationMarkdown: 'B', expectedFocus: ['b'], difficulty: 'beginner', createdAt: '2026-01-03T00:00:00.000Z', status: 'active', batchId: 'batch_1', generation: 1, source: 'manual_generate' },
      { id: 'item_c', conceptId: 'c3', type: 'explain_back', questionPlane: 'local_behavior', title: 'C', snippet: { path: 'c.ts', label: 'c', code: 'c' }, bodyMarkdown: '', prompt: 'C?', explanationMarkdown: 'C', expectedFocus: ['c'], difficulty: 'beginner', createdAt: '2026-01-04T00:00:00.000Z', status: 'active', batchId: 'batch_2', generation: 2, source: 'manual_generate' },
    ],
    cardBatches: [
      { id: 'batch_1', mode: 'more', requestedCount: 2, itemIds: ['item_a', 'item_b'], archivedItemIds: [], createdAt: '2026-01-02T00:00:00.000Z' },
      { id: 'batch_2', mode: 'more', requestedCount: 1, itemIds: ['item_c'], archivedItemIds: [], createdAt: '2026-01-04T00:00:00.000Z' },
    ],
    courses: [],
    questionBank: [],
    questionDraftBatches: [],
    learningEvents: [{ id: 'e1', itemId: 'item_a', conceptId: 'c1', eventType: 'answered', correct: true, createdAt: '2026-01-05T00:00:00.000Z' }],
    corrections: [],
    manualRatings: [],
    ...overrides,
  };
}

describe('practiceQueue', () => {
  it('sorts unreviewed items before globally reviewed ones, then by batch order', () => {
    const sorted = sortPracticeQueue(baseState());
    expect(sorted.map((item) => item.id)).toEqual(['item_b', 'item_c', 'item_a']);
  });

  it('builds queue with index and reviewedInSession', () => {
    const queue = buildPracticeQueue(baseState(), { index: 1, reviewedInSession: ['item_b'] });
    expect(queue.total).toBe(3);
    expect(queue.index).toBe(1);
    expect(queue.items[1]?.id).toBe('item_c');
    expect(queue.reviewedInSession).toEqual(['item_b']);
  });

  it('picks first unreviewed in session when index omitted', () => {
    const queue = buildPracticeQueue(baseState(), { reviewedInSession: ['item_b'] });
    expect(queue.items[queue.index]?.id).toBe('item_c');
  });
});
