import { summarizeCalibration } from './calibration.js';
import { delayedProbeSummary, dueDelayedProbes } from './delayedProbes.js';
import { buildEvidenceTimeline } from './evidenceTimeline.js';
import { buildProgressGraph } from './progress.js';
import { studySummary } from './study.js';
import type { TutorState } from './types.js';

export type WorkbenchSemanticTag = 'due' | 'weak' | 'study' | 'evidence';

export type WorkbenchNode = {
  id: string;
  type: 'concept' | 'card' | 'event' | 'evidence' | 'probe' | 'study';
  label: string;
  status?: string;
  href?: string;
  detail: string;
  tags: WorkbenchSemanticTag[];
};

export type WorkbenchLink = {
  from: string;
  to: string;
  type: string;
};

export type WorkbenchSummary = {
  nextAction: { label: string; href: string; reason: string };
  metrics: {
    activeCards: number;
    dueDelayedProbes: number;
    weakConcepts: number;
    studyPending: number;
    calibratedAnswers: number;
  };
  filters: Array<{ id: 'due' | 'weak' | 'study' | 'evidence'; label: string; count: number }>;
  nodes: WorkbenchNode[];
  links: WorkbenchLink[];
};

export function buildWorkbenchSummary(state: TutorState, nowIso?: string): WorkbenchSummary {
  const activeCards = state.learningItems.filter((item) => item.status !== 'archived');
  const progress = buildProgressGraph(state);
  const weakConcepts = progress.nodes.filter((node) => node.kind !== 'group' && node.status === 'needs_review');
  const dueProbes = dueDelayedProbes(state, nowIso);
  const delayed = delayedProbeSummary(state, nowIso);
  const study = studySummary(state);
  const calibration = summarizeCalibration(state);
  const timeline = buildEvidenceTimeline(state);
  const metrics = {
    activeCards: activeCards.length,
    dueDelayedProbes: dueProbes.length,
    weakConcepts: weakConcepts.length,
    studyPending: study.pending,
    calibratedAnswers: calibration.pairedCount,
  };
  const weakConceptIds = new Set(weakConcepts.map((node) => node.id));
  const dueItemIds = new Set(dueProbes.map((probe) => probe.sourceItemId));
  const nodes = visualNodes(state, progress.nodes.filter((node) => node.kind !== 'group'), { dueItemIds, weakConceptIds, dueProbeIds: new Set(dueProbes.map((probe) => probe.id)), timeline });
  const taggedCount = (tag: WorkbenchSemanticTag) => nodes.filter((node) => node.tags.includes(tag)).length;
  return {
    nextAction: nextAction(metrics, state.concepts.length),
    metrics,
    filters: [
      { id: 'due', label: 'Due probes', count: taggedCount('due') },
      { id: 'weak', label: 'Weak concepts', count: taggedCount('weak') },
      { id: 'study', label: 'Study controls', count: taggedCount('study') },
      { id: 'evidence', label: 'Evidence links', count: taggedCount('evidence') },
    ],
    nodes,
    links: timeline.edges.slice(0, 80).map((edge) => ({ from: edge.from, to: edge.to, type: edge.type })),
  };
}

function nextAction(metrics: WorkbenchSummary['metrics'], concepts: number): WorkbenchSummary['nextAction'] {
  if (metrics.dueDelayedProbes > 0) return { label: 'Complete due delayed probe', href: '/api/delayed-probes', reason: 'Spacing is only useful when due probes get answered.' };
  if (metrics.studyPending > 0) return { label: 'Complete study assignment', href: '/study', reason: 'Finish active-control or active-recall assignments before comparing outcomes.' };
  if (metrics.activeCards > 0) return { label: 'Review active card', href: '/', reason: 'Active recall creates the learning evidence.' };
  if (concepts > 0) return { label: 'Generate review cards', href: '/', reason: 'Concepts exist, but no active cards are queued.' };
  return { label: 'Ingest local evidence', href: '/timeline', reason: 'Start by building the local evidence graph.' };
}

type VisualNodeInputs = {
  dueItemIds: Set<string>;
  dueProbeIds: Set<string>;
  weakConceptIds: Set<string>;
  timeline: ReturnType<typeof buildEvidenceTimeline>;
};

function visualNodes(state: TutorState, conceptNodes: ReturnType<typeof buildProgressGraph>['nodes'], inputs: VisualNodeInputs): WorkbenchNode[] {
  const conceptVisuals: WorkbenchNode[] = conceptNodes.slice(0, 24).map((node) => ({
    id: `concept:${node.id}`,
    type: 'concept',
    label: node.label,
    status: node.status,
    href: '/progress',
    detail: `${node.label} is ${node.status.replace('_', ' ')} with ${node.activeRecallCount} active recall event${node.activeRecallCount === 1 ? '' : 's'}.`,
    tags: inputs.weakConceptIds.has(node.id) ? ['weak'] : [],
  }));
  const cardVisuals: WorkbenchNode[] = state.learningItems.filter((item) => item.status !== 'archived').slice(0, 12).map((item) => ({
    id: `card:${item.id}`,
    type: 'card',
    label: item.title,
    status: item.questionPlane,
    href: '/',
    detail: `${item.title} is an active ${item.questionPlane.replace('_', ' ')} card from ${item.snippet.path}.`,
    tags: [ ...(inputs.dueItemIds.has(item.id) ? ['due' as const] : []), ...(item.evidence.length > 0 ? ['evidence' as const] : []) ],
  }));
  const dueProbeVisuals: WorkbenchNode[] = state.delayedProbes?.filter((probe) => inputs.dueProbeIds.has(probe.id)).slice(0, 12).map((probe) => ({
    id: `probe:${probe.id}`,
    type: 'probe',
    label: `${probe.intervalDays}-day delayed probe`,
    status: probe.status,
    href: '/history',
    detail: `Delayed recall probe due for card ${probe.sourceItemId} and concept ${probe.conceptId}.`,
    tags: ['due'],
  })) ?? [];
  const evidenceVisuals: WorkbenchNode[] = inputs.timeline.nodes.filter((node) => ['commit', 'doc', 'file'].includes(node.type)).slice(0, 12).map((node) => ({
    id: node.id,
    type: 'evidence',
    label: node.label,
    status: node.type,
    href: '/timeline',
    detail: `${node.type} evidence${node.path ? ` from ${node.path}` : ''} participates in the local provenance graph.`,
    tags: ['evidence'],
  }));
  const eventVisuals: WorkbenchNode[] = state.learningEvents.slice(-12).map((event) => ({
    id: `event:${event.id}`,
    type: 'event',
    label: event.eventType,
    status: event.correct === undefined ? undefined : event.correct ? 'correct' : 'missed',
    href: '/history',
    detail: `${event.eventType.replace('_', ' ')} event for ${event.itemId}${event.correct === undefined ? '' : event.correct ? ' marked correct.' : ' marked missed.'}`,
    tags: [],
  }));
  const studyVisuals: WorkbenchNode[] = (state.studyAssignments ?? []).slice(-12).map((assignment) => ({
    id: `study:${assignment.id}`,
    type: 'study',
    label: assignment.condition.replace('_', ' '),
    status: assignment.status,
    href: '/study',
    detail: `${assignment.condition.replace('_', ' ')} assignment for item ${assignment.itemId} is ${assignment.status}.`,
    tags: ['study'],
  }));
  return [...conceptVisuals, ...cardVisuals, ...dueProbeVisuals, ...evidenceVisuals, ...eventVisuals, ...studyVisuals];
}

