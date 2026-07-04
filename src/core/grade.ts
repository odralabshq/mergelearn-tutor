/**
 * Free-text answer grading (S6c, doc 02 + doc 05 fix A).
 *
 * The grader is given the SNIPPET as the oracle and told the stored expectedAnswer
 * is a REFERENCE, not ground truth - it grades against the code. This closes the
 * answer-key oracle hole from the grading side: a wrong key cannot mark a correct
 * user wrong, because the code is what decides.
 *
 * LLM optional: with no usable endpoint the verdict is 'ungraded' (never throws);
 * the caller then falls back to self-mark / confidence-only review (doc 02).
 */

import { extractFirstJson, type EndpointConfig } from './endpoint.js';
import type { AuthorLlm } from './author.js';

export type GradeVerdict = 'correct' | 'partial' | 'incorrect' | 'ungraded';

export interface GradeResult {
  verdict: GradeVerdict;
  reason?: string;
}

export interface GradeInput {
  prompt: string;
  snippet: string;
  /** Reference only - NOT ground truth. The snippet is the oracle. */
  expectedAnswer: string;
  userAnswer: string;
}

/** Grade a free-text answer with the code snippet as ground truth. */
export async function gradeAnswer(
  input: GradeInput,
  deps: { llm?: AuthorLlm; endpoint: EndpointConfig },
): Promise<GradeResult> {
  if (!deps.llm || !deps.endpoint.usable) {
    return { verdict: 'ungraded', reason: deps.endpoint.reason ?? 'no usable LLM endpoint' };
  }
  if (!input.userAnswer.trim()) {
    return { verdict: 'incorrect', reason: 'empty answer' };
  }
  const messages = [
    { role: 'system' as const, content: 'You grade a learner\'s answer about a code snippet. The SNIPPET is ground truth. The reference answer is a hint, not authoritative - if it conflicts with the snippet, trust the snippet. Return strict JSON only.' },
    { role: 'user' as const, content: [
      `Snippet (ground truth):\n${input.snippet}`,
      `Question: ${input.prompt}`,
      `Reference answer (may be imperfect): ${input.expectedAnswer}`,
      `Learner answer: ${input.userAnswer}`,
      'Grade the learner answer against the snippet. JSON: { "verdict": "correct" | "partial" | "incorrect", "reason": string }.',
    ].join('\n\n') },
  ];
  const raw = await deps.llm.complete(messages);
  const parsed = extractFirstJson<{ verdict?: string; reason?: string }>(raw);
  const v = parsed?.verdict;
  if (v === 'correct' || v === 'partial' || v === 'incorrect') {
    return { verdict: v, reason: (parsed?.reason ?? '').trim() };
  }
  return { verdict: 'ungraded', reason: 'grader returned no parseable verdict' };
}
