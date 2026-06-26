import type { Concept, ConceptKind, ConceptState, TutorState } from './types.js';

export type ProgressStatus = 'new' | 'learning' | 'confident' | 'needs_review';

export type ProgressNode = {
  id: string;
  label: string;
  kind: ConceptKind | 'group';
  parentId?: string;
  mastery: number;
  confidence: number;
  exposureCount: number;
  activeRecallCount: number;
  status: ProgressStatus;
};

export type ProgressEdge = {
  from: string;
  to: string;
  type: 'group' | 'parent' | 'prerequisite' | 'related';
};

export type ProgressGraph = {
  nodes: ProgressNode[];
  edges: ProgressEdge[];
  summary: Record<ProgressStatus, number>;
};

export function buildProgressGraph(state: TutorState): ProgressGraph {
  const nodes: ProgressNode[] = [];
  const edges: ProgressEdge[] = [];
  const groups = new Set<ConceptKind>();
  for (const concept of state.concepts) groups.add(concept.kind);
  for (const kind of [...groups].sort()) {
    nodes.push({
      id: `group.${kind}`,
      label: labelForKind(kind),
      kind: 'group',
      mastery: groupAverage(state, kind, 'masteryEstimate'),
      confidence: groupAverage(state, kind, 'confidence'),
      exposureCount: groupSum(state, kind, 'exposureCount'),
      activeRecallCount: groupSum(state, kind, 'activeRecallCount'),
      status: 'learning',
    });
  }
  for (const concept of state.concepts) {
    const conceptState = state.conceptStates.find((item) => item.conceptId === concept.id);
    nodes.push(nodeForConcept(concept, conceptState));
    edges.push({ from: `group.${concept.kind}`, to: concept.id, type: 'group' });
    for (const parentId of concept.parentIds) edges.push({ from: parentId, to: concept.id, type: 'parent' });
    for (const prerequisiteId of concept.prerequisiteIds) edges.push({ from: prerequisiteId, to: concept.id, type: 'prerequisite' });
    for (const relatedId of concept.relatedIds) edges.push({ from: concept.id, to: relatedId, type: 'related' });
  }
  return { nodes, edges: dedupeEdges(edges), summary: summarize(nodes.filter((node) => node.kind !== 'group')) };
}

function nodeForConcept(concept: Concept, state?: ConceptState): ProgressNode {
  const mastery = state?.masteryEstimate ?? 0;
  const confidence = state?.confidence ?? 0;
  return {
    id: concept.id,
    label: concept.label,
    kind: concept.kind,
    parentId: concept.parentIds[0] ?? `group.${concept.kind}`,
    mastery,
    confidence,
    exposureCount: state?.exposureCount ?? 0,
    activeRecallCount: state?.activeRecallCount ?? 0,
    status: statusFor(state),
  };
}

function statusFor(state?: ConceptState): ProgressStatus {
  if (!state || state.exposureCount === 0) return 'new';
  if (state.failedCount > state.correctCount || state.masteryEstimate < 0.25) return 'needs_review';
  if (state.masteryEstimate >= 0.7 && state.activeRecallCount > 0) return 'confident';
  return 'learning';
}

function summarize(nodes: ProgressNode[]): Record<ProgressStatus, number> {
  return nodes.reduce<Record<ProgressStatus, number>>((acc, node) => {
    acc[node.status] += 1;
    return acc;
  }, { new: 0, learning: 0, confident: 0, needs_review: 0 });
}

function groupAverage(state: TutorState, kind: ConceptKind, field: 'masteryEstimate' | 'confidence'): number {
  const states = statesForKind(state, kind);
  if (!states.length) return 0;
  return states.reduce((sum, item) => sum + item[field], 0) / states.length;
}

function groupSum(state: TutorState, kind: ConceptKind, field: 'exposureCount' | 'activeRecallCount'): number {
  return statesForKind(state, kind).reduce((sum, item) => sum + item[field], 0);
}

function statesForKind(state: TutorState, kind: ConceptKind): ConceptState[] {
  const ids = new Set(state.concepts.filter((concept) => concept.kind === kind).map((concept) => concept.id));
  return state.conceptStates.filter((item) => ids.has(item.conceptId));
}

function dedupeEdges(edges: ProgressEdge[]): ProgressEdge[] {
  const seen = new Set<string>();
  return edges.filter((edge) => {
    const key = `${edge.from}->${edge.to}:${edge.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function labelForKind(kind: ConceptKind): string {
  return kind.replace(/_/g, ' ').replace(/^./, (char) => char.toUpperCase());
}
