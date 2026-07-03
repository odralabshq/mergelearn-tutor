/**
 * FSRS scheduler wrapper (S7c, doc 03 refined by doc 05).
 *
 * Wraps ts-fsrs (the ONE approved new dependency: pure TS, no native build) and
 * bakes in the doc-05 corrections:
 *  - DAILY-cadence learning steps (['1d']), not the library's minute defaults
 *    (['1m','10m']) which are wrong for a once-a-day review tool.
 *  - Rating is derived ONLY from the graded verdict (code-as-oracle), NEVER from
 *    the learner's pre-reveal confidence (confidence corrupts stability).
 *  - a DEFINED mastery formula (retrievability at +7d, discounted by graduation
 *    state and lapse ratio) - doc 05 flagged the prior formula as undefined.
 *
 * Dates are stored as ISO strings so schedules serialize cleanly into state.
 */

import { fsrs, generatorParameters, createEmptyCard, Rating, State, type Card, type FSRS, type Grade } from 'ts-fsrs';
import type { GradeVerdict } from './grade.js';

/** Days-ahead used by the mastery formula (doc 05: retrievability@+7d). */
export const MASTERY_HORIZON_DAYS = 7;

/** Verdict -> FSRS Rating. No confidence input by design. 'ungraded' has no rating. */
export function verdictToRating(verdict: GradeVerdict): Grade | null {
  switch (verdict) {
    case 'correct': return Rating.Good;
    case 'partial': return Rating.Hard;
    case 'incorrect': return Rating.Again;
    default: return null; // ungraded -> caller does not advance the schedule
  }
}

/** A serializable schedule (FSRS Card with ISO-string dates). */
export interface StoredSchedule {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  learning_steps: number;
  state: State;
  last_review?: string;
}

/** Daily-cadence FSRS instance (doc 05 fix: not the minute-scale defaults). */
export function dailyFsrs(): FSRS {
  return fsrs(generatorParameters({ learning_steps: ['1d'], relearning_steps: ['1d'], enable_fuzz: false }));
}

function toStored(card: Card): StoredSchedule {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    learning_steps: card.learning_steps,
    state: card.state,
    last_review: card.last_review ? card.last_review.toISOString() : undefined,
  };
}

function fromStored(s: StoredSchedule): Card {
  return {
    due: new Date(s.due),
    stability: s.stability,
    difficulty: s.difficulty,
    elapsed_days: s.elapsed_days,
    scheduled_days: s.scheduled_days,
    reps: s.reps,
    lapses: s.lapses,
    learning_steps: s.learning_steps,
    state: s.state,
    last_review: s.last_review ? new Date(s.last_review) : undefined,
  } as Card;
}

/** A brand-new schedule for an unseen card, due immediately. */
export function newSchedule(now = new Date()): StoredSchedule {
  return toStored(createEmptyCard(now));
}

/**
 * Advance a schedule from a graded verdict. Returns the schedule unchanged for
 * 'ungraded' (no signal => no scheduling move). Confidence is intentionally not
 * a parameter (doc 05).
 */
export function reviewSchedule(prev: StoredSchedule, verdict: GradeVerdict, now = new Date()): StoredSchedule {
  const rating = verdictToRating(verdict);
  if (rating === null) return prev;
  const next = dailyFsrs().next(fromStored(prev), now, rating);
  return toStored(next.card);
}

/**
 * Defined mastery in [0,1] (doc 05). Retrievability at +7d is the backbone,
 * discounted when the card has not graduated to Review and by the lapse ratio,
 * so a card that is often forgotten cannot look mastered on a lucky streak.
 */
export function computeMastery(s: StoredSchedule, now = new Date()): number {
  const at = new Date(now.getTime() + MASTERY_HORIZON_DAYS * 86400_000);
  const r = dailyFsrs().get_retrievability(fromStored(s), at, false);
  const retr = typeof r === 'number' ? r : Number.parseFloat(String(r)) / 100 || 0;
  const graduated = s.state === State.Review ? 1 : 0.6;
  const lapseRatio = s.reps > 0 ? s.lapses / s.reps : 0;
  const lapsePenalty = 1 - Math.min(0.5, lapseRatio);
  return Math.max(0, Math.min(1, retr * graduated * lapsePenalty));
}
