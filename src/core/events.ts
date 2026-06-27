import type { Correction, CorrectionType, LearningEvent, ReviewEventType, TutorState } from './types.js';
import { scheduleDelayedProbesForAnswer } from './delayedProbes.js';
import { deriveEvidenceKey, hasEvidenceContent } from './evidenceIdentity.js';
import { addDays, clamp, nowIso, stableId } from './util.js';

const VALID_REVIEW_EVENTS = new Set<ReviewEventType>(['shown', 'revealed', 'answered', 'delayed_probe_completed', 'skipped', 'marked_unsure', 'marked_wrong', 'marked_correct', 'marked_useful', 'marked_bad_card', 'marked_wrong_evidence', 'marked_duplicate', 'corrected', 'deferred']);
const VALID_CORRECTION_TYPES = new Set<CorrectionType>(['wrong_concept', 'wrong_evidence', 'duplicate', 'better_label', 'not_useful', 'pin_important']);

export type ReviewEventInput = {
  itemId: string;
  eventType: ReviewEventType;
  answerText?: string;
  correct?: boolean;
  confidenceBeforeReveal?: number;
  note?: string;
};

export type CorrectionInput = {
  targetType?: 'concept' | 'card';
  targetId: string;
  conceptId?: string;
  correctionType: CorrectionType;
  replacementLabel?: string;
  note?: string;
};

export function recordReviewEvent(state: TutorState, input: ReviewEventInput): TutorState {
  if (!VALID_REVIEW_EVENTS.has(input.eventType)) throw new Error(`Unknown review event type: ${input.eventType}`);
  if (input.eventType === 'revealed' && !validConfidence(input.confidenceBeforeReveal)) throw new Error('revealed event requires confidenceBeforeReveal from 1 to 5.');
  const item = state.learningItems.find((candidate) => candidate.id === input.itemId);
  if (!item) throw new Error(`Unknown learning item: ${input.itemId}`);
  const now = nowIso();
  const event: LearningEvent = {
    id: stableId('event', [input.itemId, input.eventType, input.answerText ?? '', input.note ?? '', now]),
    itemId: input.itemId,
    conceptId: item.conceptId,
    eventType: input.eventType,
    ...eventEvidenceMetadata(item, input.eventType),
    confidenceBeforeReveal: input.confidenceBeforeReveal,
    answerText: input.answerText,
    correct: input.correct,
    note: input.note,
    createdAt: now,
  };
  const conceptStates = state.conceptStates.map((conceptState) => {
    if (conceptState.conceptId !== item.conceptId) return conceptState;
    return updateConceptStateForEvent(conceptState, input.eventType, input.correct, now);
  });
  return scheduleDelayedProbesForAnswer(applyCorrections({ ...state, conceptStates, learningEvents: [...state.learningEvents, event] }), event);
}

function eventEvidenceMetadata(item: TutorState['learningItems'][number], eventType: ReviewEventType): Pick<LearningEvent, 'evidenceKey' | 'evidencePath' | 'questionPlane'> {
  if (eventType !== 'marked_wrong_evidence' && eventType !== 'marked_duplicate' && eventType !== 'revealed') return {};
  const primaryEvidence = { commit: item.snippet.commit, path: item.snippet.path, label: item.snippet.label, code: item.snippet.code };
  return {
    evidenceKey: hasEvidenceContent(primaryEvidence) ? deriveEvidenceKey(primaryEvidence) : undefined,
    evidencePath: item.snippet.path,
    questionPlane: item.questionPlane,
  };
}

function validConfidence(value: number | undefined): boolean {
  const score = value ?? 0;
  return Number.isInteger(score) && score >= 1 && score <= 5;
}

export function addCorrection(state: TutorState, input: CorrectionInput): TutorState {
  if (!VALID_CORRECTION_TYPES.has(input.correctionType)) throw new Error(`Unknown correction type: ${input.correctionType}`);
  if (input.correctionType === 'better_label' && !input.replacementLabel?.trim()) throw new Error('better_label correction requires --label.');
  const now = nowIso();
  const correction: Correction = {
    id: stableId('correction', [input.targetType ?? 'concept', input.targetId, input.correctionType, input.replacementLabel ?? '', input.note ?? '', now]),
    targetType: input.targetType ?? 'concept',
    targetId: input.targetId,
    conceptId: input.conceptId ?? (input.targetType === 'card' ? state.learningItems.find((item) => item.id === input.targetId)?.conceptId : input.targetId),
    correctionType: input.correctionType,
    replacementLabel: input.replacementLabel,
    note: input.note,
    createdAt: now,
  };
  const event: LearningEvent | undefined = correction.conceptId
    ? {
        id: stableId('event', ['corrected', correction.id, now]),
        itemId: correction.targetType === 'card' ? correction.targetId : '',
        conceptId: correction.conceptId,
        eventType: 'corrected',
        note: correction.note,
        createdAt: now,
      }
    : undefined;
  return applyCorrections({ ...state, corrections: [...state.corrections, correction], learningEvents: event ? [...state.learningEvents, event] : state.learningEvents });
}

export function applyCorrections(state: TutorState): TutorState {
  const suppressed = new Set(state.corrections.filter((item) => item.correctionType === 'wrong_concept' || item.correctionType === 'not_useful').map((item) => item.conceptId ?? item.targetId));
  const pinned = new Set(state.corrections.filter((item) => item.correctionType === 'pin_important').map((item) => item.conceptId ?? item.targetId));
  const labelOverrides = new Map(state.corrections.filter((item) => item.correctionType === 'better_label' && item.replacementLabel).map((item) => [item.conceptId ?? item.targetId, item.replacementLabel!]));
  const concepts = state.concepts.map((concept) => labelOverrides.has(concept.id) ? { ...concept, label: labelOverrides.get(concept.id)! } : concept);
  const conceptStates = state.conceptStates.map((conceptState) => {
    if (suppressed.has(conceptState.conceptId)) return { ...conceptState, importance: 0, repoRelevance: 0, confidence: Math.min(conceptState.confidence, 0.1), masteryEstimate: Math.min(conceptState.masteryEstimate, 0.1) };
    if (pinned.has(conceptState.conceptId)) return { ...conceptState, importance: 1, repoRelevance: Math.max(conceptState.repoRelevance, 0.85) };
    return conceptState;
  });
  const learningItems = state.learningItems.filter((item) => !suppressed.has(item.conceptId)).map((item) => labelOverrides.has(item.conceptId) ? { ...item, title: item.title.replace(/^.* in your recent work$/, `${labelOverrides.get(item.conceptId)} in your recent work`) } : item);
  const sortedConceptStates = conceptStates.slice().sort((a, b) => correctionAwarePriority(b) - correctionAwarePriority(a));
  return { ...state, concepts, conceptStates: sortedConceptStates, learningItems };
}

function correctionAwarePriority(conceptState: TutorState['conceptStates'][number]): number {
  return conceptState.repoRelevance * 0.35 + conceptState.importance * 0.3 + (1 - conceptState.masteryEstimate) * 0.25;
}

function updateConceptStateForEvent<T extends TutorState['conceptStates'][number]>(conceptState: T, eventType: ReviewEventType, correct: boolean | undefined, now: string): T {
  if (eventType === 'shown' || eventType === 'revealed') return conceptState;
  if (eventType === 'marked_bad_card' || eventType === 'marked_wrong_evidence' || eventType === 'marked_duplicate') return conceptState;
  if (eventType === 'marked_useful') return { ...conceptState, importance: clamp(conceptState.importance + 0.1, 0, 1), repoRelevance: clamp(conceptState.repoRelevance + 0.1, 0, 1) };
  if (eventType === 'skipped' || eventType === 'marked_unsure' || eventType === 'deferred') return { ...conceptState, failedCount: conceptState.failedCount + 1, confidence: clamp(conceptState.confidence - 0.08, 0, 1), nextReviewAt: addDays(now, 1) };
  if (eventType === 'marked_wrong') return { ...conceptState, failedCount: conceptState.failedCount + 1, masteryEstimate: clamp(conceptState.masteryEstimate - 0.1, 0, 1), confidence: clamp(conceptState.confidence - 0.15, 0, 1), nextReviewAt: addDays(now, 1) };
  if (eventType === 'answered' || eventType === 'marked_correct' || eventType === 'delayed_probe_completed') {
    const isCorrect = correct ?? eventType === 'marked_correct';
    return {
      ...conceptState,
      activeRecallCount: conceptState.activeRecallCount + 1,
      correctCount: conceptState.correctCount + (isCorrect ? 1 : 0),
      failedCount: conceptState.failedCount + (isCorrect ? 0 : 1),
      masteryEstimate: clamp(conceptState.masteryEstimate + (isCorrect ? 0.18 : -0.12), 0, 1),
      confidence: clamp(conceptState.confidence + (isCorrect ? 0.14 : -0.1), 0, 1),
      lastTestedAt: now,
      nextReviewAt: addDays(now, isCorrect ? 3 : 1),
    };
  }
  return conceptState;
}
