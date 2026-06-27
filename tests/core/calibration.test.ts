import { describe, expect, it } from 'vitest';

import { summarizeCalibration } from '../../src/core/calibration.js';
import type { TutorState } from '../../src/core/types.js';

function state(events: TutorState['learningEvents']): TutorState {
  return {
    version: 1,
    repoPath: '/repo',
    goals: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    artifacts: [],
    concepts: [],
    conceptStates: [],
    learningItems: [],
    cardBatches: [],
    courses: [],
    questionBank: [],
    questionDraftBatches: [],
    learningEvents: events,
    corrections: [],
    manualRatings: [],
  };
}

describe('calibration summary', () => {
  it('pairs pre-reveal confidence with later answer correctness', () => {
    const summary = summarizeCalibration(state([
      { id: 'e1', itemId: 'item_a', conceptId: 'repo.auth', eventType: 'revealed', confidenceBeforeReveal: 5, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'e2', itemId: 'item_a', conceptId: 'repo.auth', eventType: 'answered', correct: true, createdAt: '2026-01-01T00:01:00.000Z' },
      { id: 'e3', itemId: 'item_b', conceptId: 'repo.cli', eventType: 'revealed', confidenceBeforeReveal: 5, createdAt: '2026-01-01T00:02:00.000Z' },
      { id: 'e4', itemId: 'item_b', conceptId: 'repo.cli', eventType: 'answered', correct: false, createdAt: '2026-01-01T00:03:00.000Z' },
    ]));

    expect(summary.pairedCount).toBe(2);
    expect(summary.averageConfidence).toBe(1);
    expect(summary.accuracy).toBe(0.5);
    expect(summary.brierScore).toBe(0.5);
    expect(summary.overconfidenceGap).toBe(0.5);
  });
});
