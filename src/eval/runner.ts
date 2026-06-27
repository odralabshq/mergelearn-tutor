import { extractConcepts } from '../core/concepts.js';
import { evaluateCardQuality } from '../core/cardQuality.js';
import { enrichLearningItems } from '../core/enrichment.js';
import { collectCommits } from '../core/git.js';
import { activeLearningItems, mergeLearningState } from '../core/planner.js';
import { createEmptyState } from '../core/store.js';
import type { EvaluationAggregate, EvaluatedRepo, EvaluationRepoSpec, EvaluationRun, ManualRatingAverages, ManualRatingEvaluationSummary } from './types.js';

const MANUAL_RATING_FIELDS = ['relevance', 'evidence', 'answerability', 'usefulness', 'repeatability'] as const;

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Number((numerator / denominator).toFixed(4));
}

export async function evaluateRepo(spec: EvaluationRepoSpec): Promise<EvaluatedRepo> {
  const artifacts = await collectCommits(spec.repoPath, spec.since, spec.limit);
  const concepts = extractConcepts(artifacts);
  const state = mergeLearningState(createEmptyState(spec.repoPath), artifacts, concepts);
  const expected = new Set(spec.expectedConceptIds ?? []);
  const conceptFindings = concepts.map((concept) => ({
    id: concept.id,
    label: concept.label,
    kind: concept.kind,
    difficulty: concept.difficulty,
    evidenceCount: concept.evidence.length,
    evidencePaths: [...new Set(concept.evidence.map((item) => item.path))].slice(0, 8),
    grounded: concept.evidence.length > 0 && concept.evidence.every((item) => item.path.length > 0),
    expected: expected.has(concept.id),
  }));
  const activeCards = activeLearningItems(state);
  const cardFindings = activeCards.map((item) => ({
    id: item.id,
    title: item.title,
    type: item.type,
    conceptId: item.conceptId,
    evidenceCount: item.evidence.length,
    expectedFocusCount: item.expectedFocus.length,
    answerableHeuristic: item.evidence.length > 0 && item.prompt.trim().length >= 20 && item.expectedFocus.length > 0,
    quality: evaluateCardQuality(item, activeCards.filter((candidate) => candidate.id !== item.id)),
  }));
  const manualRatingSummary = summarizeManualRatings(spec.manualRatings ?? [], concepts.length + activeCards.length);
  const conceptIds = new Set(concepts.map((concept) => concept.id));
  const expectedConceptHits = [...expected].filter((id) => conceptIds.has(id));
  const missingExpectedConcepts = [...expected].filter((id) => !conceptIds.has(id));
  const warnings: string[] = [];
  if (artifacts.length === 0) warnings.push('No commits were collected for this repo/spec.');
  if (conceptFindings.length === 0) warnings.push('No concepts were extracted.');
  if (cardFindings.length === 0) warnings.push('No learning cards were generated.');
  const enrichment = spec.enrichmentProvider ? evaluateEnrichment(state, spec.enrichmentProvider) : undefined;
  return {
    spec,
    artifactCount: artifacts.length,
    conceptCount: concepts.length,
    cardCount: activeCards.length,
    conceptFindings,
    cardFindings,
    expectedConceptHits,
    missingExpectedConcepts,
    warnings,
    scores: {
      groundedConceptRate: rate(conceptFindings.filter((item) => item.grounded).length, conceptFindings.length),
      answerableCardRate: rate(cardFindings.filter((item) => item.answerableHeuristic).length, cardFindings.length),
      qualityReadyCardRate: rate(cardFindings.filter((item) => item.quality.verdict === 'ready').length, cardFindings.length),
      qualityNeedsReviewCardRate: rate(cardFindings.filter((item) => item.quality.verdict === 'needs_review').length, cardFindings.length),
      qualityBlockedCardRate: rate(cardFindings.filter((item) => item.quality.verdict === 'blocked').length, cardFindings.length),
      duplicateRiskCardRate: rate(cardFindings.filter((item) => item.quality.scores.duplicateRisk >= 0.75).length, cardFindings.length),
      manualRatingCount: manualRatingSummary.ratingCount,
      manualRatingCoverageRate: manualRatingSummary.manualRatingCoverageRate,
      manualRatingAverages: manualRatingSummary.averages,
      expectedConceptHitRate: expected.size === 0 ? null : rate(expectedConceptHits.length, expected.size),
    },
    manualRatingSummary,
    enrichment,
  };
}

function evaluateEnrichment(state: ReturnType<typeof mergeLearningState>, provider: NonNullable<EvaluationRepoSpec['enrichmentProvider']>) {
  const result = enrichLearningItems(state, undefined, { provider, limit: 5 });
  return {
    provider,
    networkUsed: result.networkUsed,
    enrichedCardCount: result.enrichedItems.length,
    provenanceOk: result.enrichedItems.every((item) => item.provenance.truthSource === 'deterministic-card' && item.networkUsed === false),
    comparisonReady: result.enrichedItems.length === Math.min(activeLearningItems(state).length, 5),
  };
}

export async function evaluateRepos(specs: EvaluationRepoSpec[]): Promise<EvaluationRun> {
  const repos = [];
  for (const spec of specs) repos.push(await evaluateRepo(spec));
  return { version: 1, createdAt: new Date().toISOString(), repos, aggregate: aggregate(repos) };
}

function aggregate(repos: EvaluatedRepo[]): EvaluationAggregate {
  const totalConcepts = repos.reduce((sum, repo) => sum + repo.conceptCount, 0);
  const totalCards = repos.reduce((sum, repo) => sum + repo.cardCount, 0);
  const grounded = repos.reduce((sum, repo) => sum + repo.conceptFindings.filter((item) => item.grounded).length, 0);
  const answerable = repos.reduce((sum, repo) => sum + repo.cardFindings.filter((item) => item.answerableHeuristic).length, 0);
  const qualityReady = repos.reduce((sum, repo) => sum + repo.cardFindings.filter((item) => item.quality.verdict === 'ready').length, 0);
  const qualityNeedsReview = repos.reduce((sum, repo) => sum + repo.cardFindings.filter((item) => item.quality.verdict === 'needs_review').length, 0);
  const qualityBlocked = repos.reduce((sum, repo) => sum + repo.cardFindings.filter((item) => item.quality.verdict === 'blocked').length, 0);
  const duplicateRisk = repos.reduce((sum, repo) => sum + repo.cardFindings.filter((item) => item.quality.scores.duplicateRisk >= 0.75).length, 0);
  const manualRatingCount = repos.reduce((sum, repo) => sum + repo.manualRatingSummary.ratingCount, 0);
  const manualRatedTargets = repos.reduce((sum, repo) => sum + Math.round(repo.manualRatingSummary.manualRatingCoverageRate * (repo.conceptCount + repo.cardCount)), 0);
  const manualRatings = repos.flatMap((repo) => repo.spec.manualRatings ?? []);
  const expectedRepos = repos.filter((repo) => repo.scores.expectedConceptHitRate !== null);
  return {
    repoCount: repos.length,
    totalArtifacts: repos.reduce((sum, repo) => sum + repo.artifactCount, 0),
    totalConcepts,
    totalCards,
    groundedConceptRate: rate(grounded, totalConcepts),
    answerableCardRate: rate(answerable, totalCards),
    qualityReadyCardRate: rate(qualityReady, totalCards),
    qualityNeedsReviewCardRate: rate(qualityNeedsReview, totalCards),
    qualityBlockedCardRate: rate(qualityBlocked, totalCards),
    duplicateRiskCardRate: rate(duplicateRisk, totalCards),
    manualRatingCount,
    manualRatingCoverageRate: rate(manualRatedTargets, totalConcepts + totalCards),
    manualRatingAverages: averageManualRatings(manualRatings),
    expectedConceptHitRate: expectedRepos.length === 0 ? null : rate(expectedRepos.reduce((sum, repo) => sum + (repo.scores.expectedConceptHitRate ?? 0), 0), expectedRepos.length),
  };
}

function summarizeManualRatings(ratings: EvaluationRepoSpec['manualRatings'], targetCount: number): ManualRatingEvaluationSummary {
  const safeRatings = ratings ?? [];
  return {
    ratingCount: safeRatings.length,
    conceptRatingCount: safeRatings.filter((rating) => rating.targetType === 'concept').length,
    cardRatingCount: safeRatings.filter((rating) => rating.targetType === 'card').length,
    manualRatingCoverageRate: rate(new Set(safeRatings.map((rating) => `${rating.targetType}:${rating.targetId}`)).size, targetCount),
    averages: averageManualRatings(safeRatings),
  };
}

function averageManualRatings(ratings: NonNullable<EvaluationRepoSpec['manualRatings']>): ManualRatingAverages {
  const averages: ManualRatingAverages = {};
  for (const field of MANUAL_RATING_FIELDS) {
    const values = ratings.map((rating) => rating[field]).filter((value): value is number => value !== undefined);
    if (values.length > 0) averages[field] = Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
  }
  return averages;
}
