import { describe, expect, it } from 'vitest';

import { mergeLearningState, recordAnswer } from '../../src/core/planner.js';
import { createEmptyState } from '../../src/core/store.js';
import type { CommitArtifact, Concept } from '../../src/core/types.js';

const artifact: CommitArtifact = { id: 'a1', type: 'commit', externalId: 'abc123', title: 'commit', body: '', changedFiles: ['src/auth.ts'], diff: '+auth' };
const concept: Concept = { id: 'security.auth_boundary', label: 'Auth boundary', kind: 'security', description: 'Auth decisions', difficulty: 'advanced', parentIds: [], prerequisiteIds: [], relatedIds: [], evidence: [{ commit: 'abc123', path: 'src/auth.ts', label: 'auth' }] };

describe('planner', () => {
  it('creates concept state and learning cards', () => {
    const state = mergeLearningState(createEmptyState('/repo'), [artifact], [concept]);
    expect(state.conceptStates).toHaveLength(1);
    expect(state.learningItems[0]?.type).toBe('spot_risk');
    expect(state.learningItems[0]?.expectedFocus).toContain('access decision');
  });

  it('records explain-back answers and adjusts mastery', () => {
    const state = mergeLearningState(createEmptyState('/repo'), [artifact], [concept]);
    const item = state.learningItems[0]!;
    const next = recordAnswer(state, item.id, 'The auth boundary controls who can access the route.', true);
    expect(next.learningEvents).toHaveLength(1);
    expect(next.conceptStates[0]!.correctCount).toBe(1);
    expect(next.conceptStates[0]!.masteryEstimate).toBeGreaterThan(state.conceptStates[0]!.masteryEstimate);
  });
});
