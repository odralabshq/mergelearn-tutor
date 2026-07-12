import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { writeJson } from '../../../src/core/library/io.js';
import { libraryPaths } from '../../../src/core/library/libraryStore.js';
import {
  attemptedCardIds,
  computeLessonProgress,
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
  it('is not_started with no attempts', () => {
    const p = computeLessonProgress(['a', 'b', 'c'], new Set());
    expect(p).toEqual({ attemptedCount: 0, total: 3, state: 'not_started', resumeCardId: 'a' });
  });

  it('is in_progress and resumes at the first unattempted card in authored order', () => {
    const p = computeLessonProgress(['a', 'b', 'c'], new Set(['a', 'c']));
    expect(p.state).toBe('in_progress');
    expect(p.attemptedCount).toBe(2);
    expect(p.resumeCardId).toBe('b'); // first gap, not last card
  });

  it('is completed with no resume target when all attempted', () => {
    const p = computeLessonProgress(['a', 'b'], new Set(['a', 'b']));
    expect(p).toEqual({ attemptedCount: 2, total: 2, state: 'completed', resumeCardId: null });
  });

  it('ignores attempted ids that are not active cards (capped at total)', () => {
    const p = computeLessonProgress(['a'], new Set(['a', 'ghost']));
    expect(p.attemptedCount).toBe(1);
    expect(p.state).toBe('completed');
  });

  it('an empty lesson is not_started, never completed', () => {
    expect(computeLessonProgress([], new Set()).state).toBe('not_started');
  });
});

describe('attemptedCardIds (reader)', () => {
  it('unions attempts across multiple lesson sessions for the same set', async () => {
    const root = await freshRoot();
    await writeSession(root, { id: 's1', startedAt: '2026-07-11T10:00:00.000Z',
      mode: 'lesson', filter: { setIds: ['deck'] }, events: [ev('c1')] as any });
    await writeSession(root, { id: 's2', startedAt: '2026-07-12T11:00:00.000Z',
      mode: 'lesson', filter: { setIds: ['deck'] }, events: [ev('c2')] as any });
    const ids = await attemptedCardIds(root, 'deck');
    expect([...ids].sort()).toEqual(['c1', 'c2']);
  });

  it('ignores non-lesson sessions and other sets', async () => {
    const root = await freshRoot();
    await writeSession(root, { id: 'r1', startedAt: '2026-07-12T09:00:00.000Z',
      mode: 'set', filter: { setIds: ['deck'] }, events: [ev('c9')] as any }); // review, not lesson
    await writeSession(root, { id: 'l2', startedAt: '2026-07-12T09:05:00.000Z',
      mode: 'lesson', filter: { setIds: ['other'] }, events: [ev('c8')] as any }); // other set
    const ids = await attemptedCardIds(root, 'deck');
    expect(ids.size).toBe(0);
  });

  it('skips a corrupt session file instead of throwing', async () => {
    const root = await freshRoot();
    await writeSession(root, { id: 'good', startedAt: '2026-07-12T08:00:00.000Z',
      mode: 'lesson', filter: { setIds: ['deck'] }, events: [ev('c1')] as any });
    // Drop a malformed file next to the good one.
    const { mkdir, writeFile } = await import('node:fs/promises');
    const dayDir = libraryPaths(root).sessionDayDir('2026-07-12');
    await mkdir(dayDir, { recursive: true });
    await writeFile(join(dayDir, 'session_broken.json'), '{ not valid json', 'utf8');
    const sessions = await listSessions(root);
    expect(sessions.map((s) => s.id)).toEqual(['good']);
    const ids = await attemptedCardIds(root, 'deck');
    expect([...ids]).toEqual(['c1']);
  });

  it('returns empty when there are no sessions at all', async () => {
    const root = await freshRoot();
    expect((await attemptedCardIds(root, 'deck')).size).toBe(0);
  });
});
