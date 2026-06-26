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
    const run = await evaluateRepos(specs);
    expect(run.repos).toHaveLength(3);
    expect(run.repos[0]?.enrichment?.provenanceOk).toBe(true);
    expect(run.repos[0]?.enrichment?.networkUsed).toBe(false);
    expect(run.aggregate.totalConcepts).toBeGreaterThanOrEqual(8);
    expect(run.aggregate.totalCards).toBeGreaterThanOrEqual(6);
    expect(run.aggregate.groundedConceptRate).toBe(1);
    expect(run.aggregate.answerableCardRate).toBe(1);
    expect(run.aggregate.expectedConceptHitRate).toBeGreaterThanOrEqual(0.8);
    const markdown = renderEvaluationMarkdown(run);
    expect(markdown).toContain('MergeLearn Tutor Evaluation Report');
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
