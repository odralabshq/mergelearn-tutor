import { describe, expect, it } from 'vitest';

import { evaluateCardQuality } from '../../src/core/cardQuality.js';
import { generateCardBatch, mergeLearningState } from '../../src/core/planner.js';
import { draftQuestionsForCourse, updateQuestionStatus } from '../../src/core/questions.js';
import { createEmptyState } from '../../src/core/store.js';
import type { CommitArtifact, Concept, LearningItem, QuestionBankEntry } from '../../src/core/types.js';

const artifact: CommitArtifact = {
  id: 'a1',
  type: 'commit',
  externalId: 'abc123',
  title: 'auth',
  body: '',
  changedFiles: ['src/auth.ts'],
  diff: 'diff',
};

const concept: Concept = {
  id: 'repo.auth',
  label: 'auth',
  kind: 'repo_domain',
  description: 'auth',
  difficulty: 'beginner',
  parentIds: [],
  prerequisiteIds: [],
  relatedIds: [],
  evidence: [{ path: 'src/auth.ts', label: 'auth' }],
};

describe('rich cards from accepted questions', () => {
  it('inherits shortAnswer and deepExplanation into generated cards', async () => {
    const base = mergeLearningState(createEmptyState('/repo'), [artifact], [concept]);
    const drafted = await draftQuestionsForCourse(base, { provider: 'fake', count: 1 });
    const draft = drafted.questionBank[0]!;
    const accepted = updateQuestionStatus(drafted, draft.id, 'accepted');
    const generated = generateCardBatch(accepted, undefined, { count: 1, mode: 'more' });
    const card = generated.learningItems.at(-1)!;
    expect(card.explanationMarkdown).toBe(draft.shortAnswer ?? draft.expectedAnswer);
    expect(card.bodyMarkdown).toBe(draft.deepExplanation);
  });

  it('warns when LLM question lacks deep explanation', () => {
    const item: LearningItem = {
      id: 'item1',
      conceptId: 'repo.auth',
      type: 'explain_back',
      questionPlane: 'local_behavior',
      title: 'auth',
      snippet: { path: 'src/auth.ts', label: 'auth', code: 'code' },
      bodyMarkdown: 'body',
      prompt: 'What does this auth helper do in src/auth.ts for session safety?',
      explanationMarkdown: 'Short answer here with enough length for quality scoring.',
      expectedFocus: ['auth', 'src/auth.ts'],
      evidence: [{ path: 'src/auth.ts', label: 'auth' }],
      difficulty: 'beginner',
      createdAt: '2026-01-01T00:00:00.000Z',
      status: 'active',
      generation: 1,
      source: 'manual_generate',
      questionId: 'q1',
    };
    const sourceQuestion: QuestionBankEntry = {
      id: 'q1',
      conceptId: 'repo.auth',
      questionPlane: 'local_behavior',
      prompt: item.prompt,
      expectedAnswer: 'answer',
      expectedFocus: item.expectedFocus,
      difficulty: 'beginner',
      evidence: item.evidence,
      status: 'accepted',
      author: { type: 'llm', provider: 'remote', promptVersion: 'v2' },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const quality = evaluateCardQuality(item, [], { sourceQuestion });
    expect(quality.warnings).toContain('missing deep explanation from LLM question');
  });
});
