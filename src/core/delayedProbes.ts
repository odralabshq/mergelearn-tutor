import type { DelayedProbe, LearningEvent, TutorState } from './types.js';
import { addDays, nowIso, stableId } from './util.js';

export type CompleteDelayedProbeInput = {
  probeId: string;
  answerText: string;
  correct: boolean;
};

const DELAYED_INTERVALS: Array<2 | 7> = [2, 7];

export function scheduleDelayedProbesForAnswer(state: TutorState, event: LearningEvent): TutorState {
  if (event.eventType !== 'answered') return state;
  const existing = state.delayedProbes ?? [];
  const missing = DELAYED_INTERVALS.filter((intervalDays) => !existing.some((probe) => probe.sourceItemId === event.itemId && probe.intervalDays === intervalDays));
  if (missing.length === 0) return state;
  const probes = missing.map((intervalDays): DelayedProbe => ({
    id: stableId('probe', [event.itemId, String(intervalDays)]),
    sourceItemId: event.itemId,
    conceptId: event.conceptId,
    intervalDays,
    dueAt: addDays(event.createdAt, intervalDays),
    status: 'scheduled',
    scheduledAt: event.createdAt,
  }));
  return { ...state, delayedProbes: [...existing, ...probes] };
}

export function dueDelayedProbes(state: TutorState, at: string = nowIso()): DelayedProbe[] {
  const now = new Date(at).getTime();
  return (state.delayedProbes ?? [])
    .filter((probe) => probe.status === 'scheduled' && new Date(probe.dueAt).getTime() <= now)
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
}

export function delayedProbeSummary(state: TutorState, at: string = nowIso()) {
  const probes = state.delayedProbes ?? [];
  return {
    total: probes.length,
    scheduled: probes.filter((probe) => probe.status === 'scheduled').length,
    completed: probes.filter((probe) => probe.status === 'completed').length,
    due: dueDelayedProbes(state, at).length,
  };
}

export function completeDelayedProbe(state: TutorState, input: CompleteDelayedProbeInput): TutorState {
  const probe = (state.delayedProbes ?? []).find((candidate) => candidate.id === input.probeId);
  if (!probe) throw new Error(`Unknown delayed probe: ${input.probeId}`);
  if (probe.status === 'completed') throw new Error(`Delayed probe already completed: ${input.probeId}`);
  const now = nowIso();
  const event: LearningEvent = {
    id: stableId('event', ['delayed_probe_completed', probe.id, now]),
    itemId: probe.sourceItemId,
    conceptId: probe.conceptId,
    eventType: 'delayed_probe_completed',
    answerText: input.answerText,
    correct: input.correct,
    note: `${probe.intervalDays}-day delayed probe`,
    createdAt: now,
  };
  const delayedProbes = (state.delayedProbes ?? []).map((candidate) => candidate.id === probe.id ? { ...candidate, status: 'completed' as const, completedAt: now, correct: input.correct } : candidate);
  return { ...state, delayedProbes, learningEvents: [...state.learningEvents, event] };
}
