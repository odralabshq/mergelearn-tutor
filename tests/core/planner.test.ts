import { describe, expect, it } from 'vitest';

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
});
