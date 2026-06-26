import type { ConceptKind, Difficulty, LearningItemType } from '../core/types.js';

export type EvaluationRepoSpec = {
  id: string;
  name: string;
  repoPath: string;
  since: string;
  limit: number;
  expectedConceptIds?: string[];
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
};

export type EvaluationScores = {
  groundedConceptRate: number;
  answerableCardRate: number;
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
};

export type EvaluationAggregate = {
  repoCount: number;
  totalArtifacts: number;
  totalConcepts: number;
  totalCards: number;
  groundedConceptRate: number;
  answerableCardRate: number;
  expectedConceptHitRate: number | null;
};

export type EvaluationRun = {
  version: 1;
  createdAt: string;
  repos: EvaluatedRepo[];
  aggregate: EvaluationAggregate;
};
