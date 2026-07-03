import { describe, expect, it } from 'vitest';

import { gradeAnswer } from '../../src/core/grade.js';
import { decideStaging } from '../../src/core/staging.js';
import type { AuthorLlm } from '../../src/core/author.js';
import type { EndpointConfig } from '../../src/core/endpoint.js';
import type { VerifyResult } from '../../src/core/verify.js';

const usable: EndpointConfig = { baseUrl: 'http://127.0.0.1:11434/v1', model: 'm', isCloud: false, usable: true };

function recordingLlm(responses: string[]): { llm: AuthorLlm; seen: string[] } {
  const seen: string[] = [];
  let i = 0;
  return { seen, llm: { complete: async (m) => { seen.push(m.map((x) => x.content).join('\n')); return responses[Math.min(i++, responses.length - 1)]; } } };
}

const base = {
  prompt: 'What does foo() do?',
  snippet: 'export function foo() {}\nfoo();',
  expectedAnswer: 'It defines foo then invokes it.',
  userAnswer: 'It declares foo and calls it once.',
};

describe('gradeAnswer (code-as-oracle)', () => {
  it('is ungraded (never throws) with no LLM', async () => {
    const r = await gradeAnswer(base, { endpoint: usable });
    expect(r.verdict).toBe('ungraded');
  });

  it('marks an empty answer incorrect without calling the LLM', async () => {
    const { llm, seen } = recordingLlm(['x']);
    const r = await gradeAnswer({ ...base, userAnswer: '  ' }, { llm, endpoint: usable });
    expect(r.verdict).toBe('incorrect');
    expect(seen.length).toBe(0);
  });

  it('passes the snippet as ground truth and the key only as a reference', async () => {
    const { llm, seen } = recordingLlm([JSON.stringify({ verdict: 'correct', reason: 'matches snippet' })]);
    await gradeAnswer(base, { llm, endpoint: usable });
    expect(seen[0]).toContain('ground truth');
    expect(seen[0]).toContain('may be imperfect');
  });

  it('returns the graded verdict', async () => {
    const { llm } = recordingLlm([JSON.stringify({ verdict: 'partial', reason: 'close' })]);
    const r = await gradeAnswer(base, { llm, endpoint: usable });
    expect(r.verdict).toBe('partial');
  });

  it('is ungraded when the grader output is unparseable', async () => {
    const { llm } = recordingLlm(['no json']);
    const r = await gradeAnswer(base, { llm, endpoint: usable });
    expect(r.verdict).toBe('ungraded');
  });
});

const okVerify: VerifyResult = { ok: true, issues: [] };
const badVerify: VerifyResult = { ok: false, issues: [{ code: 'not_a_question', message: 'x' }] };

describe('decideStaging (promotion gate)', () => {
  it('promotes to active when format ok and answer key agrees', () => {
    expect(decideStaging(okVerify, 'agree').status).toBe('active');
  });

  it('sends to needs_review when format fails', () => {
    expect(decideStaging(badVerify, 'agree').status).toBe('needs_review');
  });

  it('sends to needs_review when the answer key disagrees', () => {
    const d = decideStaging(okVerify, 'disagree');
    expect(d.status).toBe('needs_review');
    expect(d.reasons).toContain('answer_key:disagree');
  });

  it('activates but flags when no oracle was available (skipped)', () => {
    const d = decideStaging(okVerify, 'skipped');
    expect(d.status).toBe('active');
    expect(d.reasons).toContain('answer_key:skipped_no_oracle');
  });
});
