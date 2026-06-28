import type { EvidenceTimeline } from './evidenceTimeline.js';
import type { ProgressNode } from './progress.js';
import type { EvidenceTimelineEdge, EvidenceTimelineNode } from './types.js';

export const MAP_DISPLAY_LIMITS = {
  graphNodesPerLane: 7,
  graphMaxEdges: 60,
  graphColumnNodes: 12,
  skillMapMaxCells: 48,
  timelinePageSize: 50,
  timelineDocsLimit: 12,
  workbenchMaxNodes: 48,
  workbenchConceptNodes: 24,
  workbenchCardNodes: 12,
  workbenchEvidenceNodes: 12,
  workbenchLinkCap: 80,
} as const;

export type GraphMapMode = 'local-graph' | 'provenance';

export type GraphLaneSpec = {
  id: string;
  label: string;
  types: EvidenceTimelineNode['type'][];
};

export const GRAPH_MAP_LANES: GraphLaneSpec[] = [
  { id: 'evidence', label: 'Evidence', types: ['commit', 'doc', 'file'] },
  { id: 'course', label: 'Courses', types: ['course'] },
  { id: 'concept', label: 'Concepts', types: ['concept'] },
  { id: 'question', label: 'Questions', types: ['question'] },
  { id: 'card', label: 'Cards', types: ['batch', 'card'] },
  { id: 'event', label: 'Events', types: ['event'] },
];

export type LaneOverflow = {
  laneId: string;
  laneLabel: string;
  shown: number;
  total: number;
  hidden: number;
};

export type GraphMapDisplay = {
  nodes: EvidenceTimelineNode[];
  edges: EvidenceTimelineEdge[];
  overflowByLane: LaneOverflow[];
  totalNodes: number;
  totalEdges: number;
};

export type SkillMapDisplay = {
  concepts: ProgressNode[];
  total: number;
  hidden: number;
};

export type TimelineDisplay = {
  nodes: EvidenceTimelineNode[];
  total: number;
  hidden: number;
  pageSize: number;
};

export function parseDisplayLimit(value: string | null | undefined, fallback?: number): number | undefined {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, 5000);
}

export function parseTimelinePageSize(value: string | null | undefined): number {
  return parseDisplayLimit(value, MAP_DISPLAY_LIMITS.timelinePageSize) ?? MAP_DISPLAY_LIMITS.timelinePageSize;
}

export function parseTimelineOffset(value: string | null | undefined): number {
  return parseDisplayLimit(value, 0) ?? 0;
}

export function selectGraphMapDisplay(
  nodes: EvidenceTimelineNode[],
  edges: EvidenceTimelineEdge[],
  options: { mode?: GraphMapMode; nodesPerLane?: number; maxEdges?: number } = {},
): GraphMapDisplay {
  const nodesPerLane = options.nodesPerLane ?? MAP_DISPLAY_LIMITS.graphNodesPerLane;
  const maxEdges = options.maxEdges ?? MAP_DISPLAY_LIMITS.graphMaxEdges;
  const mode = options.mode ?? 'local-graph';
  const overflowByLane: LaneOverflow[] = [];
  const selected: EvidenceTimelineNode[] = [];

  for (const lane of GRAPH_MAP_LANES) {
    const laneNodes = nodes.filter((node) => lane.types.includes(node.type));
    const ranked = rankGraphNodes(laneNodes, edges, mode);
    const hidden = Math.max(0, ranked.length - nodesPerLane);
    const visibleCount = hidden > 0 ? nodesPerLane - 1 : Math.min(ranked.length, nodesPerLane);
    const shown = ranked.slice(0, visibleCount);
    if (hidden > 0) {
      const rollupType = lane.types[0]!;
      shown.push(rollupNode(rollupType, hidden, lane.label));
    }
    selected.push(...shown);
    if (laneNodes.length > 0) {
      overflowByLane.push({
        laneId: lane.id,
        laneLabel: lane.label,
        shown: shown.length,
        total: laneNodes.length,
        hidden,
      });
    }
  }

  const visibleIds = new Set(selected.filter((node) => !isRollupNode(node)).map((node) => node.id));
  const visibleEdges = rankGraphEdges(edges, visibleIds).slice(0, maxEdges);
  return {
    nodes: selected,
    edges: visibleEdges,
    overflowByLane: overflowByLane.filter((lane) => lane.hidden > 0),
    totalNodes: nodes.length,
    totalEdges: edges.length,
  };
}

export function selectSkillMapConcepts(concepts: ProgressNode[], limit: number = MAP_DISPLAY_LIMITS.skillMapMaxCells): SkillMapDisplay {
  const ranked = [...concepts].sort(compareSkillMapConcepts);
  const shown = ranked.slice(0, limit);
  return { concepts: shown, total: concepts.length, hidden: Math.max(0, concepts.length - shown.length) };
}

export function selectTimelineDisplay(
  nodes: EvidenceTimelineNode[],
  pageSize: number = MAP_DISPLAY_LIMITS.timelinePageSize,
  offset = 0,
): TimelineDisplay {
  const ordered = [...nodes].reverse();
  const slice = ordered.slice(offset, offset + pageSize);
  return {
    nodes: slice,
    total: nodes.length,
    hidden: Math.max(0, nodes.length - offset - slice.length),
    pageSize,
  };
}

export function limitEvidenceTimeline(timeline: EvidenceTimeline, limit: number): EvidenceTimeline & { truncated: boolean; limit: number } {
  if (timeline.nodes.length <= limit) {
    return { ...timeline, truncated: false, limit };
  }
  const ranked = [...timeline.nodes].sort(compareRecencyDesc);
  const nodeIds = new Set(ranked.slice(0, limit).map((node) => node.id));
  const nodes = ranked.slice(0, limit);
  const edges = timeline.edges.filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to));
  return {
    summary: timeline.summary,
    nodes,
    edges,
    truncated: true,
    limit,
  };
}

export function isRollupNode(node: EvidenceTimelineNode): boolean {
  return node.id.startsWith('rollup:') || node.status === 'rollup';
}

function rollupNode(type: EvidenceTimelineNode['type'], hidden: number, laneLabel: string): EvidenceTimelineNode {
  return {
    id: `rollup:${type}:${laneLabel.toLowerCase().replace(/\s+/g, '-')}`,
    type,
    label: `+${hidden} more`,
    subtitle: `${laneLabel} hidden · open graph JSON`,
    status: 'rollup',
  };
}

function rankGraphNodes(nodes: EvidenceTimelineNode[], edges: EvidenceTimelineEdge[], mode: GraphMapMode): EvidenceTimelineNode[] {
  return [...nodes].sort((left, right) => scoreGraphNode(right, edges, mode) - scoreGraphNode(left, edges, mode));
}

function scoreGraphNode(node: EvidenceTimelineNode, edges: EvidenceTimelineEdge[], mode: GraphMapMode): number {
  const recency = node.createdAt ? Date.parse(node.createdAt) : 0;
  const degree = edges.filter((edge) => edge.from === node.id || edge.to === node.id).length;
  const modeBoost = mode === 'provenance'
    ? ({ card: 5, question: 4, concept: 3, course: 2, batch: 2, doc: 1, file: 1, commit: 0, event: 0 }[node.type] ?? 0)
    : ({ card: 2, question: 2, concept: 1, course: 1, batch: 1, event: 1, doc: 0, file: 0, commit: 0 }[node.type] ?? 0);
  return recency + degree * 1_000 + modeBoost * 10_000_000_000;
}

function rankGraphEdges(edges: EvidenceTimelineEdge[], visibleIds: Set<string>): EvidenceTimelineEdge[] {
  return edges
    .filter((edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to))
    .sort((left, right) => edgePriority(right.type) - edgePriority(left.type));
}

function edgePriority(type: EvidenceTimelineEdge['type']): number {
  return ({ schedules: 5, drafted: 4, teaches: 3, uses_evidence: 2, generated: 2, answered: 1, mentions: 1, changed: 0, belongs_to: 0 }[type] ?? 0);
}

function compareSkillMapConcepts(left: ProgressNode, right: ProgressNode): number {
  const statusRank = (status: ProgressNode['status']) => ({ needs_review: 0, new: 1, learning: 2, confident: 3 }[status] ?? 4);
  const leftRank = statusRank(left.status);
  const rightRank = statusRank(right.status);
  if (leftRank !== rightRank) return leftRank - rightRank;
  if (left.mastery !== right.mastery) return left.mastery - right.mastery;
  if (left.activeRecallCount !== right.activeRecallCount) return left.activeRecallCount - right.activeRecallCount;
  return left.label.localeCompare(right.label);
}

function compareRecencyDesc(left: EvidenceTimelineNode, right: EvidenceTimelineNode): number {
  const leftTime = left.createdAt ? Date.parse(left.createdAt) : 0;
  const rightTime = right.createdAt ? Date.parse(right.createdAt) : 0;
  if (leftTime !== rightTime) return rightTime - leftTime;
  return left.type.localeCompare(right.type);
}
