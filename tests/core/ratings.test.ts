import { describe, expect, it } from 'vitest';

import { recordManualRating, renderManualRatingSummary } from '../../src/core/ratings.js';
import type { TutorState } from '../../src/core/types.js';

function state(): TutorState {
  return {
    version: 1,
    repoPath: '/tmp/repo',
    goals: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    artifacts: [],
    concepts: [{ id: 'repo.auth', label: 'Auth flow', kind: 'repo_domain', description: 'Auth term', difficulty: 'beginner', parentIds: [], prerequisiteIds: [], relatedIds: [], evidence: [{ path: 'src/auth.ts', label: 'evidence' }] }],
    conceptStates: [{ conceptId: 'repo.auth', exposureCount: 1, activeRecallCount: 0, correctCount: 0, failedCount: 0, hintCount: 0, masteryEstimate: 0.2, confidence: 0.2, importance: 0.6, repoRelevance: 0.5 }],
    learningItems: [{ id: 'item_auth', conceptId: 'repo.auth', type: 'explain_back', title: 'Auth flow in your recent work', bodyMarkdown: 'body', prompt: 'Explain auth clearly from evidence.', expectedFocus: ['auth'], evidence: [{ path: 'src/auth.ts', label: 'evidence' }], difficulty: 'beginner', createdAt: '2026-01-01T00:00:00.000Z' }],
    learningEvents: [],
    corrections: [],
    manualRatings: [],
  };
}

describe('manual ratings', () => {
  it('records card ratings without changing learner events', () => {
    const next = recordManualRating(state(), { targetType: 'card', targetId: 'item_auth', answerability: 5, usefulness: 4, note: 'clear prompt' });
    expect(next.manualRatings).toHaveLength(1);
    expect(next.manualRatings[0]?.conceptId).toBe('repo.auth');
    expect(next.manualRatings[0]?.usefulness).toBe(4);
    expect(next.learningEvents).toHaveLength(0);
  });

  it('records concept ratings and renders averages', () => {
    const next = recordManualRating(state(), { targetType: 'concept', targetId: 'repo.auth', relevance: 5, evidence: 4, repeatability: 3 });
    const summary = renderManualRatingSummary(next);
    expect(summary).toContain('Ratings: 1');
    expect(summary).toContain('Average relevance: 5.0/5');
    expect(summary).toContain('Auth flow');
  });

  it('rejects unknown targets and out-of-range scores', () => {
    expect(() => recordManualRating(state(), { targetType: 'card', targetId: 'missing', usefulness: 4 })).toThrow('Unknown learning item');
    expect(() => recordManualRating(state(), { targetType: 'concept', targetId: 'repo.auth', relevance: 6 })).toThrow('1 to 5');
    expect(() => recordManualRating(state(), { targetType: 'concept', targetId: 'repo.auth' })).toThrow('at least one');
  });
});
