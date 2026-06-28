import { buildProgressGraph, type ProgressStatus } from './progress.js';
import type { TutorState } from './types.js';

export type LearningPathNode = {
  id: string;
  label: string;
  status: ProgressStatus;
  mastery: number;
  kind: string;
};

export type LearningPathEdge = {
  from: string;
  to: string;
  type: 'parent' | 'prerequisite';
};

export type LearningPathGraph = {
  nodes: LearningPathNode[];
  edges: LearningPathEdge[];
  recommendedOrder: string[];
  summary: Record<ProgressStatus, number>;
  cycleDetected: boolean;
  cycleNodes: string[];
  courseId?: string;
};

export type BuildLearningPathOptions = {
  courseId?: string;
};

export function buildLearningPathGraph(state: TutorState, options: BuildLearningPathOptions = {}): LearningPathGraph {
  const progress = buildProgressGraph(state);
  const scopedIds = resolveCourseConceptIds(state, options.courseId);
  let nodes = progress.nodes.filter((node) => node.kind !== 'group');
  if (scopedIds) nodes = nodes.filter((node) => scopedIds.has(node.id));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = progress.edges
    .filter((edge) => (edge.type === 'prerequisite' || edge.type === 'parent') && nodeIds.has(edge.from) && nodeIds.has(edge.to))
    .map((edge) => ({ from: edge.from, to: edge.to, type: edge.type as 'parent' | 'prerequisite' }));
  const sort = topologicalOrder([...nodeIds], edges);
  const pathNodes: LearningPathNode[] = nodes.map((node) => ({
    id: node.id,
    label: node.label,
    status: node.status,
    mastery: node.mastery,
    kind: node.kind,
  }));
  const summary = pathNodes.reduce<Record<ProgressStatus, number>>((acc, node) => {
    acc[node.status] += 1;
    return acc;
  }, { new: 0, learning: 0, confident: 0, needs_review: 0 });
  return {
    nodes: pathNodes,
    edges,
    recommendedOrder: sort.order,
    summary,
    cycleDetected: sort.cycleDetected,
    cycleNodes: sort.cycleNodes,
    courseId: options.courseId,
  };
}

export function topologicalOrder(
  nodeIds: string[],
  edges: LearningPathEdge[],
): { order: string[]; cycleDetected: boolean; cycleNodes: string[] } {
  const ids = [...new Set(nodeIds)];
  const inDegree = new Map<string, number>(ids.map((id) => [id, 0]));
  const adjacency = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const edge of edges) {
    if (!inDegree.has(edge.from) || !inDegree.has(edge.to)) continue;
    adjacency.get(edge.from)!.push(edge.to);
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
  }
  const queue = ids.filter((id) => (inDegree.get(id) ?? 0) === 0).sort();
  const order: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);
    for (const next of adjacency.get(current) ?? []) {
      const nextDegree = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, nextDegree);
      if (nextDegree === 0) {
        queue.push(next);
        queue.sort();
      }
    }
  }
  if (order.length === ids.length) return { order, cycleDetected: false, cycleNodes: [] };
  const remaining = ids.filter((id) => !order.includes(id));
  return { order, cycleDetected: true, cycleNodes: remaining.sort() };
}

function resolveCourseConceptIds(state: TutorState, courseId?: string): Set<string> | null {
  if (!courseId) return null;
  const course = state.courses.find((entry) => entry.id === courseId);
  if (!course) return new Set();
  if (course.conceptIds.length > 0) return new Set(course.conceptIds);
  const linked = new Set<string>();
  for (const question of state.questionBank) {
    if (question.courseId === courseId) linked.add(question.conceptId);
  }
  for (const item of state.learningItems) {
    if (item.courseId === courseId) linked.add(item.conceptId);
  }
  if (linked.size > 0) return linked;
  return null;
}
