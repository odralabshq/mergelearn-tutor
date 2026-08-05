import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { writeJson } from '../../../src/core/library/io.js';
import { libraryPaths } from '../../../src/core/library/libraryStore.js';
import {
  computeLessonProgress,
  lessonEvidenceForSet,
  listSessions,
} from '../../../src/core/library/review/sessionHistory.js';
import type { ReviewSession } from '../../../src/core/library/types.js';

async function freshRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'mlt-hist-'));
}

/** Write a session file under profile/sessions/<day>/ the way endSession does. */
async function writeSession(root: string, s: Partial<ReviewSession> & { id: string; startedAt: string }): Promise<void> {
  const day = s.startedAt.slice(0, 10);
  const stamp = s.startedAt.replace(/[:.]/g, '-');
  const path = join(libraryPaths(root).sessionDayDir(day), `session_${stamp}.json`);
  const full: ReviewSession = {
    mode: 'lesson', events: [],
    summary: { reviewedCount: 0, again: 0, hard: 0, good: 0, easy: 0 },
    ...s,
  } as ReviewSession;
  await writeJson(path, full);
}

function ev(cardId: string) {
  return { cardId, rating: 3, stateBefore: 0, stabilityBefore: 0, difficultyBefore: 0,
    elapsedDays: 0, scheduledDays: 1, reviewedAt: '2026-07-12T00:00:00.000Z' };
}

describe('computeLessonProgress (pure)', () => {
  it('is not_started with no evidence', () => {
    const p = computeLessonProgress(['a', 'b', 'c'], new Map());
    expect(p).toEqual({ passedCount: 0, deterministicCount: 0, selfAssessedCount: 0,
      total: 3, state: 'not_started', resumeCardId: 'a' });
  });

  it('is in_progress and resumes at the first unpassed card in authored order', () => {
    const p = computeLessonProgress(['a', 'b', 'c'], new Map([
      ['a', 'self_assessed'], ['c', 'self_assessed'],
    ]));
    expect(p.state).toBe('in_progress');
    expect(p.passedCount).toBe(2);
    expect(p.resumeCardId).toBe('b');
  });

  it('is completed with no resume target when all cards have evidence', () => {
    const p = computeLessonProgress(['a', 'b'], new Map([
      ['a', 'deterministic'], ['b', 'self_assessed'],
    ]));
    expect(p).toEqual({ passedCount: 2, deterministicCount: 1, selfAssessedCount: 1,
      total: 2, state: 'completed', resumeCardId: null });
  });

  it('ignores evidence for cards that are not active', () => {
    const p = computeLessonProgress(['a'], new Map([
      ['a', 'deterministic'], ['ghost', 'deterministic'],
    ]));
    expect(p.passedCount).toBe(1);
    expect(p.state).toBe('completed');
  });

  it('returns a completed lesson to in_progress when an unpassed card is added', () => {
    const evidence = new Map([['a', 'deterministic' as const], ['b', 'self_assessed' as const]]);
    expect(computeLessonProgress(['a', 'b'], evidence).state).toBe('completed');
    expect(computeLessonProgress(['a', 'b', 'c'], evidence)).toMatchObject({
      state: 'in_progress', passedCount: 2, total: 3, resumeCardId: 'c',
    });
  });

  it('an empty lesson is not_started, never completed', () => {
    expect(computeLessonProgress([], new Map()).state).toBe('not_started');
  });

  it('reports disjoint deterministic and self-assessed progress at the strongest class', () => {
    const evidence = new Map([
      ['a', 'deterministic' as const],
      ['b', 'self_assessed' as const],
      ['ghost', 'deterministic' as const],
    ]);
    expect(computeLessonProgress(['a', 'b', 'c'], evidence)).toEqual({
      passedCount: 2,
      deterministicCount: 1,
      selfAssessedCount: 1,
      total: 3,
      state: 'in_progress',
      resumeCardId: 'c',
    });
  });
});

describe('lessonEvidenceForSet (reader)', () => {
  it('unions passing evidence across multiple lesson sessions for the same set', async () => {
    const root = await freshRoot();
    await writeSession(root, { id: 's1', startedAt: '2026-07-11T10:00:00.000Z',
      mode: 'lesson', filter: { setIds: ['deck'] }, events: [ev('c1')] as any });
    await writeSession(root, { id: 's2', startedAt: '2026-07-12T11:00:00.000Z',
      mode: 'lesson', filter: { setIds: ['deck'] }, events: [ev('c2')] as any });
    const evidence = await lessonEvidenceForSet(root, 'deck');
    expect([...evidence]).toEqual([['c1', 'self_assessed'], ['c2', 'self_assessed']]);
  });

  it('does not pass a deterministic failure even when it was rated Easy', async () => {
    const root = await freshRoot();
    await writeSession(root, {
      id: 'failed-choice', startedAt: '2026-07-12T12:00:00.000Z', mode: 'lesson',
      filter: { setIds: ['deck'] },
      events: [{
        cardId: 'c1', setId: 'deck', rating: 4, reviewedAt: '2026-07-12T12:00:00.000Z',
        resultClass: 'scheduled', requestId: 'failed-choice-grade',
        attempt: { interaction: 'choice', correct: false },
      }],
    });
    expect([...await lessonEvidenceForSet(root, 'deck')]).toEqual([]);
  });

  it('classifies explicit and self-assessed evidence without inferring missing results', async () => {
    const root = await freshRoot();
    await writeSession(root, {
      id: 'matrix', startedAt: '2026-07-12T12:00:30.000Z', mode: 'lesson',
      filter: { setIds: ['deck'] },
      events: [
        { cardId: 'det-no-rating', resultClass: 'scheduled', attempt: { interaction: 'choice', correct: true } },
        { cardId: 'det-good', rating: 3, resultClass: 'scheduled', attempt: { interaction: 'choice', correct: true } },
        { cardId: 'true-again', rating: 1, resultClass: 'scheduled', attempt: { interaction: 'choice', correct: true } },
        { cardId: 'self-hard', rating: 2, resultClass: 'scheduled' },
        { cardId: 'self-good', rating: 3, resultClass: 'scheduled' },
        { cardId: 'self-easy', rating: 4, resultClass: 'scheduled' },
        { cardId: 'missing', resultClass: 'scheduled' },
      ] as ReviewSession['events'],
    });
    expect([...await lessonEvidenceForSet(root, 'deck')]).toEqual([
      ['det-no-rating', 'deterministic'], ['det-good', 'deterministic'],
      ['self-hard', 'self_assessed'], ['self-good', 'self_assessed'],
      ['self-easy', 'self_assessed'],
    ]);
  });

  it('does not count an evidence-only revisit as lesson completion', async () => {
    const root = await freshRoot();
    await writeSession(root, {
      id: 'evidence', startedAt: '2026-07-12T12:01:00.000Z', mode: 'lesson',
      filter: { setIds: ['deck'] },
      events: [{
        cardId: 'c1', setId: 'deck', rating: 1, reviewedAt: '2026-07-12T12:01:00.000Z',
        resultClass: 'evidence',
      }],
    });
    expect([...await lessonEvidenceForSet(root, 'deck')]).toEqual([]);
  });

  it('keeps only the strongest live class and excludes an undone request', async () => {
    const root = await freshRoot();
    await writeSession(root, {
      id: 'strongest', startedAt: '2026-07-12T12:01:30.000Z', mode: 'lesson',
      filter: { setIds: ['deck'] },
      plan: { version: 1, mode: 'study_once', entries: [], revision: 2,
        gradeLedger: [{ requestId: 'undone', semanticKey: 'x', error: { code: 'request_undone' } }],
        requestBudget: 512 },
      events: [
        { cardId: 'same', rating: 3, resultClass: 'scheduled', requestId: 'self' },
        { cardId: 'same', rating: 3, resultClass: 'scheduled', requestId: 'det',
          attempt: { interaction: 'choice', correct: true } },
        { cardId: 'removed', rating: 3, resultClass: 'scheduled', requestId: 'undone' },
      ] as ReviewSession['events'],
    });
    expect([...await lessonEvidenceForSet(root, 'deck')]).toEqual([['same', 'deterministic']]);
  });

  it('tolerates a legacy plan without a grade ledger', async () => {
    const root = await freshRoot();
    await writeSession(root, {
      id: 'incomplete-plan', startedAt: '2026-07-12T12:01:45.000Z', mode: 'lesson',
      filter: { setIds: ['deck'] },
      plan: { version: 1, mode: 'study_once', entries: [], revision: 1, requestBudget: 512 } as never,
      events: [{ cardId: 'live', rating: 3, resultClass: 'scheduled' } as never],
    });
    expect([...await lessonEvidenceForSet(root, 'deck')]).toEqual([['live', 'self_assessed']]);
  });

  it('requires scheduled identity for result-bearing legacy events', async () => {
    const root = await freshRoot();
    await writeSession(root, {
      id: 'legacy-result', startedAt: '2026-07-12T12:01:50.000Z', mode: 'lesson',
      filter: { setIds: ['deck'] },
      events: [
        { cardId: 'unknown', rating: 3, resultClass: 'other' as never },
        { cardId: 'scheduled', rating: 3, resultClass: 'scheduled' },
      ] as ReviewSession['events'],
    });
    expect([...await lessonEvidenceForSet(root, 'deck')]).toEqual([['scheduled', 'self_assessed']]);
  });

  it('requires scheduled identity for planned events but keeps legacy rating evidence', async () => {
    const root = await freshRoot();
    await writeSession(root, {
      id: 'planned', startedAt: '2026-07-12T12:02:00.000Z', mode: 'lesson',
      filter: { setIds: ['deck'] },
      plan: {
        version: 1, mode: 'study_once', entries: [], revision: 1,
        gradeLedger: [], requestBudget: 512,
      },
      events: [{ cardId: 'planned-missing-class', rating: 3, reviewedAt: '2026-07-12T12:02:00.000Z' }],
    });
    await writeSession(root, {
      id: 'legacy', startedAt: '2026-07-12T12:03:00.000Z', mode: 'lesson',
      filter: { setIds: ['deck'] },
      events: [{ cardId: 'legacy-rating', rating: 3, reviewedAt: '2026-07-12T12:03:00.000Z' }],
    });
    expect([...await lessonEvidenceForSet(root, 'deck')]).toEqual([
      ['legacy-rating', 'self_assessed'],
    ]);
  });

  it('ignores non-lesson sessions and other sets', async () => {
    const root = await freshRoot();
    await writeSession(root, { id: 'r1', startedAt: '2026-07-12T09:00:00.000Z',
      mode: 'set', filter: { setIds: ['deck'] }, events: [ev('c9')] as any });
    await writeSession(root, { id: 'l2', startedAt: '2026-07-12T09:05:00.000Z',
      mode: 'lesson', filter: { setIds: ['other'] }, events: [ev('c8')] as any });
    const evidence = await lessonEvidenceForSet(root, 'deck');
    expect(evidence.size).toBe(0);
  });

  it('skips a corrupt session file instead of throwing', async () => {
    const root = await freshRoot();
    await writeSession(root, { id: 'good', startedAt: '2026-07-12T08:00:00.000Z',
      mode: 'lesson', filter: { setIds: ['deck'] }, events: [ev('c1')] as any });
    const { mkdir, writeFile } = await import('node:fs/promises');
    const dayDir = libraryPaths(root).sessionDayDir('2026-07-12');
    await mkdir(dayDir, { recursive: true });
    await writeFile(join(dayDir, 'session_broken.json'), '{ not valid json', 'utf8');
    const sessions = await listSessions(root);
    expect(sessions.map((s) => s.id)).toEqual(['good']);
    const evidence = await lessonEvidenceForSet(root, 'deck');
    expect([...evidence]).toEqual([['c1', 'self_assessed']]);
  });

  it('returns empty when there are no sessions at all', async () => {
    const root = await freshRoot();
    expect((await lessonEvidenceForSet(root, 'deck')).size).toBe(0);
  });
});
