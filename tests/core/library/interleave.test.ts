import { describe, expect, it } from 'vitest';

import { orderDueQueue, spaceSiblingCards } from '../../../src/core/library/review/interleave.js';
import type { Card } from '../../../src/core/library/types.js';

function card(setId: string, id: string): Card {
  return { id, setId, tagIds: [], front: { prompt: id }, back: { shortAnswer: id, explanationMarkdown: id }, status: 'active', fsrs: { due: `2026-01-0${id.length}T00:00:00Z`, stability: 1, difficulty: 1, elapsedDays: 1, scheduledDays: 1, reps: 1, lapses: 0, learningSteps: 0, state: 2 }, createdBy: { importedAt: 'x' }, createdAt: 'x', updatedAt: 'x' };
}

function sibling(id: string, siblingGroupId: string): Card {
  return { ...card('a', id), siblingGroupId };
}

describe('spaceSiblingCards', () => {
  it('uses remaining group counts so A B B becomes B A B', () => {
    const cards = [sibling('a1', 'A'), sibling('b1', 'B'), sibling('b2', 'B')];
    expect(spaceSiblingCards(cards).map((item) => item.id)).toEqual(['b1', 'a1', 'b2']);
  });

  it('avoids adjacent siblings whenever the distribution makes that feasible', () => {
    const cards = [
      sibling('a1', 'A'), sibling('a2', 'A'), sibling('b1', 'B'),
      sibling('b2', 'B'), sibling('c1', 'C'),
    ];
    const output = spaceSiblingCards(cards);
    expect(output.every((item, index) => index === 0
      || item.siblingGroupId !== output[index - 1].siblingGroupId)).toBe(true);
    expect(output.filter((item) => item.siblingGroupId === 'A').map((item) => item.id)).toEqual(['a1', 'a2']);
  });

  it('degrades deterministically when adjacency is mathematically unavoidable', () => {
    const cards = [sibling('a1', 'A'), sibling('a2', 'A'), sibling('a3', 'A'), sibling('b1', 'B')];
    expect(spaceSiblingCards(cards).map((item) => item.id)).toEqual(['a1', 'b1', 'a2', 'a3']);
  });

  it('breaks ties by the earliest remaining original index', () => {
    const cards = [
      sibling('a1', 'A'), sibling('c1', 'C'), sibling('c2', 'C'),
      sibling('b1', 'B'), sibling('a2', 'A'),
    ];
    expect(spaceSiblingCards(cards).map((item) => item.id)).toEqual(['a1', 'c1', 'b1', 'c2', 'a2']);
  });

  it('uses normalized collision-safe set and group identity', () => {
    const cards = [
      { ...sibling('x1', 'c'), setId: 'a:b' },
      { ...sibling('x2', ' c '), setId: 'a:b' },
      { ...sibling('y1', 'b:c'), setId: 'a' },
      { ...sibling('y2', 'b:c'), setId: 'a' },
    ];
    expect(spaceSiblingCards(cards).map((item) => item.id)).toEqual(['x1', 'y1', 'x2', 'y2']);
  });

  it('treats the same group id in different sets as unrelated and ungrouped cards as singletons', () => {
    const a = sibling('a1', 'same');
    const otherSet = { ...sibling('b1', 'same'), setId: 'b' };
    const plain = card('a', 'plain');
    expect(spaceSiblingCards([a, otherSet, plain])).toEqual([a, otherSet, plain]);
  });
});

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
