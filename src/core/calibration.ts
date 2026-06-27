import type { LearningEvent, TutorState } from './types.js';

export type CalibrationSummary = {
  pairedCount: number;
  averageConfidence: number;
  accuracy: number;
  brierScore: number;
  overconfidenceGap: number;
};

const EMPTY_SUMMARY: CalibrationSummary = {
  pairedCount: 0,
  averageConfidence: 0,
  accuracy: 0,
  brierScore: 0,
  overconfidenceGap: 0,
};

export function summarizeCalibration(state: TutorState): CalibrationSummary {
  const latestRevealByItem = new Map<string, LearningEvent>();
  const pairs: Array<{ confidence: number; correct: boolean }> = [];

  for (const event of state.learningEvents.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (event.eventType === 'revealed' && event.confidenceBeforeReveal !== undefined) {
      latestRevealByItem.set(event.itemId, event);
      continue;
    }
    if ((event.eventType === 'answered' || event.eventType === 'marked_correct' || event.eventType === 'marked_wrong') && event.correct !== undefined) {
      const reveal = latestRevealByItem.get(event.itemId);
      if (reveal?.confidenceBeforeReveal === undefined) continue;
      pairs.push({ confidence: confidenceToProbability(reveal.confidenceBeforeReveal), correct: event.correct });
    }
  }

  if (pairs.length === 0) return EMPTY_SUMMARY;
  const averageConfidence = average(pairs.map((pair) => pair.confidence));
  const accuracy = average(pairs.map((pair) => pair.correct ? 1 : 0));
  const brierScore = average(pairs.map((pair) => (pair.confidence - (pair.correct ? 1 : 0)) ** 2));
  return { pairedCount: pairs.length, averageConfidence, accuracy, brierScore, overconfidenceGap: averageConfidence - accuracy };
}

function confidenceToProbability(value: number): number {
  return Math.max(0, Math.min(1, value / 5));
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
