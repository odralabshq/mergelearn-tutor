import { describe, expect, it } from 'vitest';

import { buildGraph } from '../../src/core/graph.js';
import {
  deriveReadiness, deriveAllReadiness, DEFAULT_THRESHOLDS, type MasteryLookup,
} from '../../src/core/conceptState.js';

// b depends on a; c depends on b.
const graph = buildGraph([
  { id: 'a' },
  { id: 'b', prerequisiteIds: ['a'] },
  { id: 'c', prerequisiteIds: ['b'] },
]);

function mastery(map: Record<string, number>): MasteryLookup {
  return (id) => map[id] ?? 0;
}

describe('deriveReadiness', () => {
  it('mastered wins first, regardless of prereqs', () => {
    const r = deriveReadiness('c', graph, mastery({ c: 0.9 }));
    expect(r.state).toBe('mastered');
  });

  it('ready when all prerequisites are above the bar', () => {
    const r = deriveReadiness('b', graph, mastery({ a: 0.7 }));
    expect(r.state).toBe('ready');
    expect(r.weakPrereqs).toEqual([]);
  });

  it('blocked when a prerequisite is weak, and lists it', () => {
    const r = deriveReadiness('b', graph, mastery({ a: 0.2 }));
    expect(r.state).toBe('blocked');
    expect(r.weakPrereqs).toEqual(['a']);
  });

  it('a concept with no prerequisites is always ready (until mastered)', () => {
    expect(deriveReadiness('a', graph, mastery({})).state).toBe('ready');
  });

  it('respects custom thresholds', () => {
    const r = deriveReadiness('b', graph, mastery({ a: 0.5 }), { mastered: 0.99, prereqReady: 0.4 });
    expect(r.state).toBe('ready');
  });
});

describe('deriveAllReadiness', () => {
  it('derives a state for every node', () => {
    const all = deriveAllReadiness(graph, mastery({ a: 0.9, b: 0.1 }));
    expect(all.get('a')!.state).toBe('mastered');
    expect(all.get('b')!.state).toBe('ready'); // a mastered => b ready
    expect(all.get('c')!.state).toBe('blocked'); // b weak => c blocked
    expect(all.size).toBe(3);
  });

  it('uses the documented default thresholds', () => {
    expect(DEFAULT_THRESHOLDS.mastered).toBe(0.85);
    expect(DEFAULT_THRESHOLDS.prereqReady).toBe(0.6);
  });
});
