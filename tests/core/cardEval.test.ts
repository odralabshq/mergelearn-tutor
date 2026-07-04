import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { scoreCard, runEval, DEFAULT_EVAL_THRESHOLD } from '../../src/core/cardEval.js';
import { seedEvalTargets } from '../../src/core/evalTargets.js';
import type { AuthorLlm, AuthorTarget } from '../../src/core/author.js';
import type { EndpointConfig } from '../../src/core/endpoint.js';

let dir = '';
const usable: EndpointConfig = { baseUrl: 'http://127.0.0.1:11434/v1', model: 'm', isCloud: false, usable: true };

const target: AuthorTarget = {
  conceptId: 'c1', conceptLabel: 'foo', path: 'src/a.ts', startLine: 2, endLine: 3, plane: 'local_behavior',
};

const goodDraft = JSON.stringify({
  prompt: 'What does foo() do when the module loads?',
  snippetPath: 'src/a.ts', snippetStartLine: 2, snippetEndLine: 3,
  expectedAnswer: 'It defines foo then invokes it once at load.',
  expectedFocus: ['foo'], explanationMarkdown: 'x', planeConfidence: 0.8,
});

/** Scripted LLM: author draft, then derived answer, then judge JSON. */
function scriptLlm(...responses: string[]): AuthorLlm {
  let i = 0;
  return { complete: async () => responses[Math.min(i++, responses.length - 1)] };
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mlt-eval-'));
  await mkdir(join(dir, 'src'), { recursive: true });
  await writeFile(join(dir, 'src', 'a.ts'), 'line1\nexport function foo() {}\nfoo();\nline4\n', 'utf8');
});

describe('scoreCard', () => {
  it('scores a fully-passing card near 1.0', async () => {
    const llm = scriptLlm(goodDraft, 'defines and calls foo', JSON.stringify({ agree: true, reason: 'same' }));
    const s = await scoreCard(dir, target, { llm, endpoint: usable, commitSha: 'sha' });
    expect(s.authored).toBe(true);
    expect(s.format).toBe(1);
    expect(s.freshness).toBe(1);
    expect(s.answerKey).toBe(1);
    expect(s.total).toBeCloseTo(1, 5);
  });

  it('answer-key disagreement drives total to 0 (gates alone earn nothing)', async () => {
    const llm = scriptLlm(goodDraft, 'something else', JSON.stringify({ agree: false, reason: 'no' }));
    const s = await scoreCard(dir, target, { llm, endpoint: usable, commitSha: 'sha' });
    expect(s.format).toBe(1);
    expect(s.freshness).toBe(1);
    expect(s.answerKey).toBe(0);
    // Under the gate model, passing format+freshness banks NOTHING; only the
    // answer-key signal scores. Disagree => total 0, not the old 0.6.
    expect(s.total).toBe(0);
    expect(s.notes).toContain('answer_key:disagree');
  });

  it('an unproven (skipped) answer key scores a grounded-but-unproven 0.5', async () => {
    // No usable endpoint => validateAnswerKey skips => neutral 0.5.
    const noEndpoint: EndpointConfig = { ...usable, usable: false };
    const llm = scriptLlm(goodDraft);
    const s = await scoreCard(dir, target, { llm, endpoint: noEndpoint, commitSha: 'sha' });
    if (s.authored) {
      expect(s.answerKey).toBe(0.5);
      expect(s.total).toBe(0.5);
    }
  });

  it('scores 0 and flags disqualified when the card fails to author', async () => {
    const llm = scriptLlm('garbage', 'garbage');
    const s = await scoreCard(dir, target, { llm, endpoint: usable, commitSha: 'sha', });
    expect(s.authored).toBe(false);
    expect(s.total).toBe(0);
    expect(s.disqualified).toBe('author');
  });
});

describe('runEval', () => {
  it('aggregates to a single score and passes at/above threshold', async () => {
    const llm = scriptLlm(goodDraft, 'defines and calls foo', JSON.stringify({ agree: true, reason: 'same' }));
    const report = await runEval(dir, [target], { llm, endpoint: usable, commitSha: 'sha' });
    expect(report.score).toBeCloseTo(1, 5);
    expect(report.passed).toBe(true);
    expect(report.authoredRate).toBe(1);
  });

  it('fails on an empty target set', async () => {
    const report = await runEval(dir, [], { endpoint: usable, commitSha: 'sha' });
    expect(report.passed).toBe(false);
    expect(report.threshold).toBe(DEFAULT_EVAL_THRESHOLD);
  });

  it('flags selfJudged=true when no independent judge is supplied', async () => {
    const llm = scriptLlm(goodDraft, 'defines and calls foo', JSON.stringify({ agree: true, reason: 'same' }));
    const report = await runEval(dir, [target], { llm, endpoint: usable, commitSha: 'sha' });
    expect(report.selfJudged).toBe(true);
  });

  it('flags selfJudged=false and routes judging to an independent judgeLlm', async () => {
    // Author model would self-agree; the independent judge DISAGREES. The judge
    // must win, proving deps.judgeLlm is the one consulted for validation.
    const author = scriptLlm(goodDraft, 'author self-derived', JSON.stringify({ agree: true, reason: 'self' }));
    const judge = scriptLlm('judge-derived answer', JSON.stringify({ agree: false, reason: 'independent no' }));
    const report = await runEval(dir, [target], { llm: author, judgeLlm: judge, endpoint: usable, commitSha: 'sha' });
    expect(report.selfJudged).toBe(false);
    expect(report.cards[0].answerKey).toBe(0);
    expect(report.cards[0].total).toBe(0);
  });
});

describe('seed eval targets', () => {
  it('cover every plane and are well-formed', () => {
    const planes = new Set(seedEvalTargets.map((t) => t.plane));
    expect(planes.size).toBe(6);
    for (const t of seedEvalTargets) {
      expect(t.path).toMatch(/^src\//);
      expect(t.endLine).toBeGreaterThan(t.startLine);
      expect(t.conceptLabel.length).toBeGreaterThan(3);
    }
  });
});
