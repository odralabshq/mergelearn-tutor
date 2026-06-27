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
    learningItems: [{ id: 'item_auth', conceptId: 'repo.auth', type: 'explain_back', questionPlane: 'local_behavior', title: 'src/auth.ts: auth', snippet: { path: 'src/auth.ts', label: 'evidence', language: 'typescript', code: 'export function auth() { return true; }' }, bodyMarkdown: 'body', prompt: 'What happens in this snippet?', explanationMarkdown: 'The function returns true.', expectedFocus: ['auth'], whyShown: 'Snippet-first local behavior card.', evidence: [{ path: 'src/auth.ts', label: 'evidence' }], difficulty: 'beginner', createdAt: '2026-01-01T00:00:00.000Z', status: 'active', generation: 1, source: 'ingest' }],
    cardBatches: [],
    learningEvents: [],
    corrections: [],
    manualRatings: [],
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
      expect(html).toContain('export function auth');
      expect(html).toContain('What happens in this snippet?');
      expect(html).toContain('Reveal explanation');
      expect(html).toContain('I knew it');
      expect(html).toContain('marked_bad_card');

      const progress = await fetch(`${review.url}/api/progress`).then((res) => res.json()) as { nodes: unknown[] };
      expect(progress.nodes.length).toBeGreaterThan(0);

      const historyHtml = await fetch(`${review.url}/history`).then((res) => res.text());
      expect(historyHtml).toContain('Card history and batches');
      expect(historyHtml).toContain('History JSON');

      const history = await fetch(`${review.url}/api/cards/history`).then((res) => res.json()) as { summary: { activeCards: number }; cards: unknown[]; batches: unknown[] };
      expect(history.summary.activeCards).toBe(1);
      expect(history.cards).toHaveLength(1);

      const preferences = await fetch(`${review.url}/api/preferences`).then((res) => res.json()) as { review: { mode: string } };
      expect(preferences.review.mode).toBe('snippet_first');

      const preferencesHtml = await fetch(`${review.url}/preferences`).then((res) => res.text());
      expect(preferencesHtml).toContain('Do you want language mechanics questions?');
      expect(preferencesHtml).toContain('Example: What could break');

      const updatedPrefs = await fetch(`${review.url}/api/preferences`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ review: { snippetLineCount: 8, showExplanationsByDefault: true } }) }).then((res) => res.json()) as { ok: boolean; preferences: { review: { snippetLineCount: number } } };
      expect(updatedPrefs.ok).toBe(true);
      expect(updatedPrefs.preferences.review.snippetLineCount).toBe(8);

      const generated = await fetch(`${review.url}/api/cards/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ count: 1, mode: 'more' }) }).then((res) => res.json()) as { ok: boolean; state: { activeCards: number; archivedCards: number } };
      expect(generated.ok).toBe(true);
      expect(generated.state.activeCards).toBe(2);

      const regenerated = await fetch(`${review.url}/api/cards/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ count: 1, mode: 'regenerate' }) }).then((res) => res.json()) as { ok: boolean; state: { activeCards: number; archivedCards: number } };
      expect(regenerated.ok).toBe(true);
      expect(regenerated.state.activeCards).toBe(1);
      expect(regenerated.state.archivedCards).toBeGreaterThan(0);

      const answer = await fetch(`${review.url}/answer`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ itemId: 'item_auth', answer: 'Auth gates access to sensitive behavior.', correct: true }) }).then((res) => res.json()) as { ok: boolean; state: { events: number } };
      expect(answer.ok).toBe(true);
      expect(answer.state.events).toBe(1);

      const feedback = await fetch(`${review.url}/feedback`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ itemId: 'item_auth', eventType: 'marked_useful' }) }).then((res) => res.json()) as { ok: boolean; state: { events: number } };
      expect(feedback.ok).toBe(true);
      expect(feedback.state.events).toBe(2);

      const badCard = await fetch(`${review.url}/feedback`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ itemId: 'item_auth', eventType: 'marked_bad_card' }) }).then((res) => res.json()) as { ok: boolean; state: { events: number } };
      expect(badCard.ok).toBe(true);
      expect(badCard.state.events).toBe(3);

      const correction = await fetch(`${review.url}/correct`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ conceptId: 'repo.auth', correctionType: 'better_label', replacementLabel: 'session auth' }) }).then((res) => res.json()) as { ok: boolean; state: { corrections: number } };
      expect(correction.ok).toBe(true);
      expect(correction.state.corrections).toBe(1);
    } finally {
      await review.close();
    }
  });
});
