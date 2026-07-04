/**
 * Independent answer-key validation (S6b, doc 05 fix A - the highest-priority hole).
 *
 * The author writes the question AND the answer key. If nothing re-derives the
 * answer from the code, a confidently-wrong key marks a right user wrong or
 * trains a misconception. This module is the independent oracle:
 *
 *  1. deriveAnswer  - a SECOND LLM pass sees only the snippet + question (NEVER
 *     the author's expectedAnswer) and derives its own answer. Blindness is the
 *     whole point; seeing the key would collapse this into rubber-stamping.
 *  2. judgeAgreement - a judgment call sees the snippet + both answers and
 *     decides whether they agree, with the snippet as the oracle.
 *
 * The LLM is optional: with no usable endpoint the verdict is 'skipped' (never
 * throws). Disagreement downgrades the card (caller sends it to needs_review).
 */

import { extractFirstJson, type EndpointConfig } from './endpoint.js';
import type { AuthorLlm } from './author.js';

export type AnswerKeyVerdict = 'agree' | 'disagree' | 'skipped';

export interface AnswerKeyResult {
  verdict: AnswerKeyVerdict;
  derivedAnswer?: string;
  reason?: string;
}

/** Blind derivation: the model gets snippet + question ONLY, no author answer. */
export async function deriveAnswer(
  llm: AuthorLlm,
  input: { prompt: string; snippet: string; path: string },
): Promise<string> {
  const messages = [
    { role: 'system' as const, content: 'You answer a question about a code snippet using ONLY the snippet as ground truth. Be concise and concrete.' },
    { role: 'user' as const, content: [
      `File: ${input.path}`,
      `Snippet:\n${input.snippet}`,
      `Question: ${input.prompt}`,
      'Answer from the snippet alone. Do not speculate beyond it.',
    ].join('\n\n') },
  ];
  return (await llm.complete(messages)).trim();
}

/**
 * Judge whether two answers agree, with the snippet as the oracle. Returns
 * strict JSON { agree: boolean, reason: string }. Tolerant-parsed.
 */
export async function judgeAgreement(
  llm: AuthorLlm,
  input: { prompt: string; snippet: string; authorAnswer: string; derivedAnswer: string },
): Promise<{ agree: boolean; reason: string }> {
  const messages = [
    { role: 'system' as const, content: 'You judge whether two answers to a code question are equivalent in substance. The snippet is the ground truth. Return strict JSON only.' },
    { role: 'user' as const, content: [
      `Snippet:\n${input.snippet}`,
      `Question: ${input.prompt}`,
      `Answer A (author): ${input.authorAnswer}`,
      `Answer B (independent): ${input.derivedAnswer}`,
      'Do A and B agree on the substance the snippet supports? JSON: { "agree": boolean, "reason": string }.',
    ].join('\n\n') },
  ];
  const raw = await llm.complete(messages);
  const parsed = extractFirstJson<{ agree?: boolean; reason?: string }>(raw);
  if (!parsed || typeof parsed.agree !== 'boolean') {
    return { agree: false, reason: 'judge returned no parseable verdict' };
  }
  return { agree: parsed.agree, reason: (parsed.reason ?? '').trim() };
}

/**
 * Validate a card's answer key independently. Blind-derives an answer from the
 * snippet, then judges agreement with the author's key. LLM optional: no usable
 * endpoint => 'skipped' (never throws). Disagreement => 'disagree' (caller
 * downgrades the card to needs_review or regenerates).
 */
export async function validateAnswerKey(
  input: { prompt: string; snippet: string; path: string; authorAnswer: string },
  deps: { llm?: AuthorLlm; endpoint: EndpointConfig },
): Promise<AnswerKeyResult> {
  if (!deps.llm || !deps.endpoint.usable) {
    return { verdict: 'skipped', reason: deps.endpoint.reason ?? 'no usable LLM endpoint' };
  }
  // The oracle LLM is optional and must NEVER crash the caller: a dead endpoint
  // (e.g. no local server running) throws on fetch. Treat any failure as an
  // honest 'skipped' - the card is well-formed and grounded, truth just wasn't
  // independently checked. Same contract as authorCard.
  try {
    const derivedAnswer = await deriveAnswer(deps.llm, { prompt: input.prompt, snippet: input.snippet, path: input.path });
    if (!derivedAnswer) {
      return { verdict: 'skipped', reason: 'independent derivation was empty' };
    }
    const judged = await judgeAgreement(deps.llm, {
      prompt: input.prompt, snippet: input.snippet, authorAnswer: input.authorAnswer, derivedAnswer,
    });
    return { verdict: judged.agree ? 'agree' : 'disagree', derivedAnswer, reason: judged.reason };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { verdict: 'skipped', reason: `oracle endpoint unreachable: ${msg}` };
  }
}
