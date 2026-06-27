import { describe, expect, it } from 'vitest';

import { upsertCourse } from '../../src/core/courses.js';
import { buildEvidenceTimeline } from '../../src/core/evidenceTimeline.js';
import { generateCardBatch, mergeLearningState } from '../../src/core/planner.js';
import { draftQuestionsForCourse, updateQuestionStatus } from '../../src/core/questions.js';
import { createEmptyState } from '../../src/core/store.js';
import type { CommitArtifact, Concept } from '../../src/core/types.js';

const artifact: CommitArtifact = {
  id: 'a1',
  type: 'commit',
  externalId: 'abc123',
  title: 'document auth and code',
  body: '',
  changedFiles: ['src/auth/session.ts', 'docs/auth.md'],
  committedAt: '2026-01-01T00:00:00.000Z',
  diff: 'diff --git a/src/auth/session.ts b/src/auth/session.ts\n@@ -1 +1 @@\n+export function auth() { return true; }\ndiff --git a/docs/auth.md b/docs/auth.md\n@@ -1 +1 @@\n+# Auth docs',
};

const concept: Concept = {
  id: 'security.auth_boundary',
  label: 'Auth boundary',
  kind: 'security',
  description: 'Auth decisions',
  difficulty: 'advanced',
  parentIds: [],
  prerequisiteIds: [],
  relatedIds: [],
  evidence: [
    { commit: 'abc123', path: 'src/auth/session.ts', label: 'auth source', snippet: '@@ -1 +1 @@\n+export function auth() { return true; }' },
    { commit: 'abc123', path: 'docs/auth.md', label: 'auth docs', snippet: '@@ -1 +1 @@\n+# Auth docs' },
  ],
};

describe('courses, question bank, and evidence timeline', () => {
  it('creates a course, drafts fake LLM questions, accepts one, and uses it for generated cards', () => {
    const base = mergeLearningState(createEmptyState('/repo'), [artifact], [concept]);
    const withCourse = upsertCourse(base, {
      id: 'learn-auth',
      title: 'Learn auth architecture',
      goal: 'Understand auth from code and docs',
      materialPaths: ['src/auth/**'],
      docPaths: ['docs/**'],
      conceptIds: ['security.auth_boundary'],
    });
    const drafted = draftQuestionsForCourse(withCourse, { courseId: 'learn-auth', provider: 'fake', count: 1 });
    const draft = drafted.questionBank[0]!;
    const accepted = updateQuestionStatus(drafted, draft.id, 'accepted');
    const generated = generateCardBatch(accepted, undefined, { courseId: 'learn-auth', count: 1, mode: 'more' });
    const card = generated.learningItems.at(-1)!;

    expect(generated.courses[0]?.goal).toContain('Understand auth');
    expect(generated.questionDraftBatches[0]?.networkUsed).toBe(false);
    expect(generated.questionBank[0]?.status).toBe('accepted');
    expect(card.courseId).toBe('learn-auth');
    expect(card.questionId).toBe(draft.id);
    expect(card.prompt).toBe(draft.prompt);
  });

  it('builds timeline and graph nodes for docs, courses, questions, cards, and commits', () => {
    const base = mergeLearningState(createEmptyState('/repo'), [artifact], [concept]);
    const withCourse = upsertCourse(base, { id: 'learn-auth', title: 'Learn auth', goal: 'Auth goal', docPaths: ['docs/**'], materialPaths: ['src/auth/**'] });
    const drafted = draftQuestionsForCourse(withCourse, { courseId: 'learn-auth', provider: 'fake', count: 1 });
    const accepted = updateQuestionStatus(drafted, drafted.questionBank[0]!.id, 'accepted');
    const generated = generateCardBatch(accepted, undefined, { courseId: 'learn-auth', count: 1, mode: 'more' });

    const timeline = buildEvidenceTimeline(generated);

    expect(timeline.summary.commit).toBeGreaterThan(0);
    expect(timeline.summary.doc).toBeGreaterThan(0);
    expect(timeline.summary.course).toBe(1);
    expect(timeline.summary.question).toBe(1);
    expect(timeline.summary.card).toBeGreaterThan(0);
    expect(timeline.edges.some((edge) => edge.type === 'uses_evidence')).toBe(true);
  });

  it('rejects remote question drafting until privacy opt-in exists', () => {
    const state = mergeLearningState(createEmptyState('/repo'), [artifact], [concept]);
    expect(() => draftQuestionsForCourse(state, { provider: 'remote' })).toThrow(/privacy preview/);
  });
});
