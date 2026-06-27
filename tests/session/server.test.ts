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
    courses: [{ id: 'learn-auth', title: 'Learn auth', goal: 'Understand auth flow', enabledPlanes: ['local_behavior', 'repo_domain'], materialPaths: ['src/**'], docPaths: ['docs/**'], conceptIds: ['repo.auth'], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
    questionBank: [],
    questionDraftBatches: [],
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
      expect(html).toContain('Before reveal: how confident are you?');
      expect(html).toContain('Guessing');
      expect(html).toContain('Certain');
      expect(html).toContain('Quality gate');
      expect(html).toContain('Show quality scores');
      expect(html).toContain('class="quality-details"');
      expect(html).toContain('quality');
      expect(html).toContain('I knew it');
      expect(html).toContain('marked_bad_card');
      expect(html).toContain('Start here');
      expect(html).toContain('From empty repo to useful review cards');
      expect(html).toContain('1 course ready');
      expect(html).toContain('Open Questions');
      expect(html).toContain('Plan Builder');
      expect(html).toContain('/plan');
      expect(html).toContain('Review source');
      expect(html).toContain('All due repo evidence');
      expect(html).toContain('Learn auth · 0 accepted · 0 active');
      expect(html).toContain('Generate 5 focused cards');
      expect(html).toContain('Local learning workbench');
      expect(html).toContain('Current local plan snapshot');
      expect(html).toContain('id="shell-concepts"');
      expect(html).toContain('Primary navigation');
      expect(html).toContain('Workbench');
      expect(html).toContain('No remote LLM calls');

      const workbenchHtml = await fetch(`${review.url}/workbench`).then((res) => res.text());
      expect(workbenchHtml).toContain('Learning Workbench');
      expect(workbenchHtml).toContain('Interactive map');
      expect(workbenchHtml).toContain('data-action="workbench-filter"');
      expect(workbenchHtml).toContain('class="workbench-drawer"');
      expect(workbenchHtml).toContain('data-node-tags=');
      expect(workbenchHtml).toContain('data-node-detail=');
      const workbench = await fetch(`${review.url}/api/workbench`).then((res) => res.json()) as { metrics: { activeCards: number }; filters: Array<{ id: string; count: number }>; nodes: Array<{ tags: string[]; detail: string }> };
      expect(workbench.metrics.activeCards).toBe(1);
      expect(workbench.filters.length).toBeGreaterThan(0);
      expect(workbench.nodes.length).toBeGreaterThan(0);
      expect(workbench.nodes.every((node) => Array.isArray(node.tags) && node.detail.length > 0)).toBe(true);

      const planHtml = await fetch(`${review.url}/plan`).then((res) => res.text());
      expect(planHtml).toContain('Plan Builder connects setup to daily review');
      expect(planHtml).toContain('Local evidence source');
      expect(planHtml).toContain('Accepted questions');
      expect(planHtml).toContain('Local-only guardrails');
      expect(planHtml).toContain('Course snapshot');
      expect(planHtml).toContain('Learn auth');
      expect(planHtml).toContain('Plan Builder');

      const progress = await fetch(`${review.url}/api/progress`).then((res) => res.json()) as { nodes: unknown[] };
      expect(progress.nodes.length).toBeGreaterThan(0);

      const progressHtml = await fetch(`${review.url}/progress`).then((res) => res.text());
      expect(progressHtml).toContain('Progress guide');
      expect(progressHtml).toContain('What changes these numbers?');
      expect(progressHtml).toContain('Separate source scope from mastery');

      const historyHtml = await fetch(`${review.url}/history`).then((res) => res.text());
      expect(historyHtml).toContain('History without the wall of cards');
      expect(historyHtml).toContain('Source audit');
      expect(historyHtml).toContain('All due repo evidence cards');
      expect(historyHtml).toContain('Card-quality events');
      expect(historyHtml).toContain('Delayed probes due');
      expect(historyHtml).toContain('Recent activity');
      expect(historyHtml).toContain('Raw history JSON');

      const history = await fetch(`${review.url}/api/cards/history`).then((res) => res.json()) as { summary: { activeCards: number }; cards: unknown[]; batches: unknown[] };
      expect(history.summary.activeCards).toBe(1);
      expect(history.cards).toHaveLength(1);
      const initialCalibration = await fetch(`${review.url}/api/calibration`).then((res) => res.json()) as { pairedCount: number };
      expect(initialCalibration.pairedCount).toBe(0);

      const coursesHtml = await fetch(`${review.url}/courses`).then((res) => res.text());
      expect(coursesHtml).toContain('Courses organize goals');
      expect(coursesHtml).toContain('Course setup guide');
      expect(coursesHtml).toContain('Turn repo evidence into a focused track');
      expect(coursesHtml).toContain('title, e.g. Understand session auth');
      expect(coursesHtml).toContain('Learn auth');

      const questionsDraft = await fetch(`${review.url}/api/questions/draft`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ courseId: 'learn-auth', provider: 'fake', count: 1 }) }).then((res) => res.json()) as { ok: boolean; questions: { summary: { draft: number }; questions: Array<{ id: string }> } };
      expect(questionsDraft.ok).toBe(true);
      expect(questionsDraft.questions.summary.draft).toBe(1);
      const firstQuestion = questionsDraft.questions.questions[0]!;
      const accepted = await fetch(`${review.url}/api/questions/status`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: firstQuestion.id, status: 'accepted' }) }).then((res) => res.json()) as { ok: boolean; questions: { summary: { accepted: number } } };
      expect(accepted.ok).toBe(true);
      expect(accepted.questions.summary.accepted).toBe(1);

      const questionsHtml = await fetch(`${review.url}/questions`).then((res) => res.text());
      expect(questionsHtml).toContain('Evidence-bound LLM-style questions');
      expect(questionsHtml).toContain('Question workflow');
      expect(questionsHtml).toContain('Quality gate');
      expect(questionsHtml).toContain('Show quality scores');
      expect(questionsHtml).toContain('Evidence ');
      expect(questionsHtml).toContain('Draft, accept, then review');
      expect(questionsHtml).toContain('Target course');
      expect(questionsHtml).toContain('learn-auth');
      const timelineHtml = await fetch(`${review.url}/timeline`).then((res) => res.text());
      expect(timelineHtml).toContain('Provenance filters');
      expect(timelineHtml).toContain('Scan one evidence type at a time');
      expect(timelineHtml).toContain('data-action="timeline-filter"');
      expect(timelineHtml).toContain('data-node-type="question"');
      const timeline = await fetch(`${review.url}/api/evidence-timeline`).then((res) => res.json()) as { nodes: unknown[]; edges: unknown[] };
      expect(timeline.nodes.length).toBeGreaterThan(0);
      expect(timeline.edges.length).toBeGreaterThan(0);
      const graphHtml = await fetch(`${review.url}/graph`).then((res) => res.text());
      expect(graphHtml).toContain('Courses, docs, questions, cards');
      expect(graphHtml).toContain('Evidence graph map');
      expect(graphHtml).toContain('commit/doc/file → concept');
      expect(graphHtml).toContain('Graph focus');
      expect(graphHtml).toContain('Drill into one lane before reading raw JSON');
      expect(graphHtml).toContain('data-action="graph-filter"');
      expect(graphHtml).toContain('data-graph-type="question"');
      expect(graphHtml).toContain('Open graph JSON');
      expect(graphHtml).toContain('Raw graph projection');

      const preferences = await fetch(`${review.url}/api/preferences`).then((res) => res.json()) as { review: { mode: string } };
      expect(preferences.review.mode).toBe('snippet_first');

      const preferencesHtml = await fetch(`${review.url}/preferences`).then((res) => res.text());
      expect(preferencesHtml).toContain('Question preferences setup');
      expect(preferencesHtml).toContain('Setup wizard');
      expect(preferencesHtml).toContain('Start with a recommended mix');
      expect(preferencesHtml).toContain('Daily code comprehension');
      expect(preferencesHtml).toContain('Risk and test review');
      expect(preferencesHtml).toContain('Repo onboarding');
      expect(preferencesHtml).toContain('data-action="preferences-preset"');
      expect(preferencesHtml).toContain('Back to Plan Builder');
      expect(preferencesHtml).toContain('Draft questions next');
      expect(preferencesHtml).toContain('Language mechanics');
      expect(preferencesHtml).toContain('Example: What could break');

      const updatedPrefs = await fetch(`${review.url}/api/preferences`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ review: { snippetLineCount: 8, showExplanationsByDefault: true } }) }).then((res) => res.json()) as { ok: boolean; preferences: { review: { snippetLineCount: number } } };
      expect(updatedPrefs.ok).toBe(true);
      expect(updatedPrefs.preferences.review.snippetLineCount).toBe(8);

      const generated = await fetch(`${review.url}/api/cards/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ count: 1, mode: 'more', courseId: 'learn-auth' }) }).then((res) => res.json()) as { ok: boolean; state: { activeCards: number; archivedCards: number } };
      expect(generated.ok).toBe(true);
      expect(generated.state.activeCards).toBe(2);
      const courseHistory = await fetch(`${review.url}/api/cards/history`).then((res) => res.json()) as { cards: Array<{ courseId?: string; questionId?: string }> };
      expect(courseHistory.cards.some((card) => card.courseId === 'learn-auth' && card.questionId === firstQuestion.id)).toBe(true);
      const focusedReviewHtml = await fetch(review.url).then((res) => res.text());
      expect(focusedReviewHtml).toContain('course learn-auth');
      expect(focusedReviewHtml).toContain('accepted question');

      const regenerated = await fetch(`${review.url}/api/cards/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ count: 1, mode: 'regenerate' }) }).then((res) => res.json()) as { ok: boolean; state: { activeCards: number; archivedCards: number } };
      expect(regenerated.ok).toBe(true);
      expect(regenerated.state.activeCards).toBe(1);
      expect(regenerated.state.archivedCards).toBeGreaterThan(0);

      const reveal = await fetch(`${review.url}/feedback`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ itemId: 'item_auth', eventType: 'revealed', confidenceBeforeReveal: 5 }) }).then((res) => res.json()) as { ok: boolean; state: { events: number } };
      expect(reveal.ok).toBe(true);
      expect(reveal.state.events).toBe(1);

      const answer = await fetch(`${review.url}/answer`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ itemId: 'item_auth', answer: 'Auth gates access to sensitive behavior.', correct: true }) }).then((res) => res.json()) as { ok: boolean; state: { events: number; delayedProbes: number } };
      expect(answer.ok).toBe(true);
      expect(answer.state.events).toBe(2);
      expect(answer.state.delayedProbes).toBe(2);
      const calibration = await fetch(`${review.url}/api/calibration`).then((res) => res.json()) as { pairedCount: number; accuracy: number };
      expect(calibration.pairedCount).toBe(1);
      expect(calibration.accuracy).toBe(1);
      const delayed = await fetch(`${review.url}/api/delayed-probes`).then((res) => res.json()) as { summary: { scheduled: number; completed: number; due: number } };
      expect(delayed.summary.scheduled).toBe(2);
      expect(delayed.summary.completed).toBe(0);

      const studyHtml = await fetch(`${review.url}/study`).then((res) => res.text());
      expect(studyHtml).toContain('Active-control pilot');
      expect(studyHtml).toContain('Assign next pilot set');
      const studyCards = await fetch(`${review.url}/api/cards/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ count: 2, mode: 'more' }) }).then((res) => res.json()) as { ok: boolean };
      expect(studyCards.ok).toBe(true);
      const studyAssigned = await fetch(`${review.url}/api/study/assign`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ seed: 'test-pilot', count: 2 }) }).then((res) => res.json()) as { ok: boolean; state: { studyAssignments: number }; study: { summary: { mergelearn: number; activeControl: number; completed: number }; assignments: Array<{ id: string; condition: string }> } };
      expect(studyAssigned.ok).toBe(true);
      expect(studyAssigned.state.studyAssignments).toBe(2);
      expect(studyAssigned.study.summary.mergelearn).toBe(1);
      expect(studyAssigned.study.summary.activeControl).toBe(1);
      const passive = studyAssigned.study.assignments.find((assignment) => assignment.condition === 'active_control')!;
      const passiveDone = await fetch(`${review.url}/api/study/passive-review/complete`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assignmentId: passive.id, durationMs: 60000, note: 'read the packet' }) }).then((res) => res.json()) as { ok: boolean; study: { summary: { completed: number } } };
      expect(passiveDone.ok).toBe(true);
      expect(passiveDone.study.summary.completed).toBe(1);

      const feedback = await fetch(`${review.url}/feedback`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ itemId: 'item_auth', eventType: 'marked_useful' }) }).then((res) => res.json()) as { ok: boolean; state: { events: number } };
      expect(feedback.ok).toBe(true);
      expect(feedback.state.events).toBe(4);

      const badCard = await fetch(`${review.url}/feedback`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ itemId: 'item_auth', eventType: 'marked_bad_card' }) }).then((res) => res.json()) as { ok: boolean; state: { events: number } };
      expect(badCard.ok).toBe(true);
      expect(badCard.state.events).toBe(5);

      const correction = await fetch(`${review.url}/correct`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ conceptId: 'repo.auth', correctionType: 'better_label', replacementLabel: 'session auth' }) }).then((res) => res.json()) as { ok: boolean; state: { corrections: number } };
      expect(correction.ok).toBe(true);
      expect(correction.state.corrections).toBe(1);
    } finally {
      await review.close();
    }
  });
});
