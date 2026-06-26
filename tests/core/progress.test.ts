import { describe, expect, it } from 'vitest';

import { buildProgressGraph } from '../../src/core/progress.js';
import type { TutorState } from '../../src/core/types.js';

const state: TutorState = {
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
  learningEvents: [],
  corrections: [],
  manualRatings: [],
};

describe('progress graph', () => {
  it('groups concepts and summarizes confidence states', () => {
    const graph = buildProgressGraph(state);
    expect(graph.nodes.some((node) => node.id === 'group.security')).toBe(true);
    expect(graph.edges.some((edge) => edge.type === 'group' && edge.to === 'security.auth_boundary')).toBe(true);
    expect(graph.summary.needs_review).toBe(1);
    expect(graph.summary.confident).toBe(1);
  });
});
