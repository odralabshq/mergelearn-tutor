import { describe, expect, it } from 'vitest';

import { addCorrection } from '../../src/core/events.js';
import { applyLexicon, parseLexicon, promoteCorrectionsToLexicon, type RepoLexicon } from '../../src/core/lexicon.js';
import { mergeLearningState } from '../../src/core/planner.js';
import { createEmptyState } from '../../src/core/store.js';
import type { CommitArtifact, Concept } from '../../src/core/types.js';

const artifact: CommitArtifact = {
  id: 'a1',
  type: 'commit',
  externalId: 'abc123',
  title: 'add tutor queue',
  body: '',
  changedFiles: ['src/core/queue.ts'],
  diff: 'diff --git a/src/core/queue.ts b/src/core/queue.ts\n+export function scheduleReviewJob() { return true; }',
};

const authConcept: Concept = {
  id: 'security.auth_boundary',
  label: 'Authentication and authorization boundaries',
  kind: 'security',
  description: 'Auth decisions',
  difficulty: 'advanced',
  parentIds: [],
  prerequisiteIds: [],
  relatedIds: [],
  evidence: [{ commit: 'abc123', path: 'docs/guides/auth.md', label: 'auth', snippet: '+auth docs' }],
};

describe('repo lexicon', () => {
  it('adds custom local concepts from path and term matches', () => {
    const lexicon = parseLexicon({
      concepts: [{ id: 'repo.review_queue', label: 'Review queue', terms: ['scheduleReviewJob'], pathPatterns: ['src/core/*'] }],
    });

    const concepts = applyLexicon([artifact], [], lexicon);

    expect(concepts.map((concept) => concept.id)).toContain('repo.review_queue');
    expect(concepts[0]?.evidence[0]?.path).toBe('src/core/queue.ts');
  });

  it('lets aliases override extracted labels', () => {
    const lexicon: RepoLexicon = { version: 1, concepts: [], aliases: [{ conceptId: authConcept.id, label: 'Session access gate' }], ignores: [] };

    const concepts = applyLexicon([artifact], [authConcept], lexicon);

    expect(concepts.find((concept) => concept.id === authConcept.id)?.label).toBe('Session access gate');
  });

  it('removes ignored noisy evidence and drops concepts without evidence', () => {
    const lexicon: RepoLexicon = { version: 1, concepts: [], aliases: [], ignores: [{ conceptId: authConcept.id, pathPattern: 'docs/**' }] };

    const concepts = applyLexicon([artifact], [authConcept], lexicon);

    expect(concepts.map((concept) => concept.id)).not.toContain(authConcept.id);
  });

  it('promotes corrections into aliases and ignore rules', () => {
    const state = mergeLearningState(createEmptyState('/repo'), [artifact], [authConcept]);
    const corrected = addCorrection(state, { targetId: authConcept.id, correctionType: 'better_label', replacementLabel: 'Session policy boundary' });
    const hidden = addCorrection(corrected, { targetId: 'repo.noisy', correctionType: 'not_useful', note: 'too vague' });

    const lexicon = promoteCorrectionsToLexicon(hidden, { version: 1, concepts: [], aliases: [], ignores: [] });

    expect(lexicon.aliases).toContainEqual(expect.objectContaining({ conceptId: authConcept.id, label: 'Session policy boundary' }));
    expect(lexicon.ignores).toContainEqual(expect.objectContaining({ conceptId: 'repo.noisy' }));
  });
});
