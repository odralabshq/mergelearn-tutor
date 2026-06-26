import type { ManualRating, TutorState } from './types.js';
import { nowIso, stableId } from './util.js';

export type ManualRatingInput = {
  targetType: 'concept' | 'card';
  targetId: string;
  relevance?: number;
  evidence?: number;
  answerability?: number;
  usefulness?: number;
  repeatability?: number;
  note?: string;
};

const SCORE_FIELDS = ['relevance', 'evidence', 'answerability', 'usefulness', 'repeatability'] as const;
type ScoreField = typeof SCORE_FIELDS[number];

export function recordManualRating(state: TutorState, input: ManualRatingInput): TutorState {
  const conceptId = conceptIdForTarget(state, input.targetType, input.targetId);
  const scores = Object.fromEntries(SCORE_FIELDS.map((field) => [field, cleanScore(input[field])]).filter(([, value]) => value !== undefined)) as Partial<Record<ScoreField, number>>;
  if (Object.keys(scores).length === 0) throw new Error('Manual rating requires at least one 1-5 score.');
  const now = nowIso();
  const rating: ManualRating = {
    id: stableId('rating', [input.targetType, input.targetId, JSON.stringify(scores), input.note ?? '', now]),
    targetType: input.targetType,
    targetId: input.targetId,
    conceptId,
    ...scores,
    note: input.note,
    createdAt: now,
  };
  return { ...state, manualRatings: [...state.manualRatings, rating] };
}

function conceptIdForTarget(state: TutorState, targetType: 'concept' | 'card', targetId: string): string | undefined {
  if (targetType === 'concept') {
    if (!state.concepts.some((concept) => concept.id === targetId)) throw new Error(`Unknown concept: ${targetId}`);
    return targetId;
  }
  const item = state.learningItems.find((candidate) => candidate.id === targetId);
  if (!item) throw new Error(`Unknown learning item: ${targetId}`);
  return item.conceptId;
}

function cleanScore(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 1 || value > 5) throw new Error(`Manual rating scores must be whole numbers from 1 to 5; received ${value}.`);
  return value;
}

export function renderManualRatingSummary(state: TutorState): string {
  const lines = ['Manual rating summary', '', `Ratings: ${state.manualRatings.length}`];
  if (state.manualRatings.length === 0) {
    lines.push('', 'No manual ratings yet. Use `mergelearn-tutor rate --repo <path> --item <id> --usefulness 4 --answerability 5`.');
    return `${lines.join('\n')}\n`;
  }
  for (const field of SCORE_FIELDS) {
    const average = averageScore(state.manualRatings, field);
    if (average !== undefined) lines.push(`Average ${field}: ${average.toFixed(1)}/5`);
  }
  lines.push('', 'Recent ratings:');
  for (const rating of state.manualRatings.slice(-8).reverse()) {
    const targetLabel = labelForRating(state, rating);
    const scores = SCORE_FIELDS.map((field) => rating[field] === undefined ? undefined : `${field} ${rating[field]}/5`).filter(Boolean).join(', ');
    lines.push(`- ${targetLabel}: ${scores}${rating.note ? ` — ${rating.note}` : ''}`);
  }
  return `${lines.join('\n')}\n`;
}

function averageScore(ratings: ManualRating[], field: ScoreField): number | undefined {
  const values = ratings.map((rating) => rating[field]).filter((value): value is number => value !== undefined);
  if (values.length === 0) return undefined;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function labelForRating(state: TutorState, rating: ManualRating): string {
  if (rating.targetType === 'concept') {
    return state.concepts.find((concept) => concept.id === rating.targetId)?.label ?? rating.targetId;
  }
  return state.learningItems.find((item) => item.id === rating.targetId)?.title ?? rating.targetId;
}
