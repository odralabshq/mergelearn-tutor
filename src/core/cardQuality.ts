import type { CardQualityResult, CardQualityVerdict, LearningItem, QuestionBankEntry } from './types.js';
import { clamp } from './util.js';

export function evaluateCardQuality(item: LearningItem, existing: LearningItem[] = [], options: { sourceQuestion?: QuestionBankEntry } = {}): CardQualityResult {
  const scores = {
    evidence: evidenceScore(item),
    answerability: answerabilityScore(item),
    specificity: specificityScore(item),
    duplicateRisk: duplicateRisk(item, existing),
    sourceDiversity: sourceDiversityScore(item),
  };
  const warnings = warningsFor(item, scores, options.sourceQuestion);
  const blocking = scores.evidence < 0.5 || scores.answerability < 0.5 || scores.specificity < 0.4;
  const needsReview = scores.duplicateRisk >= 0.75 || warnings.length > 0 || Math.min(scores.evidence, scores.answerability, scores.specificity, scores.sourceDiversity) < 0.7;
  return {
    verdict: blocking ? 'blocked' : needsReview ? 'needs_review' : 'ready',
    scores,
    warnings,
  };
}

function evidenceScore(item: LearningItem): number {
  const evidence = item.evidence ?? [];
  if (evidence.length === 0) return 0;
  const withPath = evidence.filter((entry) => entry.path.trim().length > 0).length;
  const withSnippet = evidence.filter((entry) => entry.snippet?.trim()).length;
  return round(clamp(0.35 + Math.min(0.35, evidence.length * 0.18) + withPath / evidence.length * 0.15 + Math.min(0.15, withSnippet * 0.08), 0, 1));
}

function answerabilityScore(item: LearningItem): number {
  let score = 0;
  if (item.prompt.trim().length >= 40) score += 0.3;
  if ((item.expectedFocus ?? []).length >= 2) score += 0.25;
  if (item.explanationMarkdown.trim().length >= 40) score += 0.25;
  if ((item.evidence ?? []).length > 0) score += 0.2;
  return round(score);
}

function specificityScore(item: LearningItem): number {
  const prompt = item.prompt.toLowerCase();
  const pathMentioned = prompt.includes(item.snippet.path.toLowerCase()) || (item.evidence ?? []).some((entry) => prompt.includes(entry.path.toLowerCase()));
  const conceptWords = item.title.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 4);
  const conceptMentioned = conceptWords.some((word) => prompt.includes(word));
  let score = 0.25;
  if (pathMentioned) score += 0.35;
  if (conceptMentioned) score += 0.2;
  if (item.prompt.trim().length >= 60) score += 0.2;
  return round(clamp(score, 0, 1));
}

function sourceDiversityScore(item: LearningItem): number {
  const paths = new Set((item.evidence ?? []).map((entry) => entry.path));
  if (paths.size === 0) return 0;
  if (paths.size === 1) return 0.55;
  if (paths.size === 2) return 0.85;
  return 1;
}

function duplicateRisk(item: LearningItem, existing: LearningItem[]): number {
  if (existing.length === 0) return 0;
  const prompt = normalize(item.prompt);
  return round(Math.max(...existing.filter((candidate) => candidate.id !== item.id).map((candidate) => {
    if (candidate.conceptId === item.conceptId && candidate.snippet.path === item.snippet.path) return 0.9;
    if (normalize(candidate.prompt) === prompt) return 1;
    return 0;
  }), 0));
}

function warningsFor(item: LearningItem, scores: CardQualityResult['scores'], sourceQuestion?: QuestionBankEntry): string[] {
  const warnings: string[] = [];
  if ((item.evidence ?? []).length === 0) warnings.push('missing evidence');
  if (item.prompt.trim().length < 40) warnings.push('prompt too vague');
  if ((item.expectedFocus ?? []).length < 2) warnings.push('expected focus too thin');
  if (scores.duplicateRisk >= 0.75) warnings.push('duplicate risk');
  if (scores.sourceDiversity < 0.7) warnings.push('single-source card');
  if (sourceQuestion?.author.provider === 'remote' && !sourceQuestion.deepExplanation?.trim()) {
    warnings.push('missing deep explanation from LLM question');
  }
  return warnings;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function round(value: number): number {
  return Number(value.toFixed(4));
}
