import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { createAllEvalFixtures } from '../../src/eval/fixtures.js';
import { renderEvaluationMarkdown, writeEvaluationOutputs } from '../../src/eval/report.js';
import { evaluateRepos } from '../../src/eval/runner.js';

describe('evaluation harness', () => {
  it('evaluates fixture repos and reports expected concept coverage', async () => {
    const specs = await createAllEvalFixtures();
    specs[0]!.enrichmentProvider = 'fake';
    specs[0]!.manualRatings = [
      {
        id: 'rating_fixture_auth_relevance',
        targetType: 'concept',
        targetId: 'security.auth_boundary',
        conceptId: 'security.auth_boundary',
        relevance: 5,
        evidence: 4,
        note: 'manual calibration seed for auth fixture',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const run = await evaluateRepos(specs);
    expect(run.repos).toHaveLength(3);
    expect(run.repos[0]?.enrichment?.provenanceOk).toBe(true);
    expect(run.repos[0]?.enrichment?.networkUsed).toBe(false);
    expect(run.aggregate.totalConcepts).toBeGreaterThanOrEqual(8);
    expect(run.aggregate.totalCards).toBeGreaterThanOrEqual(6);
    expect(run.aggregate.groundedConceptRate).toBe(1);
    expect(run.aggregate.answerableCardRate).toBe(1);
    expect(run.aggregate.qualityReadyCardRate).toBeGreaterThan(0);
    expect(run.aggregate.qualityBlockedCardRate).toBe(0);
    expect(run.aggregate.duplicateRiskCardRate).toBeGreaterThanOrEqual(0);
    expect(run.aggregate.manualRatingCount).toBe(1);
    expect(run.aggregate.manualRatingCoverageRate).toBeGreaterThan(0);
    expect(run.aggregate.manualRatingAverages.relevance).toBe(5);
    expect(run.aggregate.manualRatingAverages.evidence).toBe(4);
    expect(run.repos[0]?.manualRatingSummary.ratingCount).toBe(1);
    expect(run.repos[0]?.cardFindings[0]?.quality.verdict).toMatch(/ready|needs_review/);
    expect(run.aggregate.expectedConceptHitRate).toBeGreaterThanOrEqual(0.8);
    const markdown = renderEvaluationMarkdown(run);
    expect(markdown).toContain('MergeLearn Tutor Evaluation Report');
    expect(markdown).toContain('Quality ready card rate');
    expect(markdown).toContain('duplicate risk');
    expect(markdown).toContain('Manual rating calibration');
    expect(markdown).toContain('Manual rating coverage');
    expect(markdown).toContain('Average relevance: 5.0/5');
    expect(markdown).toContain('Manual rating rubric');
  });

  it('writes JSON and Markdown report files', async () => {
    const specs = await createAllEvalFixtures();
    const run = await evaluateRepos(specs.slice(0, 1));
    const out = await mkdtemp(path.join(os.tmpdir(), 'mergelearn-tutor-eval-output-'));
    const outputs = await writeEvaluationOutputs(run, out);
    expect(await readFile(outputs.jsonPath, 'utf8')).toContain('fixture-typed-auth');
    expect(await readFile(outputs.markdownPath, 'utf8')).toContain('Typed auth fixture');
  });
});
