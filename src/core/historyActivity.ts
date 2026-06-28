import type { LearningEvent, ReviewEventType, TutorState } from './types.js';

export type HistoryActivityRow = {
  id: string;
  eventType: ReviewEventType;
  itemId: string;
  conceptId: string;
  title: string;
  detail: string;
  correct?: boolean;
  createdAt: string;
};

export type HistoryActivityPage = {
  items: HistoryActivityRow[];
  total: number;
  limit: number;
  offset: number;
  type?: string;
};

export function buildHistoryActivity(
  state: TutorState,
  options: { type?: string; limit?: number; offset?: number } = {},
): HistoryActivityPage {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);
  const cardById = new Map(state.learningItems.map((item) => [item.id, item]));
  let events = state.learningEvents.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (options.type && options.type !== 'all') {
    events = events.filter((event) => event.eventType === options.type);
  }
  const total = events.length;
  const page = events.slice(offset, offset + limit);
  return {
    items: page.map((event) => toActivityRow(event, cardById.get(event.itemId)?.title)),
    total,
    limit,
    offset,
    type: options.type,
  };
}

function toActivityRow(event: LearningEvent, title?: string): HistoryActivityRow {
  return {
    id: event.id,
    eventType: event.eventType,
    itemId: event.itemId,
    conceptId: event.conceptId,
    title: title ?? event.itemId,
    detail: activityDetail(event),
    correct: event.correct,
    createdAt: event.createdAt,
  };
}

function activityDetail(event: LearningEvent): string {
  if (event.answerText) return event.answerText;
  if (event.correct === true) return 'answered correctly';
  if (event.correct === false) return 'missed answer';
  if (event.note) return event.note;
  return 'review feedback';
}
