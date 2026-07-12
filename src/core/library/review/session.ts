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
import { saveCard } from '../cardStore.js';
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
    summary: { reviewedCount: 0, again: 0, hard: 0, good: 0, easy: 0 },
  };
}

const RATING_KEY: Record<ReviewRating, keyof ReviewSession['summary']> = {
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
  session.summary[RATING_KEY[rating]] += 1;
  return updated;
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
