import { describe, expect, it } from 'vitest';

import { recordReviewEvent } from '../../src/core/events.js';
import { activeLearningItems, generateCardBatch, mergeLearningState, recordAnswer } from '../../src/core/planner.js';
import { createEmptyState } from '../../src/core/store.js';
import type { CommitArtifact, Concept } from '../../src/core/types.js';

const artifact: CommitArtifact = { id: 'a1', type: 'commit', externalId: 'abc123', title: 'commit', body: '', changedFiles: ['src/auth.ts'], diff: '+auth' };
const concept: Concept = { id: 'security.auth_boundary', label: 'Auth boundary', kind: 'security', description: 'Auth decisions', difficulty: 'advanced', parentIds: [], prerequisiteIds: [], relatedIds: [], evidence: [{ commit: 'abc123', path: 'src/auth.ts', label: 'auth', snippet: '+if (!session) return forbidden();' }] };

describe('planner', () => {
  it('creates concept state and learning cards', () => {
    const state = mergeLearningState(createEmptyState('/repo'), [artifact], [concept]);
    expect(state.conceptStates).toHaveLength(1);
    expect(state.learningItems[0]?.type).toBe('spot_risk');
    expect(state.learningItems[0]?.questionPlane).toBe('risk_and_tests');
    expect(state.learningItems[0]?.snippet.code).toContain('session');
    expect(state.learningItems[0]?.expectedFocus).toContain('failure mode');
    expect(state.learningItems[0]?.whyShown).toContain('Snippet-first');
    expect(state.learningItems[0]?.bodyMarkdown).toContain('Code snippet');
    expect(state.learningItems[0]?.quality?.verdict).toMatch(/ready|needs_review/);
  });

  it('does not generate cards without evidence', () => {
    const noEvidence = { ...concept, id: 'repo.empty', evidence: [] };
    const state = mergeLearningState(createEmptyState('/repo'), [artifact], [noEvidence]);
    expect(state.concepts).toHaveLength(1);
    expect(state.learningItems).toHaveLength(0);
  });

  it('prefers source and test evidence over docs in prompts', () => {
    const noisyEvidence: Concept = {
      ...concept,
      evidence: [
        { commit: 'abc123', path: 'README.md', label: 'docs' },
        { commit: 'abc123', path: 'src/auth.ts', label: 'source' },
        { commit: 'abc123', path: 'tests/auth.test.ts', label: 'test' },
      ],
    };
    const state = mergeLearningState(createEmptyState('/repo'), [artifact], [noisyEvidence]);
    expect(state.learningItems[0]?.prompt).toContain('src/auth.ts');
    expect(state.learningItems[0]?.evidence[0]?.path).toBe('src/auth.ts');
  });

  it('fences preserved unified snippets as diff even for markdown paths', () => {
    const docsDiff: Concept = {
      ...concept,
      id: 'repo.timeline',
      kind: 'repo_domain',
      evidence: [{
        commit: 'abc123',
        path: 'docs/agent/TIMELINE.md',
        label: 'timeline evidence',
        snippet: '@@ -1,2 +1,3 @@\n # Timeline\n-old\n+new\n+preserved docs evidence',
      }],
    };
    const state = mergeLearningState(createEmptyState('/repo'), [artifact], [docsDiff]);
    const item = state.learningItems[0];

    expect(item?.snippet.language).toBe('diff');
    expect(item?.snippet.code).toContain('@@');
    expect(item?.bodyMarkdown).toContain('```diff');
  });

  it('records explain-back answers and adjusts mastery', () => {
    const state = mergeLearningState(createEmptyState('/repo'), [artifact], [concept]);
    const item = state.learningItems[0]!;
    const next = recordAnswer(state, item.id, 'The auth boundary controls who can access the route.', true);
    expect(next.learningEvents).toHaveLength(1);
    expect(next.conceptStates[0]!.correctCount).toBe(1);
    expect(next.conceptStates[0]!.masteryEstimate).toBeGreaterThan(state.conceptStates[0]!.masteryEstimate);
  });

  it('generates new flashcard batches without deleting card history', () => {
    const state = mergeLearningState(createEmptyState('/repo'), [artifact], [concept]);
    const firstItem = activeLearningItems(state)[0]!;
    const more = generateCardBatch(state, undefined, { count: 1, mode: 'more' });
    expect(activeLearningItems(more).length).toBe(2);
    expect(more.cardBatches).toHaveLength(2);
    const regenerated = generateCardBatch(more, undefined, { count: 1, mode: 'regenerate' });
    expect(regenerated.learningItems.find((item) => item.id === firstItem.id)?.status).toBe('archived');
    expect(activeLearningItems(regenerated)).toHaveLength(1);
    expect(regenerated.learningItems.length).toBeGreaterThan(activeLearningItems(regenerated).length);
  });

  it('does not add blocked low-quality accepted questions to active review', () => {
    const state = mergeLearningState(createEmptyState('/repo'), [artifact], [concept]);
    const withBadQuestion = {
      ...state,
      questionBank: [{
        id: 'q_bad',
        conceptId: concept.id,
        questionPlane: 'risk_and_tests' as const,
        prompt: 'Explain this.',
        expectedAnswer: '',
        expectedFocus: [],
        difficulty: 'advanced' as const,
        evidence: concept.evidence,
        status: 'accepted' as const,
        author: { type: 'deterministic' as const, provider: 'fake' as const, promptVersion: 'test' },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }],
    };

    const regenerated = generateCardBatch(withBadQuestion, undefined, { count: 1, mode: 'regenerate' });
    expect(activeLearningItems(regenerated)).toHaveLength(0);
    expect(regenerated.cardBatches.at(-1)?.requestedCount).toBe(1);
    expect(regenerated.cardBatches.at(-1)?.itemIds).toEqual([]);
  });

  it('blocks regenerated cards that reuse evidence the learner marked wrong', () => {
    const state = mergeLearningState(createEmptyState('/repo'), [artifact], [concept]);
    const item = activeLearningItems(state)[0]!;
    const withWrongEvidence = recordReviewEvent(state, { itemId: item.id, eventType: 'marked_wrong_evidence' });

    const regenerated = generateCardBatch(withWrongEvidence, undefined, { count: 1, mode: 'regenerate' });

    expect(activeLearningItems(regenerated)).toHaveLength(0);
    expect(regenerated.cardBatches.at(-1)?.itemIds).toEqual([]);
  });

  it('still blocks legacy path-only evidence without snippets by path', () => {
    const legacyConcept = { ...concept, evidence: [{ commit: 'abc123', path: 'src/auth.ts', label: 'auth' }] };
    const state = mergeLearningState(createEmptyState('/repo'), [artifact], [legacyConcept]);
    const item = activeLearningItems(state)[0]!;
    const withWrongEvidence = recordReviewEvent(state, { itemId: item.id, eventType: 'marked_wrong_evidence' });

    const regenerated = generateCardBatch(withWrongEvidence, undefined, { count: 1, mode: 'regenerate' });

    expect(activeLearningItems(regenerated)).toHaveLength(0);
    expect(regenerated.cardBatches.at(-1)?.itemIds).toEqual([]);
  });

  it('allows regenerated cards to use the same path when the rejected evidence snippet changed', () => {
    const state = mergeLearningState(createEmptyState('/repo'), [artifact], [concept]);
    const item = activeLearningItems(state)[0]!;
    const withWrongEvidence = recordReviewEvent(state, { itemId: item.id, eventType: 'marked_wrong_evidence' });
    const changedEvidence = {
      ...concept,
      evidence: [{ commit: 'abc123', path: 'src/auth.ts', label: 'auth', snippet: '+return user.permissions.includes("billing");' }],
    };
    const withChangedEvidence = {
      ...withWrongEvidence,
      concepts: withWrongEvidence.concepts.map((candidate) => candidate.id === concept.id ? changedEvidence : candidate),
    };

    const regenerated = generateCardBatch(withChangedEvidence, undefined, { count: 1, mode: 'regenerate' });

    expect(activeLearningItems(regenerated)).toHaveLength(1);
    expect(activeLearningItems(regenerated)[0]?.snippet.code).toContain('permissions');
  });

  it('regenerates prior bad-card concepts as needs-review instead of ready', () => {
    const state = mergeLearningState(createEmptyState('/repo'), [artifact], [concept]);
    const item = activeLearningItems(state)[0]!;
    const withBadCardFeedback = recordReviewEvent(state, { itemId: item.id, eventType: 'marked_bad_card' });

    const regenerated = generateCardBatch(withBadCardFeedback, undefined, { count: 1, mode: 'regenerate' });
    const nextItem = activeLearningItems(regenerated)[0];

    expect(nextItem?.quality?.verdict).toBe('needs_review');
    expect(nextItem?.quality?.warnings).toContain('prior bad-card feedback');
  });
});
