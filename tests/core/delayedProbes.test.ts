import { describe, expect, it } from 'vitest';

import { completeDelayedProbe, dueDelayedProbes } from '../../src/core/delayedProbes.js';
import { recordReviewEvent } from '../../src/core/events.js';
import type { TutorState } from '../../src/core/types.js';

function state(): TutorState {
  return {
    version: 1,
    repoPath: '/tmp/repo',
    goals: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    artifacts: [],
    concepts: [{ id: 'repo.auth', label: 'auth', kind: 'repo_domain', description: 'Auth term', difficulty: 'beginner', parentIds: [], prerequisiteIds: [], relatedIds: [], evidence: [{ path: 'src/auth.ts', label: 'evidence' }] }],
    conceptStates: [{ conceptId: 'repo.auth', exposureCount: 1, activeRecallCount: 0, correctCount: 0, failedCount: 0, hintCount: 0, masteryEstimate: 0.2, confidence: 0.2, importance: 0.6, repoRelevance: 0.5 }],
    learningItems: [{ id: 'item_auth', conceptId: 'repo.auth', type: 'explain_back', questionPlane: 'local_behavior', title: 'auth in your recent work', snippet: { path: 'src/auth.ts', label: 'evidence', language: 'typescript', code: '+export function auth() { return true; }' }, bodyMarkdown: 'body', prompt: 'Explain auth clearly from evidence.', explanationMarkdown: 'Auth controls access.', expectedFocus: ['auth'], evidence: [{ path: 'src/auth.ts', label: 'evidence' }], difficulty: 'beginner', createdAt: '2026-01-01T00:00:00.000Z', status: 'active', generation: 1, source: 'ingest' }],
    cardBatches: [],
    courses: [],
    questionBank: [],
    questionDraftBatches: [],
    learningEvents: [],
    corrections: [],
    manualRatings: [],
    delayedProbes: [],
  };
}

describe('delayed recall probes', () => {
  it('schedules two delayed probes when a card is answered', () => {
    const next = recordReviewEvent(state(), { itemId: 'item_auth', eventType: 'answered', answerText: 'Auth gates access.', correct: true });

    expect(next.delayedProbes).toHaveLength(2);
    expect(next.delayedProbes.map((probe) => probe.intervalDays)).toEqual([2, 7]);
    expect(next.delayedProbes.every((probe) => probe.status === 'scheduled')).toBe(true);
    expect(next.delayedProbes[0]?.dueAt).toBeTruthy();
  });

  it('does not create duplicate delayed probes for the same answered card', () => {
    const once = recordReviewEvent(state(), { itemId: 'item_auth', eventType: 'answered', answerText: 'Auth gates access.', correct: true });
    const twice = recordReviewEvent(once, { itemId: 'item_auth', eventType: 'answered', answerText: 'Auth gates access again.', correct: true });

    expect(twice.delayedProbes).toHaveLength(2);
  });

  it('selects due probes and records delayed completions separately', () => {
    const scheduled = recordReviewEvent(state(), { itemId: 'item_auth', eventType: 'answered', answerText: 'Auth gates access.', correct: true });
    const due = dueDelayedProbes(scheduled, '2999-01-01T00:00:00.000Z');

    expect(due).toHaveLength(2);
    const completed = completeDelayedProbe(scheduled, { probeId: due[0]!.id, answerText: 'Still remember auth.', correct: true });

    expect(completed.delayedProbes.find((probe) => probe.id === due[0]!.id)?.status).toBe('completed');
    expect(completed.learningEvents.at(-1)).toMatchObject({
      eventType: 'delayed_probe_completed',
      itemId: 'item_auth',
      correct: true,
    });
  });
});
