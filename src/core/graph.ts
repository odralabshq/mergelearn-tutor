/**
 * Typed concept graph (S7a, doc 03 refined by doc 05).
 *
 * Doc 05 cut the edge set to TWO load-bearing kinds:
 *  - prereq_of: X must be understood before Y (drives ready/blocked, must be acyclic)
 *  - is_a:      Y is a kind of X (hierarchy for rollup, must be acyclic)
 * ("related" is dropped as decoration - it never drove behavior.)
 *
 * This module is pure and reads the existing Concept edge fields
 * (prerequisiteIds -> prereq_of, parentIds -> is_a) so it needs no schema change.
 * It validates acyclicity and provides a prerequisite-respecting topological
 * order for sequencing.
 */

export type EdgeKind = 'prereq_of' | 'is_a';

/** Minimal structural input - any object with an id and the two edge lists. */
export interface GraphNodeInput {
  id: string;
  prerequisiteIds?: string[];
  parentIds?: string[];
}

export interface ConceptGraph {
  ids: string[];
  /** node id -> prerequisite node ids (edges point from prereq to dependent). */
  prereqs: Map<string, string[]>;
  /** node id -> parent node ids (is_a). */
  parents: Map<string, string[]>;
}

/** Build a typed graph, ignoring edges that point at unknown nodes. */
export function buildGraph(nodes: GraphNodeInput[]): ConceptGraph {
  const ids = nodes.map((n) => n.id);
  const known = new Set(ids);
  const prereqs = new Map<string, string[]>();
  const parents = new Map<string, string[]>();
  for (const n of nodes) {
    prereqs.set(n.id, (n.prerequisiteIds ?? []).filter((p) => known.has(p) && p !== n.id));
    parents.set(n.id, (n.parentIds ?? []).filter((p) => known.has(p) && p !== n.id));
  }
  return { ids, prereqs, parents };
}

/**
 * Detect a cycle in one edge map. Returns the first cycle found as a node-id
 * path (e.g. ['a','b','a']), or null if the graph is acyclic. DFS with a
 * recursion stack; used for BOTH prereq_of and is_a (both must be acyclic).
 */
export function findCycle(edges: Map<string, string[]>): string[] | null {
  const WHITE = 0, GREY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const id of edges.keys()) color.set(id, WHITE);
  const stack: string[] = [];

  function dfs(node: string): string[] | null {
    color.set(node, GREY);
    stack.push(node);
    for (const next of edges.get(node) ?? []) {
      if (color.get(next) === GREY) {
        const from = stack.indexOf(next);
        return [...stack.slice(from), next];
      }
      if (color.get(next) === WHITE) {
        const found = dfs(next);
        if (found) return found;
      }
    }
    color.set(node, BLACK);
    stack.pop();
    return null;
  }

  for (const id of edges.keys()) {
    if (color.get(id) === WHITE) {
      const found = dfs(id);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Prerequisite-respecting topological order (Kahn's algorithm). Throws if the
 * prereq graph has a cycle - a hallucinated prereq edge must fail loudly, never
 * produce a silently-wrong sequence (doc 05 prereq-verification concern).
 */
export function topoSort(graph: ConceptGraph): string[] {
  const cycle = findCycle(graph.prereqs);
  if (cycle) throw new Error(`prereq cycle: ${cycle.join(' -> ')}`);
  const indegree = new Map<string, number>();
  for (const id of graph.ids) indegree.set(id, 0);
  for (const id of graph.ids) {
    for (const _p of graph.prereqs.get(id) ?? []) indegree.set(id, (indegree.get(id) ?? 0) + 1);
  }
  const queue = graph.ids.filter((id) => (indegree.get(id) ?? 0) === 0).sort();
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift() as string;
    order.push(id);
    for (const other of graph.ids) {
      if ((graph.prereqs.get(other) ?? []).includes(id)) {
        const d = (indegree.get(other) ?? 0) - 1;
        indegree.set(other, d);
        if (d === 0) { queue.push(other); queue.sort(); }
      }
    }
  }
  return order;
}
