import { describe, expect, it } from 'vitest';

import { buildWorkbenchSummary } from '../../src/core/workbench.js';
import type { TutorState } from '../../src/core/types.js';

function state(): TutorState {
  return {
    version: 1,
    repoPath: '/tmp/repo',
    goals: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    artifacts: [],
    concepts: [{ id: 'repo.auth', label: 'Auth flow', kind: 'repo_domain', description: 'Auth behavior', difficulty: 'intermediate', parentIds: [], prerequisiteIds: [], relatedIds: [], evidence: [{ path: 'src/auth.ts', label: 'auth evidence' }] }],
    conceptStates: [{ conceptId: 'repo.auth', exposureCount: 2, activeRecallCount: 0, correctCount: 0, failedCount: 1, hintCount: 0, masteryEstimate: 0.2, confidence: 0.2, importance: 0.8, repoRelevance: 0.9 }],
    learningItems: [{ id: 'item_auth', conceptId: 'repo.auth', type: 'explain_back', questionPlane: 'local_behavior', title: 'Auth card', snippet: { path: 'src/auth.ts', label: 'auth evidence', code: 'export function auth() { return true; }' }, bodyMarkdown: 'body', prompt: 'Explain auth.', explanationMarkdown: 'Auth controls access.', expectedFocus: ['auth'], evidence: [{ path: 'src/auth.ts', label: 'auth evidence' }], difficulty: 'intermediate', createdAt: '2026-01-01T00:00:00.000Z', status: 'active', generation: 1, source: 'ingest' }],
    cardBatches: [],
    courses: [],
    questionBank: [],
    questionDraftBatches: [],
    learningEvents: [{ id: 'event_answer', itemId: 'item_auth', conceptId: 'repo.auth', eventType: 'answered', answerText: 'answer', correct: false, createdAt: '2026-01-02T00:00:00.000Z' }],
    delayedProbes: [{ id: 'probe_auth', sourceItemId: 'item_auth', conceptId: 'repo.auth', intervalDays: 2, dueAt: '2026-01-03T00:00:00.000Z', status: 'scheduled', scheduledAt: '2026-01-01T00:00:00.000Z' }],
    studyAssignments: [{ id: 'study_auth', itemId: 'item_auth', conceptId: 'repo.auth', condition: 'active_control', status: 'assigned', mode: 'crossover', seed: 'test', assignedAt: '2026-01-01T00:00:00.000Z' }],
    corrections: [],
    manualRatings: [],
  };
}

describe('workbench summary', () => {
  it('combines next action, learning metrics, and visual nodes from existing local state', () => {
    const summary = buildWorkbenchSummary(state(), '2026-01-04T00:00:00.000Z');
    expect(summary.nextAction).toMatchObject({ label: 'Complete due delayed probe', href: '/api/delayed-probes' });
    expect(summary.metrics).toMatchObject({ activeCards: 1, dueDelayedProbes: 1, weakConcepts: 1, studyPending: 1 });
    expect(summary.filters.map((filter) => filter.id)).toEqual(['due', 'weak', 'study', 'evidence']);
    expect(summary.nodes.some((node) => node.type === 'concept' && node.status === 'needs_review')).toBe(true);
    expect(summary.links.some((link) => link.to === 'card:item_auth')).toBe(true);
  });
});
