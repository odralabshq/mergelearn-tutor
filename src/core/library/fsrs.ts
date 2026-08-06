/**
 * FSRS adapter for the embedded FsrsState (docs/design/redesign-2026-07/01 sec 5).
 *
 * Reuses the existing daily-cadence FSRS instance (scheduler.ts:dailyFsrs) so
 * scheduling behavior is identical to the current platform; this module only
 * maps ts-fsrs Card <-> our camelCase FsrsState and takes an explicit
 * ReviewRating (1-4) instead of a graded verdict — the learner self-grades.
 */

import { fsrs, generatorParameters, createEmptyCard, type Card as FsrsCard, type FSRS } from 'ts-fsrs';
import type { FsrsState, ReviewRating } from './types.js';

/**
 * Daily-cadence FSRS instance. Inlined (was scheduler.ts:dailyFsrs) so the
 * library subsystem has no dependency on legacy core. Learning/relearning steps
 * are DAILY, not the library's minute-scale defaults, because this is a
 * once-a-day review tool; fuzz off for deterministic scheduling in tests.
 */
export function dailyFsrs(): FSRS {
  return fsrs(generatorParameters({ learning_steps: ['1d'], relearning_steps: ['1d'], enable_fuzz: false }));
}

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

/** Reused instance: dailyFsrs() is pure config with fuzz disabled, so caching
 * it is safe and avoids rebuilding the scheduler once per card. */
let cachedFsrs: FSRS | undefined;

/**
 * Current probability of recall, 0..1 (FSRS retrievability).
 *
 * Measured, not inferred: at a card's due date this returns ~0.90 (the target
 * retention), rising to 1.0 immediately after a review and decaying with
 * elapsed time. A never-reviewed card returns 0, so callers MUST decide whether
 * unstudied cards belong in an average - including them turns a retention
 * figure back into a coverage figure.
 */
export function retrievability(state: FsrsState, now = new Date()): number {
  cachedFsrs ??= dailyFsrs();
  const r = cachedFsrs.get_retrievability(fromState(state), now, false);
  return Number.isFinite(r) ? Math.min(1, Math.max(0, r)) : 0;
}

/** Has the learner actually attempted this card? Distinguishes "never seen"
 * from "seen and forgotten", which a bare retrievability number cannot. */
export function hasBeenStudied(state: FsrsState): boolean {
  return state.reps > 0;
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
