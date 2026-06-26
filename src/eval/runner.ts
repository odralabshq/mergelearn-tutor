import { extractConcepts } from '../core/concepts.js';
import { collectCommits } from '../core/git.js';
import { mergeLearningState } from '../core/planner.js';
import { createEmptyState } from '../core/store.js';
import type { EvaluationAggregate, EvaluatedRepo, EvaluationRepoSpec, EvaluationRun } from './types.js';

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
  const cardFindings = state.learningItems.map((item) => ({
    id: item.id,
    title: item.title,
    type: item.type,
    conceptId: item.conceptId,
    evidenceCount: item.evidence.length,
    expectedFocusCount: item.expectedFocus.length,
    answerableHeuristic: item.evidence.length > 0 && item.prompt.trim().length >= 20 && item.expectedFocus.length > 0,
  }));
  const conceptIds = new Set(concepts.map((concept) => concept.id));
  const expectedConceptHits = [...expected].filter((id) => conceptIds.has(id));
  const missingExpectedConcepts = [...expected].filter((id) => !conceptIds.has(id));
  const warnings: string[] = [];
  if (artifacts.length === 0) warnings.push('No commits were collected for this repo/spec.');
  if (conceptFindings.length === 0) warnings.push('No concepts were extracted.');
  if (cardFindings.length === 0) warnings.push('No learning cards were generated.');
  return {
    spec,
    artifactCount: artifacts.length,
    conceptCount: concepts.length,
    cardCount: state.learningItems.length,
    conceptFindings,
    cardFindings,
    expectedConceptHits,
    missingExpectedConcepts,
    warnings,
    scores: {
      groundedConceptRate: rate(conceptFindings.filter((item) => item.grounded).length, conceptFindings.length),
      answerableCardRate: rate(cardFindings.filter((item) => item.answerableHeuristic).length, cardFindings.length),
      expectedConceptHitRate: expected.size === 0 ? null : rate(expectedConceptHits.length, expected.size),
    },
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
  const expectedRepos = repos.filter((repo) => repo.scores.expectedConceptHitRate !== null);
  return {
    repoCount: repos.length,
    totalArtifacts: repos.reduce((sum, repo) => sum + repo.artifactCount, 0),
    totalConcepts,
    totalCards,
    groundedConceptRate: rate(grounded, totalConcepts),
    answerableCardRate: rate(answerable, totalCards),
    expectedConceptHitRate: expectedRepos.length === 0 ? null : rate(expectedRepos.reduce((sum, repo) => sum + (repo.scores.expectedConceptHitRate ?? 0), 0), expectedRepos.length),
  };
}
