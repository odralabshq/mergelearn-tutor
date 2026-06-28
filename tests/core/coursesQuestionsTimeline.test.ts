import { describe, expect, it, vi } from 'vitest';

import { upsertCourse } from '../../src/core/courses.js';
import { buildEvidenceTimeline } from '../../src/core/evidenceTimeline.js';
import { buildHistoryActivity } from '../../src/core/historyActivity.js';
import type { LlmClient } from '../../src/core/llmClient.js';
import { generateCardBatch, mergeLearningState } from '../../src/core/planner.js';
import { DEFAULT_PRIVACY_CONFIG, type PrivacyConfig } from '../../src/core/privacy.js';
import { draftQuestionsForCourse, updateQuestionStatus, validateQuestionPlane } from '../../src/core/questions.js';
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
  diff: 'diff',
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
    { commit: 'abc123', path: 'src/auth/session.ts', label: 'auth source', snippet: 'export function auth() {}' },
    { commit: 'abc123', path: 'docs/auth.md', label: 'auth docs', snippet: '# Auth docs' },
  ],
};

const consentPrivacy: PrivacyConfig = {
  ...DEFAULT_PRIVACY_CONFIG,
  network: { enabled: true, consentToSend: true, provider: 'remote' },
};

describe('courses, question bank, and evidence timeline', () => {
  it('creates a course, drafts fake LLM questions, accepts one, and uses it for generated cards', async () => {
    const base = mergeLearningState(createEmptyState('/repo'), [artifact], [concept]);
    const withCourse = upsertCourse(base, {
      id: 'learn-auth',
      title: 'Learn auth architecture',
      goal: 'Understand auth from code and docs',
      materialPaths: ['src/auth/**'],
      docPaths: ['docs/**'],
      conceptIds: ['security.auth_boundary'],
    });
    const drafted = await draftQuestionsForCourse(withCourse, { courseId: 'learn-auth', provider: 'fake', count: 1 });
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
    expect(draft.shortAnswer).toBeTruthy();
  });

  it('builds timeline and graph nodes for docs, courses, questions, cards, and commits', async () => {
    const base = mergeLearningState(createEmptyState('/repo'), [artifact], [concept]);
    const withCourse = upsertCourse(base, { id: 'learn-auth', title: 'Learn auth', goal: 'Auth goal', docPaths: ['docs/**'], materialPaths: ['src/auth/**'] });
    const drafted = await draftQuestionsForCourse(withCourse, { courseId: 'learn-auth', provider: 'fake', count: 1 });
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

  it('excludes event nodes when includeEvents is false', async () => {
    const base = mergeLearningState(createEmptyState('/repo'), [artifact], [concept]);
    const drafted = await draftQuestionsForCourse(base, { provider: 'fake', count: 1 });
    const generated = generateCardBatch(drafted, undefined, { count: 1, mode: 'more' });
    generated.learningEvents.push({
      id: 'evt1',
      itemId: generated.learningItems.at(-1)!.id,
      conceptId: concept.id,
      eventType: 'answered',
      correct: true,
      createdAt: '2026-01-02T00:00:00.000Z',
    });
    const withEvents = buildEvidenceTimeline(generated, { includeEvents: true });
    const withoutEvents = buildEvidenceTimeline(generated, { includeEvents: false });
    expect(withEvents.summary.event).toBeGreaterThan(0);
    expect(withoutEvents.summary.event ?? 0).toBe(0);
  });

  it('filters timeline to a course subgraph', async () => {
    const base = mergeLearningState(createEmptyState('/repo'), [artifact], [concept]);
    const withCourse = upsertCourse(base, { id: 'learn-auth', title: 'Learn auth', goal: 'Auth goal', docPaths: ['docs/**'], materialPaths: ['src/auth/**'], conceptIds: ['security.auth_boundary'] });
    const other = upsertCourse(withCourse, { id: 'other', title: 'Other', goal: 'Other goal', docPaths: ['other/**'] });
    const scoped = buildEvidenceTimeline(other, { includeEvents: false, courseId: 'learn-auth' });
    expect(scoped.summary.course).toBe(1);
    expect(scoped.nodes.some((node) => node.id === 'course:learn-auth')).toBe(true);
    expect(scoped.nodes.some((node) => node.id === 'course:other')).toBe(false);
  });

  it('rejects remote question drafting without privacy consent', async () => {
    const state = mergeLearningState(createEmptyState('/repo'), [artifact], [concept]);
    await expect(draftQuestionsForCourse(state, { provider: 'remote' })).rejects.toThrow(/consentToSend|network/);
  });

  it('drafts remote questions with mocked LLM client when consent is enabled', async () => {
    const state = mergeLearningState(createEmptyState('/repo'), [artifact], [concept]);
    const llmClient: LlmClient = {
      completeJson: vi.fn().mockResolvedValue({
        prompt: 'From src/auth/session.ts, what security boundary does auth enforce for session handling?',
        shortAnswer: 'It gates access before sensitive session state is exposed.',
        deepExplanation: 'The auth helper in src/auth/session.ts is the first check before session data is read or mutated.',
        questionPlane: 'risk_and_tests',
        expectedFocus: ['Auth boundary', 'src/auth/session.ts'],
      }),
    };
    const drafted = await draftQuestionsForCourse(state, {
      provider: 'remote',
      count: 1,
      privacyConfig: consentPrivacy,
      llmClient,
    });
    const entry = drafted.questionBank.at(-1)!;
    expect(drafted.questionDraftBatches.at(-1)?.networkUsed).toBe(true);
    expect(entry.author.provider).toBe('remote');
    expect(entry.shortAnswer).toContain('gates access');
    expect(entry.deepExplanation).toContain('auth helper');
    expect(entry.questionPlane).toBe('risk_and_tests');
  });

  it('validates question plane against concept kind', () => {
    expect(validateQuestionPlane('not_a_plane', concept)).toBe('risk_and_tests');
    expect(validateQuestionPlane('language_mechanics', concept)).toBe('risk_and_tests');
    const domainConcept = { ...concept, kind: 'repo_domain' as const };
    expect(validateQuestionPlane('repo_domain', domainConcept)).toBe('repo_domain');
  });

  it('builds paginated history activity from learning events', () => {
    const state = mergeLearningState(createEmptyState('/repo'), [artifact], [concept]);
    state.learningEvents = [
      { id: 'e1', itemId: 'item1', conceptId: concept.id, eventType: 'revealed', createdAt: '2026-01-03T00:00:00.000Z' },
      { id: 'e2', itemId: 'item1', conceptId: concept.id, eventType: 'answered', correct: true, createdAt: '2026-01-02T00:00:00.000Z' },
    ];
    const page = buildHistoryActivity(state, { limit: 1, offset: 0 });
    expect(page.total).toBe(2);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.eventType).toBe('revealed');
  });
});
