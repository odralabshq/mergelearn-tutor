import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { saveState } from '../../src/core/store.js';
import type { TutorState } from '../../src/core/types.js';
import { startReviewServer } from '../../src/session/server.js';

function state(repoPath: string): TutorState {
  return {
    version: 1,
    repoPath,
    goals: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    artifacts: [],
    concepts: [{ id: 'repo.auth', label: 'auth', kind: 'repo_domain', description: 'Auth term', difficulty: 'beginner', parentIds: [], prerequisiteIds: [], relatedIds: [], evidence: [{ path: 'src/auth.ts', label: 'evidence' }] }],
    conceptStates: [{ conceptId: 'repo.auth', exposureCount: 1, activeRecallCount: 0, correctCount: 0, failedCount: 0, hintCount: 0, masteryEstimate: 0.2, confidence: 0.2, importance: 0.6, repoRelevance: 0.5 }],
    learningItems: [{ id: 'item_auth', conceptId: 'repo.auth', type: 'explain_back', title: 'auth in your recent work', bodyMarkdown: 'body', prompt: 'Explain auth clearly from evidence.', expectedFocus: ['auth'], whyShown: 'Shown because this is a test.', evidence: [{ path: 'src/auth.ts', label: 'evidence' }], difficulty: 'beginner', createdAt: '2026-01-01T00:00:00.000Z' }],
    learningEvents: [],
    corrections: [],
  };
}

describe('review session server', () => {
  it('serves cards and persists answer/feedback/correction actions', async () => {
    const repo = await mkdtemp(path.join(os.tmpdir(), 'mergelearn-tutor-session-'));
    await saveState(repo, state(repo));
    const review = await startReviewServer(repo, 0);
    try {
      const html = await fetch(review.url).then((res) => res.text());
      expect(html).toContain('MergeLearn Tutor Review');
      expect(html).toContain('Explain auth clearly');

      const answer = await fetch(`${review.url}/answer`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ itemId: 'item_auth', answer: 'Auth gates access to sensitive behavior.', correct: true }) }).then((res) => res.json()) as { ok: boolean; state: { events: number } };
      expect(answer.ok).toBe(true);
      expect(answer.state.events).toBe(1);

      const feedback = await fetch(`${review.url}/feedback`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ itemId: 'item_auth', eventType: 'marked_useful' }) }).then((res) => res.json()) as { ok: boolean; state: { events: number } };
      expect(feedback.ok).toBe(true);
      expect(feedback.state.events).toBe(2);

      const correction = await fetch(`${review.url}/correct`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ conceptId: 'repo.auth', correctionType: 'better_label', replacementLabel: 'session auth' }) }).then((res) => res.json()) as { ok: boolean; state: { corrections: number } };
      expect(correction.ok).toBe(true);
      expect(correction.state.corrections).toBe(1);
    } finally {
      await review.close();
    }
  });
});
