/**
 * FSRS adapter for the embedded FsrsState (docs/design/redesign-2026-07/01 sec 5).
 *
 * Reuses the existing daily-cadence FSRS instance (scheduler.ts:dailyFsrs) so
 * scheduling behavior is identical to the current platform; this module only
 * maps ts-fsrs Card <-> our camelCase FsrsState and takes an explicit
 * ReviewRating (1-4) instead of a graded verdict — the learner self-grades.
 */

import { createEmptyCard, type Card as FsrsCard } from 'ts-fsrs';
import { dailyFsrs } from '../scheduler.js';
import type { FsrsState, ReviewRating } from './types.js';

function toState(c: FsrsCard): FsrsState {
  return {
    due: c.due.toISOString(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsedDays: c.elapsed_days,
    scheduledDays: c.scheduled_days,
    reps: c.reps,
    lapses: c.lapses,
    learningSteps: c.learning_steps,
    state: c.state as 0 | 1 | 2 | 3,
    lastReviewAt: c.last_review ? c.last_review.toISOString() : undefined,
  };
}

function fromState(s: FsrsState): FsrsCard {
  return {
    due: new Date(s.due),
    stability: s.stability,
    difficulty: s.difficulty,
    elapsed_days: s.elapsedDays,
    scheduled_days: s.scheduledDays,
    reps: s.reps,
    lapses: s.lapses,
    learning_steps: s.learningSteps,
    state: s.state,
    last_review: s.lastReviewAt ? new Date(s.lastReviewAt) : undefined,
  } as FsrsCard;
}

/** A fresh schedule for a new card, due immediately. */
export function newFsrsState(now = new Date()): FsrsState {
  return toState(createEmptyCard(now));
}

/** Advance a schedule by a self-graded rating (1 Again .. 4 Easy). */
export function gradeFsrs(prev: FsrsState, rating: ReviewRating, now = new Date()): FsrsState {
  const next = dailyFsrs().next(fromState(prev), now, rating);
  return toState(next.card);
}
