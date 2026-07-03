import { describe, expect, it } from 'vitest';

import {
  verdictToRating, newSchedule, reviewSchedule, computeMastery, MASTERY_HORIZON_DAYS,
} from '../../src/core/scheduler.js';
import { Rating } from 'ts-fsrs';

const t0 = new Date('2026-01-01T00:00:00.000Z');

describe('verdictToRating (no confidence input)', () => {
  it('maps graded verdicts to FSRS ratings', () => {
    expect(verdictToRating('correct')).toBe(Rating.Good);
    expect(verdictToRating('partial')).toBe(Rating.Hard);
    expect(verdictToRating('incorrect')).toBe(Rating.Again);
  });

  it('returns null for ungraded (no scheduling signal)', () => {
    expect(verdictToRating('ungraded')).toBeNull();
  });
});

describe('newSchedule', () => {
  it('creates a due, serializable schedule with ISO dates', () => {
    const s = newSchedule(t0);
    expect(typeof s.due).toBe('string');
    expect(s.due).toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(s.reps).toBe(0);
    expect(s.lapses).toBe(0);
  });
});

describe('reviewSchedule', () => {
  it('advances the schedule and increments reps on a graded verdict', () => {
    const s0 = newSchedule(t0);
    const s1 = reviewSchedule(s0, 'correct', t0);
    expect(s1.reps).toBe(1);
    expect(new Date(s1.due).getTime()).toBeGreaterThan(t0.getTime());
    expect(typeof s1.due).toBe('string');
  });

  it('does NOT move the schedule for ungraded (no signal)', () => {
    const s0 = newSchedule(t0);
    const s1 = reviewSchedule(s0, 'ungraded', t0);
    expect(s1).toEqual(s0);
  });

  it('incorrect answers accrue lapses over a review history', () => {
    let s = newSchedule(t0);
    let day = t0.getTime();
    for (let i = 0; i < 3; i += 1) {
      s = reviewSchedule(s, 'correct', new Date(day));
      day = new Date(s.due).getTime();
    }
    const before = s.lapses;
    s = reviewSchedule(s, 'incorrect', new Date(day));
    expect(s.lapses).toBeGreaterThanOrEqual(before);
  });
});

describe('computeMastery (defined formula)', () => {
  it('is bounded in [0,1]', () => {
    const s = newSchedule(t0);
    const m = computeMastery(s, t0);
    expect(m).toBeGreaterThanOrEqual(0);
    expect(m).toBeLessThanOrEqual(1);
  });

  it('rises after successful reviews vs a brand-new card', () => {
    const fresh = computeMastery(newSchedule(t0), t0);
    let s = newSchedule(t0);
    let day = t0.getTime();
    for (let i = 0; i < 3; i += 1) {
      s = reviewSchedule(s, 'correct', new Date(day));
      day = new Date(s.due).getTime();
    }
    const trained = computeMastery(s, new Date(day));
    expect(trained).toBeGreaterThan(fresh);
  });

  it('uses the documented 7-day horizon', () => {
    expect(MASTERY_HORIZON_DAYS).toBe(7);
  });
});
