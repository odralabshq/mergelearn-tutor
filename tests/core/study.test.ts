import { describe, expect, it } from 'vitest';

import { assignStudyConditions, completePassiveReview, studySummary } from '../../src/core/study.js';
import type { LearningItem, TutorState } from '../../src/core/types.js';

function item(id: string, conceptId = `repo.${id}`): LearningItem {
  return { id, conceptId, type: 'explain_back', questionPlane: 'local_behavior', title: id, snippet: { path: `${id}.ts`, label: id, code: `export const ${id} = true;` }, bodyMarkdown: 'body', prompt: `Explain ${id}.`, explanationMarkdown: `${id} explained.`, expectedFocus: [id], evidence: [{ path: `${id}.ts`, label: id }], difficulty: 'beginner', createdAt: '2026-01-01T00:00:00.000Z', status: 'active', generation: 1, source: 'ingest' };
}

function state(): TutorState {
  return {
    version: 1, repoPath: '/tmp/repo', goals: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', artifacts: [], concepts: [], conceptStates: [],
    learningItems: [item('a'), item('b'), item('c'), item('d')], cardBatches: [], courses: [], questionBank: [], questionDraftBatches: [], learningEvents: [], delayedProbes: [], studyAssignments: [], corrections: [], manualRatings: [],
  };
}

describe('active-control study mode', () => {
  it('assigns active recall and passive-review controls deterministically', () => {
    const next = assignStudyConditions(state(), { seed: 'pilot', count: 4 });
    expect(next.studyAssignments).toHaveLength(4);
    expect(next.studyAssignments?.map((assignment) => assignment.condition)).toEqual(['mergelearn', 'active_control', 'mergelearn', 'active_control']);
    expect(studySummary(next)).toMatchObject({ total: 4, mergelearn: 2, activeControl: 2, completed: 0 });
  });

  it('does not duplicate assignments for the same seed and records passive review without mastery', () => {
    const assigned = assignStudyConditions(state(), { seed: 'pilot', count: 4 });
    const twice = assignStudyConditions(assigned, { seed: 'pilot', count: 4 });
    const passive = twice.studyAssignments?.find((assignment) => assignment.condition === 'active_control')!;
    const completed = completePassiveReview(twice, { assignmentId: passive.id, durationMs: 120000, note: 'read diff packet' });

    expect(twice.studyAssignments).toHaveLength(4);
    expect(completed.studyAssignments?.find((assignment) => assignment.id === passive.id)?.status).toBe('completed');
    expect(completed.learningEvents.at(-1)).toMatchObject({ eventType: 'passive_review_completed', itemId: passive.itemId });
    expect(studySummary(completed).completed).toBe(1);
  });
});
