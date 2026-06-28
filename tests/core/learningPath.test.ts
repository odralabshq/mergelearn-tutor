import { describe, expect, it } from 'vitest';

import { buildLearningPathGraph, topologicalOrder } from '../../src/core/learningPath.js';
import type { TutorState } from '../../src/core/types.js';

function baseState(overrides: Partial<TutorState> = {}): TutorState {
  return {
    version: 1,
    repoPath: '/repo',
    goals: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    artifacts: [],
    concepts: [
      { id: 'security.auth_boundary', label: 'Auth boundary', kind: 'security', description: 'Auth', difficulty: 'advanced', parentIds: [], prerequisiteIds: [], relatedIds: ['testing.behavior_tests'], evidence: [{ path: 'src/auth.ts', label: 'auth' }] },
      { id: 'testing.behavior_tests', label: 'Behavior tests', kind: 'testing', description: 'Tests', difficulty: 'beginner', parentIds: [], prerequisiteIds: ['security.auth_boundary'], relatedIds: [], evidence: [{ path: 'tests/auth.test.ts', label: 'test' }] },
    ],
    conceptStates: [
      { conceptId: 'security.auth_boundary', exposureCount: 2, activeRecallCount: 0, correctCount: 0, failedCount: 1, hintCount: 0, masteryEstimate: 0.2, confidence: 0.2, importance: 0.9, repoRelevance: 0.8 },
      { conceptId: 'testing.behavior_tests', exposureCount: 1, activeRecallCount: 1, correctCount: 1, failedCount: 0, hintCount: 0, masteryEstimate: 0.75, confidence: 0.75, importance: 0.8, repoRelevance: 0.7 },
    ],
    learningItems: [],
    cardBatches: [],
    courses: [{
      id: 'learn-security',
      title: 'Learn security',
      goal: 'Understand auth',
      enabledPlanes: ['local_behavior'],
      materialPaths: ['src/**'],
      docPaths: [],
      conceptIds: ['security.auth_boundary'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }],
    questionBank: [],
    questionDraftBatches: [],
    learningEvents: [],
    corrections: [],
    manualRatings: [],
    ...overrides,
  };
}

describe('learning path graph', () => {
  it('orders prerequisites before dependents', () => {
    const graph = buildLearningPathGraph(baseState());
    expect(graph.edges.every((edge) => edge.type === 'parent' || edge.type === 'prerequisite')).toBe(true);
    expect(graph.recommendedOrder.indexOf('security.auth_boundary')).toBeLessThan(graph.recommendedOrder.indexOf('testing.behavior_tests'));
    expect(graph.cycleDetected).toBe(false);
  });

  it('detects cycles gracefully', () => {
    const cyclic = topologicalOrder(['a', 'b', 'c'], [
      { from: 'a', to: 'b', type: 'prerequisite' },
      { from: 'b', to: 'c', type: 'prerequisite' },
      { from: 'c', to: 'a', type: 'prerequisite' },
    ]);
    expect(cyclic.cycleDetected).toBe(true);
    expect(cyclic.cycleNodes.sort()).toEqual(['a', 'b', 'c']);
    expect(cyclic.order.length).toBeLessThan(3);
  });

  it('filters to course conceptIds when set', () => {
    const graph = buildLearningPathGraph(baseState(), { courseId: 'learn-security' });
    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0]?.id).toBe('security.auth_boundary');
    expect(graph.courseId).toBe('learn-security');
  });

  it('returns API-shaped summary fields', () => {
    const graph = buildLearningPathGraph(baseState());
    expect(graph.nodes[0]).toMatchObject({ id: expect.any(String), label: expect.any(String), status: expect.any(String), mastery: expect.any(Number), kind: expect.any(String) });
    expect(graph.edges[0]).toMatchObject({ from: expect.any(String), to: expect.any(String), type: expect.stringMatching(/^(parent|prerequisite)$/) });
    expect(graph.summary).toMatchObject({ new: expect.any(Number), learning: expect.any(Number), confident: expect.any(Number), needs_review: expect.any(Number) });
    expect(Array.isArray(graph.recommendedOrder)).toBe(true);
    expect(Array.isArray(graph.cycleNodes)).toBe(true);
  });

  it('handles zero concepts without errors', () => {
    const graph = buildLearningPathGraph(baseState({ concepts: [], conceptStates: [] }));
    expect(graph.nodes).toHaveLength(0);
    expect(graph.recommendedOrder).toHaveLength(0);
    expect(graph.cycleDetected).toBe(false);
  });
});
