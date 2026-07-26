import { describe, expect, it } from 'vitest';

import { selectDueCards } from '../../../src/core/library/review/dueQueue.js';
import type { Card } from '../../../src/core/library/types.js';

function card(id: string, state: 0 | 1 | 2 | 3): Card {
  return { id, setId: 's', tagIds: [], front: { prompt: id }, back: { shortAnswer: id, explanationMarkdown: id }, status: 'active', fsrs: { due: '2026-01-01T00:00:00Z', stability: 1, difficulty: 1, elapsedDays: 1, scheduledDays: 1, reps: 1, lapses: 0, learningSteps: 0, state }, createdBy: { importedAt: 'x' }, createdAt: 'x', updatedAt: 'x' };
}

describe('selectDueCards', () => {
  it('caps a backlog while reserving one quarter for new or learning cards', () => {
    const review = Array.from({ length: 100 }, (_, i) => card(`r${i}`, 2));
    const fresh = Array.from({ length: 10 }, (_, i) => card(`n${i}`, 0));
    const selected = selectDueCards([...review, ...fresh], 20);
    expect(selected).toHaveLength(20);
    expect(selected.filter((c) => c.fsrs.state <= 1)).toHaveLength(5);
  });

  it('treats zero as uncapped', () => {
    const cards = [card('a', 2), card('b', 0)];
    expect(selectDueCards(cards, 0)).toEqual(cards);
  });
});
