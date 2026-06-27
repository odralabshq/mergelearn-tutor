import { summarizeCalibration } from './calibration.js';
import { delayedProbeSummary, dueDelayedProbes } from './delayedProbes.js';
import { buildEvidenceTimeline } from './evidenceTimeline.js';
import { buildProgressGraph } from './progress.js';
import { studySummary } from './study.js';
import type { TutorState } from './types.js';

export type WorkbenchNode = {
  id: string;
  type: 'concept' | 'card' | 'event' | 'evidence' | 'study';
  label: string;
  status?: string;
  href?: string;
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
  return {
    nextAction: nextAction(metrics, state.concepts.length),
    metrics,
    filters: [
      { id: 'due', label: 'Due probes', count: delayed.due },
      { id: 'weak', label: 'Weak concepts', count: weakConcepts.length },
      { id: 'study', label: 'Study controls', count: study.pending },
      { id: 'evidence', label: 'Evidence links', count: timeline.edges.length },
    ],
    nodes: visualNodes(state, progress.nodes.filter((node) => node.kind !== 'group')),
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

function visualNodes(state: TutorState, conceptNodes: ReturnType<typeof buildProgressGraph>['nodes']): WorkbenchNode[] {
  const conceptVisuals: WorkbenchNode[] = conceptNodes.slice(0, 24).map((node) => ({
    id: `concept:${node.id}`,
    type: 'concept',
    label: node.label,
    status: node.status,
    href: '/progress',
  }));
  const cardVisuals: WorkbenchNode[] = state.learningItems.filter((item) => item.status !== 'archived').slice(0, 12).map((item) => ({
    id: `card:${item.id}`,
    type: 'card',
    label: item.title,
    status: item.questionPlane,
    href: '/',
  }));
  const eventVisuals: WorkbenchNode[] = state.learningEvents.slice(-12).map((event) => ({
    id: `event:${event.id}`,
    type: 'event',
    label: event.eventType,
    status: event.correct === undefined ? undefined : event.correct ? 'correct' : 'missed',
    href: '/history',
  }));
  const studyVisuals: WorkbenchNode[] = (state.studyAssignments ?? []).slice(-12).map((assignment) => ({
    id: `study:${assignment.id}`,
    type: 'study',
    label: assignment.condition.replace('_', ' '),
    status: assignment.status,
    href: '/study',
  }));
  return [...conceptVisuals, ...cardVisuals, ...eventVisuals, ...studyVisuals];
}

