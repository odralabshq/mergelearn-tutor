import { describe, expect, it } from 'vitest';

import { mergeLearningState } from '../../src/core/planner.js';
import { renderKnowledgeDebt, renderMermaidMap, renderToday } from '../../src/core/render.js';
import { createEmptyState } from '../../src/core/store.js';
import type { CommitArtifact, Concept } from '../../src/core/types.js';

const artifact: CommitArtifact = { id: 'a1', type: 'commit', externalId: 'abc123', title: 'commit', body: '', changedFiles: ['src/auth.ts'], diff: '+auth' };
const concept: Concept = { id: 'security.auth_boundary', label: 'Auth boundary', kind: 'security', description: 'Auth decisions', difficulty: 'advanced', parentIds: ['security'], prerequisiteIds: [], relatedIds: [], evidence: [{ commit: 'abc123', path: 'src/auth.ts', label: 'auth' }] };

describe('renderers', () => {
  it('renders today, debt, and mermaid outputs', () => {
    const state = mergeLearningState(createEmptyState('/repo'), [artifact], [concept]);
    const today = renderToday(state);
    expect(today).toContain("Today's 5-minute review");
    expect(today).toContain('Why: Shown because');
    expect(renderKnowledgeDebt(state)).toContain('Auth boundary');
    expect(renderMermaidMap(state)).toContain('graph TD');
  });
});
