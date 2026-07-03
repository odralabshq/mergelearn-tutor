/**
 * Concept readiness state machine (S7b, doc 03 refined by doc 05).
 *
 * Three states, derived (never stored as source of truth):
 *  - mastered: the learner's own mastery for this concept is at/above the
 *    mastery threshold.
 *  - ready:    not yet mastered, and all prerequisites are sufficiently mastered.
 *  - blocked:  not yet mastered, and at least one prerequisite is weak.
 *
 * Doc 05 rule: BLOCKED NEVER HARD-LOCKS. It is an advisory signal the sequencer
 * uses to prefer ready cards - it does not forbid surfacing a blocked concept
 * (a learner may want to jump ahead, and prereq edges can be imperfect). The
 * decision is pure and takes a mastery lookup so it is independent of the
 * scheduler (FSRS arrives in S7c).
 */

import type { ConceptGraph } from './graph.js';

export type ReadinessState = 'ready' | 'blocked' | 'mastered';

export interface ReadinessThresholds {
  /** own mastery >= this => mastered. */
  mastered: number;
  /** every prerequisite mastery >= this => ready (else blocked). */
  prereqReady: number;
}

export const DEFAULT_THRESHOLDS: ReadinessThresholds = { mastered: 0.85, prereqReady: 0.6 };

export interface ReadinessResult {
  state: ReadinessState;
  /** Prerequisite ids that are below the ready bar (empty unless blocked). */
  weakPrereqs: string[];
}

/** A mastery lookup: concept id -> mastery in [0,1]. Missing => 0 (unseen). */
export type MasteryLookup = (conceptId: string) => number;

/**
 * Derive one concept's readiness. Pure. `mastered` wins first; otherwise a
 * concept is `ready` when every prerequisite is at/above prereqReady, else
 * `blocked` with the offending prereqs listed. Blocked is advisory only - the
 * sequencer prefers ready concepts but is free to surface a blocked one.
 */
export function deriveReadiness(
  conceptId: string,
  graph: ConceptGraph,
  mastery: MasteryLookup,
  thresholds: ReadinessThresholds = DEFAULT_THRESHOLDS,
): ReadinessResult {
  if (mastery(conceptId) >= thresholds.mastered) {
    return { state: 'mastered', weakPrereqs: [] };
  }
  const prereqs = graph.prereqs.get(conceptId) ?? [];
  const weakPrereqs = prereqs.filter((p) => mastery(p) < thresholds.prereqReady);
  return { state: weakPrereqs.length === 0 ? 'ready' : 'blocked', weakPrereqs };
}

/** Derive readiness for every node, returned as a map. */
export function deriveAllReadiness(
  graph: ConceptGraph,
  mastery: MasteryLookup,
  thresholds: ReadinessThresholds = DEFAULT_THRESHOLDS,
): Map<string, ReadinessResult> {
  const out = new Map<string, ReadinessResult>();
  for (const id of graph.ids) out.set(id, deriveReadiness(id, graph, mastery, thresholds));
  return out;
}
