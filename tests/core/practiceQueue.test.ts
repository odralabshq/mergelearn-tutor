import { describe, expect, it } from 'vitest';

import {
  buildPracticeQueue,
  isPracticeSessionComplete,
  nextUnreviewedInSession,
  resolvePracticeIndex,
  sortPracticeQueue,
} from '../../src/core/practiceQueue.js';
import type { LearningItem, TutorState } from '../../src/core/types.js';

function item(id: string, createdAt: string, batchId?: string): LearningItem {
  return {
    id,
    conceptId: `concept.${id}`,
    type: 'explain_back',
    questionPlane: 'local_behavior',
    title: `title ${id}`,
    snippet: { path: `src/${id}.ts`, label: 'evidence', language: 'typescript', code: `export const ${id} = true;` },
    bodyMarkdown: `body ${id}`,
    prompt: `Prompt for ${id}?`,
    explanationMarkdown: `Answer ${id}.`,
    expectedFocus: ['focus'],
    whyShown: 'test',
    evidence: [{ path: `src/${id}.ts`, label: 'evidence' }],
    difficulty: 'beginner',
    createdAt,
    status: 'active',
    batchId,
    generation: 1,
    source: 'ingest',
  };
}

function state(items: LearningItem[], events: TutorState['learningEvents'] = []): TutorState {
  return {
    version: 1,
    repoPath: '/repo',
    goals: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    artifacts: [],
    concepts: [],
    conceptStates: [],
    learningItems: items,
    cardBatches: [{ id: 'batch_a', mode: 'more', requestedCount: 2, itemIds: ['a', 'b'], archivedItemIds: [], createdAt: '2026-01-01T00:00:00.000Z' }],
    courses: [],
    questionBank: [],
    questionDraftBatches: [],
    learningEvents: events,
    corrections: [],
    manualRatings: [],
  };
}

describe('practiceQueue', () => {
  it('sorts unreviewed cards before globally reviewed ones', () => {
    const queue = sortPracticeQueue(state(
      [item('a', '2026-01-01T00:00:00.000Z', 'batch_a'), item('b', '2026-01-02T00:00:00.000Z', 'batch_a')],
      [{ id: 'e1', itemId: 'a', conceptId: 'concept.a', eventType: 'marked_correct', createdAt: '2026-01-03T00:00:00.000Z' }],
    ));
    expect(queue.map((entry) => entry.id)).toEqual(['b', 'a']);
  });

  it('resolves the next unreviewed card in session when index is omitted', () => {
    const queue = sortPracticeQueue(state([item('a', '2026-01-01T00:00:00.000Z'), item('b', '2026-01-02T00:00:00.000Z')]));
    expect(resolvePracticeIndex(queue, undefined, ['a'])).toBe(1);
    expect(nextUnreviewedInSession(queue, ['a'])).toBe(1);
  });

  it('skips session-reviewed cards even when an explicit index is requested', () => {
    const queue = sortPracticeQueue(state([item('a', '2026-01-01T00:00:00.000Z'), item('b', '2026-01-02T00:00:00.000Z')]));
    expect(resolvePracticeIndex(queue, 0, ['a'])).toBe(1);
  });

  it('detects when every card in the queue was reviewed this session', () => {
    const tutorState = state([item('a', '2026-01-01T00:00:00.000Z'), item('b', '2026-01-02T00:00:00.000Z')]);
    const queue = sortPracticeQueue(tutorState);
    expect(isPracticeSessionComplete(queue, ['a', 'b'])).toBe(true);
    expect(buildPracticeQueue(tutorState, { reviewedInSession: ['a'] }).index).toBe(1);
  });

  it('simulates post-grade advance without repeating the card just reviewed', () => {
    const tutorState = state([item('a', '2026-01-01T00:00:00.000Z'), item('b', '2026-01-02T00:00:00.000Z')]);
    const afterGrade = state(
      tutorState.learningItems,
      [{ id: 'e1', itemId: 'a', conceptId: 'concept.a', eventType: 'answered', createdAt: '2026-01-03T00:00:00.000Z' }],
    );
    const queue = sortPracticeQueue(afterGrade);
    expect(queue.map((entry) => entry.id)).toEqual(['b', 'a']);
    const reviewedInSession = ['a'];
    const nextIndex = resolvePracticeIndex(queue, undefined, reviewedInSession);
    expect(queue[nextIndex]?.id).toBe('b');
    expect(queue[nextIndex]?.id).not.toBe('a');
  });
});
