import type { LearningEvent, StudyAssignment, TutorState } from './types.js';
import { nowIso, stableId } from './util.js';

export type StudyAssignOptions = { seed?: string; count?: number };
export type PassiveReviewInput = { assignmentId: string; durationMs?: number; note?: string };

export function assignStudyConditions(state: TutorState, options: StudyAssignOptions = {}): TutorState {
  const seed = options.seed ?? 'local-pilot';
  const existing = state.studyAssignments ?? [];
  const alreadyAssigned = new Set(existing.filter((assignment) => assignment.seed === seed).map((assignment) => assignment.itemId));
  const candidates = state.learningItems.filter((item) => item.status === 'active' && !alreadyAssigned.has(item.id)).sort((a, b) => a.id.localeCompare(b.id));
  const created = candidates.slice(0, options.count ?? 6).map((item, index): StudyAssignment => ({
    id: stableId('study', [seed, item.id]),
    itemId: item.id,
    conceptId: item.conceptId,
    condition: index % 2 === 0 ? 'mergelearn' : 'active_control',
    status: 'assigned',
    mode: 'crossover',
    seed,
    assignedAt: nowIso(),
  }));
  return { ...state, studyAssignments: [...existing, ...created] };
}

export function studySummary(state: TutorState) {
  const assignments = state.studyAssignments ?? [];
  return {
    total: assignments.length,
    mergelearn: assignments.filter((assignment) => assignment.condition === 'mergelearn').length,
    activeControl: assignments.filter((assignment) => assignment.condition === 'active_control').length,
    completed: assignments.filter((assignment) => assignment.status === 'completed').length,
    pending: assignments.filter((assignment) => assignment.status === 'assigned').length,
    passiveCompleted: assignments.filter((assignment) => assignment.condition === 'active_control' && assignment.status === 'completed').length,
  };
}

export function completePassiveReview(state: TutorState, input: PassiveReviewInput): TutorState {
  const assignment = (state.studyAssignments ?? []).find((candidate) => candidate.id === input.assignmentId);
  if (!assignment) throw new Error(`Unknown study assignment: ${input.assignmentId}`);
  if (assignment.condition !== 'active_control') throw new Error('Only active-control assignments use passive review completion.');
  if (assignment.status === 'completed') throw new Error(`Study assignment already completed: ${input.assignmentId}`);
  const now = nowIso();
  const event: LearningEvent = { id: stableId('event', ['passive_review_completed', assignment.id, now]), itemId: assignment.itemId, conceptId: assignment.conceptId, eventType: 'passive_review_completed', note: input.note, createdAt: now };
  const studyAssignments = (state.studyAssignments ?? []).map((candidate) => candidate.id === assignment.id ? { ...candidate, status: 'completed' as const, completedAt: now, durationMs: input.durationMs, note: input.note } : candidate);
  return { ...state, studyAssignments, learningEvents: [...state.learningEvents, event] };
}
