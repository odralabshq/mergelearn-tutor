import type { EnrichmentProvider } from '../core/enrichment.js';
import type { CardQualityResult, ConceptKind, Difficulty, LearningItemType } from '../core/types.js';

export type EvaluationRepoSpec = {
  id: string;
  name: string;
  repoPath: string;
  since: string;
  limit: number;
  expectedConceptIds?: string[];
  enrichmentProvider?: EnrichmentProvider;
};

export type EnrichmentEvaluation = {
  provider: EnrichmentProvider;
  networkUsed: false;
  enrichedCardCount: number;
  provenanceOk: boolean;
  comparisonReady: boolean;
};

export type ConceptEvaluation = {
  id: string;
  label: string;
  kind: ConceptKind;
  difficulty: Difficulty;
  evidenceCount: number;
  evidencePaths: string[];
  grounded: boolean;
  expected: boolean;
};

export type CardEvaluation = {
  id: string;
  title: string;
  type: LearningItemType;
  conceptId: string;
  evidenceCount: number;
  expectedFocusCount: number;
  answerableHeuristic: boolean;
  quality: CardQualityResult;
};

export type EvaluationScores = {
  groundedConceptRate: number;
  answerableCardRate: number;
  qualityReadyCardRate: number;
  qualityNeedsReviewCardRate: number;
  qualityBlockedCardRate: number;
  duplicateRiskCardRate: number;
  expectedConceptHitRate: number | null;
};

export type EvaluatedRepo = {
  spec: EvaluationRepoSpec;
  artifactCount: number;
  conceptCount: number;
  cardCount: number;
  conceptFindings: ConceptEvaluation[];
  cardFindings: CardEvaluation[];
  expectedConceptHits: string[];
  missingExpectedConcepts: string[];
  warnings: string[];
  scores: EvaluationScores;
  enrichment?: EnrichmentEvaluation;
};

export type EvaluationAggregate = {
  repoCount: number;
  totalArtifacts: number;
  totalConcepts: number;
  totalCards: number;
  groundedConceptRate: number;
  answerableCardRate: number;
  qualityReadyCardRate: number;
  qualityNeedsReviewCardRate: number;
  qualityBlockedCardRate: number;
  duplicateRiskCardRate: number;
  expectedConceptHitRate: number | null;
};

export type EvaluationRun = {
  version: 1;
  createdAt: string;
  repos: EvaluatedRepo[];
  aggregate: EvaluationAggregate;
};
