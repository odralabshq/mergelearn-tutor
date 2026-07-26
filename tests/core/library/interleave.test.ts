import { describe, expect, it } from 'vitest';

import { orderDueQueue } from '../../../src/core/library/review/interleave.js';
import type { Card } from '../../../src/core/library/types.js';

function card(setId: string, id: string): Card {
  return { id, setId, tagIds: [], front: { prompt: id }, back: { shortAnswer: id, explanationMarkdown: id }, status: 'active', fsrs: { due: `2026-01-0${id.length}T00:00:00Z`, stability: 1, difficulty: 1, elapsedDays: 1, scheduledDays: 1, reps: 1, lapses: 0, learningSteps: 0, state: 2 }, createdBy: { importedAt: 'x' }, createdAt: 'x', updatedAt: 'x' };
}

describe('orderDueQueue', () => {
  it('is a no-op for one set', () => {
    const cards = [card('a', '1'), card('a', '2'), card('a', '3')];
    expect(orderDueQueue(cards, { seed: 's' })).toEqual(cards);
  });

  it('mixes sets without losing or duplicating cards', () => {
    const cards = [card('a', '1'), card('a', '2'), card('a', '3'), card('b', '1'), card('b', '2'), card('b', '3')];
    const out = orderDueQueue(cards, { seed: 'same' });
    expect(out.map((c) => `${c.setId}/${c.id}`).sort()).toEqual(cards.map((c) => `${c.setId}/${c.id}`).sort());
    expect(out.every((c, i) => i === 0 || c.setId !== out[i - 1].setId)).toBe(true);
    expect(orderDueQueue(cards, { seed: 'same' })).toEqual(out);
  });

  it('supports the overdue opt-out', () => {
    const cards = [card('a', '1'), card('a', '2'), card('b', '1')];
    expect(orderDueQueue(cards, { strategy: 'overdue' })).toEqual(cards);
  });
});
