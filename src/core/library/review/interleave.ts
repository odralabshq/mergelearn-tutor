import type { Card } from '../types.js';
import type { QueueStrategy } from '../userPreferences.js';
import { compareDueCards } from './dueQueue.js';

export type InterleaveOptions = { strategy?: QueueStrategy; seed?: string };

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Deterministic weighted round-robin across sets. Input order remains the
 * within-set debt priority; one-set queues are returned unchanged. */
export function orderDueQueue(cards: readonly Card[], opts: InterleaveOptions = {}): Card[] {
  if ((opts.strategy ?? 'interleaved') === 'overdue') return cards.slice().sort(compareDueCards);
  const groups = new Map<string, Card[]>();
  for (const card of cards) {
    const group = groups.get(card.setId) ?? [];
    group.push(card);
    groups.set(card.setId, group);
  }
  if (groups.size < 2) return cards.slice();

  const initial = new Map([...groups].map(([key, value]) => [key, value.length]));
  const output: Card[] = [];
  let previous: string | undefined;
  while (output.length < cards.length) {
    let candidates = [...groups].filter(([, group]) => group.length > 0);
    const alternatives = candidates.filter(([key]) => key !== previous);
    if (alternatives.length) candidates = alternatives;
    candidates.sort(([a, ga], [b, gb]) => {
      const ratio = gb.length / initial.get(b)! - ga.length / initial.get(a)!;
      return ratio || hash(`${opts.seed ?? 'mergelearn'}:${a}`) - hash(`${opts.seed ?? 'mergelearn'}:${b}`);
    });
    const [key, group] = candidates[0]!;
    output.push(group.shift()!);
    previous = key;
  }
  return output;
}
