import { describe, expect, it } from 'vitest';

import { buildEvidenceTimeline } from '../../src/core/evidenceTimeline.js';
import { generateCardBatch, mergeLearningState } from '../../src/core/planner.js';
import { buildProgressGraph } from '../../src/core/progress.js';
import {
  limitEvidenceTimeline,
  MAP_DISPLAY_LIMITS,
  parseDisplayLimit,
  selectGraphMapDisplay,
  selectSkillMapConcepts,
  selectTimelineDisplay,
} from '../../src/core/mapScaling.js';
import { createEmptyState } from '../../src/core/store.js';
import type { CommitArtifact, Concept, LearningEvent, TutorState } from '../../src/core/types.js';

const artifact = (id: string, files: string[], committedAt: string): CommitArtifact => ({
  id: `artifact-${id}`,
  type: 'commit',
  externalId: id,
  title: `commit ${id}`,
  body: '',
  changedFiles: files,
  committedAt,
  diff: '',
});

const concept = (id: string, label: string): Concept => ({
  id,
  label,
  kind: 'repo_domain',
  description: label,
  difficulty: 'beginner',
  parentIds: [],
  prerequisiteIds: [],
  relatedIds: [],
  evidence: [{ path: `src/${id}.ts`, label }],
});

function largeState(): TutorState {
  const artifacts = Array.from({ length: 20 }, (_, index) => artifact(`c${index}`, [`src/file-${index}.ts`], `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`));
  const concepts = Array.from({ length: 80 }, (_, index) => concept(`concept.${index}`, `Concept ${index}`));
  let state = mergeLearningState(createEmptyState('/repo'), artifacts, concepts);
  const conceptStates = concepts.map((entry, index) => ({
    conceptId: entry.id,
    exposureCount: 1,
    activeRecallCount: index % 3,
    correctCount: index % 4,
    failedCount: index % 5 === 0 ? 2 : 0,
    hintCount: 0,
    masteryEstimate: index % 10 === 0 ? 0.1 : 0.6,
    confidence: 0.4,
    importance: 0.5,
    repoRelevance: 0.5,
  }));
  state = { ...state, conceptStates };
  const events: LearningEvent[] = Array.from({ length: 120 }, (_, index) => ({
    id: `event-${index}`,
    itemId: 'item-1',
    conceptId: concepts[index % concepts.length]!.id,
    eventType: 'answered',
    correct: index % 2 === 0,
    createdAt: `2026-02-${String((index % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
  }));
  state = {
    ...state,
    learningItems: [{
      id: 'item-1',
      conceptId: concepts[0]!.id,
      type: 'explain_back',
      questionPlane: 'local_behavior',
      title: 'Card 1',
      snippet: { path: 'src/file-0.ts', label: 'snippet', code: 'code' },
      bodyMarkdown: 'body',
      prompt: 'prompt',
      explanationMarkdown: 'explanation',
      expectedFocus: ['focus'],
      evidence: [{ path: 'src/file-0.ts', label: 'evidence' }],
      difficulty: 'beginner',
      createdAt: '2026-02-01T00:00:00.000Z',
      status: 'active',
      generation: 1,
      source: 'ingest',
    }],
    learningEvents: events,
  };
  return generateCardBatch(state, undefined, { count: 1, mode: 'more' });
}

describe('map scaling', () => {
  it('parses display limits safely', () => {
    expect(parseDisplayLimit(null, 50)).toBe(50);
    expect(parseDisplayLimit('100')).toBe(100);
    expect(parseDisplayLimit('0', 50)).toBe(50);
    expect(parseDisplayLimit('99999')).toBe(5000);
  });

  it('caps graph lanes with rollup nodes and prioritized edges', () => {
    const timeline = buildEvidenceTimeline(largeState());
    const display = selectGraphMapDisplay(timeline.nodes, timeline.edges, { mode: 'local-graph' });

    expect(display.nodes.length).toBeLessThan(timeline.nodes.length);
    expect(display.nodes.some((node) => node.label.startsWith('+'))).toBe(true);
    expect(display.edges.length).toBeLessThanOrEqual(MAP_DISPLAY_LIMITS.graphMaxEdges);
    expect(display.overflowByLane.some((lane) => lane.hidden > 0)).toBe(true);
    for (const lane of display.overflowByLane) {
      expect(lane.shown).toBeLessThanOrEqual(MAP_DISPLAY_LIMITS.graphNodesPerLane);
    }
  });

  it('prioritizes downstream provenance nodes in provenance mode', () => {
    const timeline = buildEvidenceTimeline(largeState());
    const local = selectGraphMapDisplay(timeline.nodes, timeline.edges, { mode: 'local-graph' });
    const provenance = selectGraphMapDisplay(timeline.nodes, timeline.edges, { mode: 'provenance' });
    const localCards = local.nodes.filter((node) => node.type === 'card').map((node) => node.id);
    const provenanceCards = provenance.nodes.filter((node) => node.type === 'card').map((node) => node.id);

    expect(provenanceCards.length).toBeGreaterThan(0);
    expect(new Set([...localCards, ...provenanceCards]).size).toBeGreaterThan(0);
  });

  it('sorts skill map concepts by weakness and caps visible cells', () => {
    const graph = buildProgressGraph(largeState());
    const concepts = graph.nodes.filter((node) => node.kind !== 'group');
    const display = selectSkillMapConcepts(concepts, 12);

    expect(display.concepts).toHaveLength(12);
    expect(display.hidden).toBe(concepts.length - 12);
    expect(display.concepts[0]?.status).toBe('needs_review');
  });

  it('paginates timeline nodes newest first', () => {
    const timeline = buildEvidenceTimeline(largeState());
    const firstPage = selectTimelineDisplay(timeline.nodes, 25, 0);
    const secondPage = selectTimelineDisplay(timeline.nodes, 25, 25);

    expect(firstPage.nodes).toHaveLength(25);
    expect(firstPage.hidden).toBe(timeline.nodes.length - 25);
    expect(secondPage.nodes[0]?.id).not.toBe(firstPage.nodes[0]?.id);
    expect((firstPage.nodes[0]?.createdAt ?? '') >= (firstPage.nodes.at(-1)?.createdAt ?? '')).toBe(true);
  });

  it('limits evidence timeline API payloads when requested', () => {
    const timeline = buildEvidenceTimeline(largeState());
    const limited = limitEvidenceTimeline(timeline, 40);

    expect(limited.truncated).toBe(true);
    expect(limited.limit).toBe(40);
    expect(limited.nodes).toHaveLength(40);
    expect(limited.edges.every((edge) => limited.nodes.some((node) => node.id === edge.from) && limited.nodes.some((node) => node.id === edge.to))).toBe(true);
  });
});
