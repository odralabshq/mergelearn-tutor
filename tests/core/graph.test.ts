import { describe, expect, it } from 'vitest';

import { buildGraph, findCycle, topoSort, type GraphNodeInput } from '../../src/core/graph.js';

function g(nodes: GraphNodeInput[]) {
  return buildGraph(nodes);
}

describe('buildGraph', () => {
  it('drops edges to unknown nodes and self-edges', () => {
    const graph = g([
      { id: 'a', prerequisiteIds: ['ghost', 'a'], parentIds: [] },
      { id: 'b', prerequisiteIds: ['a'] },
    ]);
    expect(graph.prereqs.get('a')).toEqual([]);
    expect(graph.prereqs.get('b')).toEqual(['a']);
  });
});

describe('findCycle', () => {
  it('returns null for an acyclic graph', () => {
    const graph = g([{ id: 'a' }, { id: 'b', prerequisiteIds: ['a'] }]);
    expect(findCycle(graph.prereqs)).toBeNull();
  });

  it('finds a direct cycle', () => {
    const graph = g([
      { id: 'a', prerequisiteIds: ['b'] },
      { id: 'b', prerequisiteIds: ['a'] },
    ]);
    const cycle = findCycle(graph.prereqs);
    expect(cycle).not.toBeNull();
    expect(cycle!.length).toBeGreaterThanOrEqual(3);
    expect(cycle![0]).toBe(cycle![cycle!.length - 1]);
  });
});

describe('topoSort', () => {
  it('orders prerequisites before dependents', () => {
    const graph = g([
      { id: 'c', prerequisiteIds: ['b'] },
      { id: 'b', prerequisiteIds: ['a'] },
      { id: 'a' },
    ]);
    const order = topoSort(graph);
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('c'));
  });

  it('is deterministic (sorted) for independent nodes', () => {
    const order = topoSort(g([{ id: 'z' }, { id: 'a' }, { id: 'm' }]));
    expect(order).toEqual(['a', 'm', 'z']);
  });

  it('throws loudly on a prereq cycle rather than emitting a wrong sequence', () => {
    const graph = g([
      { id: 'a', prerequisiteIds: ['b'] },
      { id: 'b', prerequisiteIds: ['a'] },
    ]);
    expect(() => topoSort(graph)).toThrow(/prereq cycle/);
  });
});
