/**
 * Review sessions (docs/design/redesign-2026-07/01 sec 7, 04 Practice).
 *
 * A session is one review sitting. Grading advances a card's embedded FSRS
 * state (fsrs.ts), records a ReviewEvent, and — on end — persists the session
 * as a per-day file under profile/sessions/<YYYY-MM-DD>/session_<ts>.json.
 * History is grouped by sitting, never a single global log.
 */

import { join } from 'node:path';

import type { Card, Confidence, ReviewAttempt, ReviewEvent, ReviewRating, ReviewSession } from '../types.js';
import { gradeFsrs } from '../fsrs.js';
import { loadCard, saveCard } from '../cardStore.js';
import { libraryPaths } from '../libraryStore.js';
import { writeJson } from '../io.js';
import { stableId } from '../../util.js';

/** Begin an in-memory session. Persisted only on endSession. */
export function startSession(
  mode: ReviewSession['mode'],
  filter?: ReviewSession['filter'],
  now = new Date(),
): ReviewSession {
  const startedAt = now.toISOString();
  return {
    id: stableId('session', `${startedAt}:${Math.random()}`),
    startedAt,
    mode,
    filter,
    events: [],
    summary: { reviewedCount: 0, distinctCardCount: 0, again: 0, hard: 0, good: 0, easy: 0 },
  };
}

const RATING_KEY: Record<ReviewRating, 'again' | 'hard' | 'good' | 'easy'> = {
  1: 'again', 2: 'hard', 3: 'good', 4: 'easy',
};

/**
 * Grade a card: capture the pre-review FSRS snapshot, advance the schedule,
 * persist the updated card, and append a ReviewEvent to the session. Returns
 * the updated card so callers can reflect the new due date immediately.
 */
export async function gradeCard(
  root: string,
  session: ReviewSession,
  card: Card,
  rating: ReviewRating,
  now = new Date(),
  confidenceBeforeReveal?: Confidence,
  attempt?: ReviewAttempt,
): Promise<Card> {
  const before = card.fsrs;
  const nextFsrs = gradeFsrs(before, rating, now);
  const updated: Card = { ...card, fsrs: nextFsrs, updatedAt: now.toISOString() };
  await saveCard(root, updated);

  const event: ReviewEvent = {
    cardId: card.id,
    setId: card.setId,
    fsrsBefore: structuredClone(before),
    cardUpdatedAtBefore: card.updatedAt,
    rating,
    ...(confidenceBeforeReveal !== undefined ? { confidenceBeforeReveal } : {}),
    ...(attempt !== undefined ? { attempt } : {}),
    stateBefore: before.state,
    stabilityBefore: before.stability,
    difficultyBefore: before.difficulty,
    elapsedDays: nextFsrs.elapsedDays,
    scheduledDays: nextFsrs.scheduledDays,
    reviewedAt: now.toISOString(),
  };
  session.events.push(event);
  session.summary.reviewedCount += 1;
  session.summary.distinctCardCount = new Set(session.events.map((e) => e.cardId)).size;
  session.summary[RATING_KEY[rating]] += 1;
  return updated;
}

export class UndoUnavailableError extends Error {
  constructor(message: string) { super(message); this.name = 'UndoUnavailableError'; }
}

/** Undo exactly one grade. Sessions from before exact snapshots were introduced
 * remain readable but cannot be reconstructed safely, so we refuse to guess. */
export async function undoLastGrade(root: string, session: ReviewSession): Promise<Card> {
  if (session.endedAt) throw new UndoUnavailableError('session already ended');
  const event = session.events.at(-1);
  if (!event) throw new UndoUnavailableError('nothing to undo');
  if (!event.setId || !event.fsrsBefore || !event.cardUpdatedAtBefore) {
    throw new UndoUnavailableError('last grade predates exact undo snapshots');
  }
  const card = await loadCard(root, event.setId, event.cardId);
  if (!card) throw new UndoUnavailableError('graded card no longer exists');
  const restored: Card = { ...card, fsrs: structuredClone(event.fsrsBefore), updatedAt: event.cardUpdatedAtBefore };
  await saveCard(root, restored);
  session.events.pop();
  session.summary.reviewedCount = Math.max(0, session.summary.reviewedCount - 1);
  session.summary[RATING_KEY[event.rating]] = Math.max(0, session.summary[RATING_KEY[event.rating]] - 1);
  session.summary.distinctCardCount = new Set(session.events.map((e) => e.cardId)).size;
  return restored;
}

/** Finalize a session and persist it as a per-day file. Returns the path. */
export async function endSession(root: string, session: ReviewSession, now = new Date()): Promise<string> {
  session.endedAt = now.toISOString();
  const day = session.startedAt.slice(0, 10); // YYYY-MM-DD
  const stamp = session.startedAt.replace(/[:.]/g, '-');
  const path = join(libraryPaths(root).sessionDayDir(day), `session_${stamp}.json`);
  await writeJson(path, session);
  return path;
}
