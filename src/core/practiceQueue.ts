import { activeLearningItems } from './planner.js';
import type { LearningItem, TutorState } from './types.js';

export type PracticeQueueItem = {
  id: string;
  title: string;
  batchId?: string;
  courseId?: string;
  questionPlane: string;
  difficulty: string;
};

export type PracticeQueue = {
  items: PracticeQueueItem[];
  index: number;
  total: number;
  reviewedInSession: string[];
};

const GRADE_EVENT_TYPES = new Set(['answered', 'marked_correct', 'marked_wrong', 'marked_unsure']);

export function globallyReviewedItemIds(state: TutorState): Set<string> {
  const ids = new Set<string>();
  for (const event of state.learningEvents) {
    if (GRADE_EVENT_TYPES.has(event.eventType)) ids.add(event.itemId);
  }
  return ids;
}

export function sortPracticeQueue(state: TutorState): LearningItem[] {
  const reviewed = globallyReviewedItemIds(state);
  const batchOrder = new Map((state.cardBatches ?? []).map((batch, index) => [batch.id, index]));
  const batchCreated = new Map((state.cardBatches ?? []).map((batch) => [batch.id, batch.createdAt]));
  return activeLearningItems(state).slice().sort((a, b) => {
    const aDone = reviewed.has(a.id);
    const bDone = reviewed.has(b.id);
    if (aDone !== bDone) return aDone ? 1 : -1;
    const aBatch = a.batchId ? batchOrder.get(a.batchId) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
    const bBatch = b.batchId ? batchOrder.get(b.batchId) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
    if (aBatch !== bBatch) return aBatch - bBatch;
    const aCreated = a.batchId ? batchCreated.get(a.batchId) ?? a.createdAt : a.createdAt;
    const bCreated = b.batchId ? batchCreated.get(b.batchId) ?? b.createdAt : b.createdAt;
    if (aCreated !== bCreated) return aCreated.localeCompare(bCreated);
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export function parseReviewedInSession(value: string | null | undefined): string[] {
  if (!value?.trim()) return [];
  return value.split(',').map((id) => id.trim()).filter(Boolean);
}

export function resolvePracticeIndex(queue: LearningItem[], requestedIndex: number | undefined, reviewedInSession: string[]): number {
  if (queue.length === 0) return 0;
  if (requestedIndex !== undefined && Number.isFinite(requestedIndex) && requestedIndex >= 0 && requestedIndex < queue.length) {
    return requestedIndex;
  }
  const sessionReviewed = new Set(reviewedInSession);
  const next = queue.findIndex((item) => !sessionReviewed.has(item.id));
  return next >= 0 ? next : 0;
}

export function buildPracticeQueue(state: TutorState, options: { index?: number; reviewedInSession?: string[] } = {}): PracticeQueue {
  const queue = sortPracticeQueue(state);
  const reviewedInSession = options.reviewedInSession ?? [];
  const index = resolvePracticeIndex(queue, options.index, reviewedInSession);
  return {
    items: queue.map(toPracticeQueueItem),
    index,
    total: queue.length,
    reviewedInSession,
  };
}

export function practiceItemAt(state: TutorState, options: { index?: number; reviewedInSession?: string[] } = {}): { item?: LearningItem; queue: PracticeQueue } {
  const queue = buildPracticeQueue(state, options);
  const sorted = sortPracticeQueue(state);
  return { item: sorted[queue.index], queue };
}

function toPracticeQueueItem(item: LearningItem): PracticeQueueItem {
  return {
    id: item.id,
    title: item.title,
    batchId: item.batchId,
    courseId: item.courseId,
    questionPlane: item.questionPlane,
    difficulty: item.difficulty,
  };
}
