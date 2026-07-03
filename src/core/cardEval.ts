/**
 * Card-quality eval scorer (S5, doc 05 addendum).
 *
 * Makes the tuning buffer FALSIFIABLE: instead of "eyeball the cards," run the
 * real author over a fixed set of held-out targets and score each card against
 * the guardrails that already exist (format/anti-trivia, snippet freshness,
 * independent answer-key agreement). Produces a single 0-1 score compared to an
 * acceptance threshold. Reusing the shipped guardrails is deliberate: the eval
 * measures the actual pipeline, not a parallel reimplementation.
 */

import { authorCard, type AuthorLlm, type AuthorTarget } from './author.js';
import { validateAnswerKey } from './answerKey.js';
import { verifyFormat, checkSnippetDrift } from './verify.js';
import type { EndpointConfig } from './endpoint.js';

export interface CardScore {
  conceptId: string;
  authored: boolean;
  /** Sub-signals, each 0 or 1. */
  format: number;
  freshness: number;
  answerKey: number;
  /** Weighted total for this card, 0-1. */
  total: number;
  notes: string[];
}

/** Weights sum to 1. Format + answer-key dominate; freshness is a smaller gate. */
const W = { format: 0.4, answerKey: 0.4, freshness: 0.2 };

export interface CardEvalDeps {
  llm?: AuthorLlm;
  endpoint: EndpointConfig;
  commitSha: string;
}

/**
 * Score one target end-to-end through the real pipeline.
 * A card that fails to author scores 0 (an empty deck is the worst outcome).
 * answerKey 'skipped' (no oracle) scores a neutral 0.5 - it is not proof of
 * truth, so it must not earn full marks, but the card is still grounded.
 */
export async function scoreCard(repoPath: string, target: AuthorTarget, deps: CardEvalDeps): Promise<CardScore> {
  const notes: string[] = [];
  const outcome = await authorCard(repoPath, target, deps);
  if (!outcome.ok) {
    notes.push(`author_failed:${outcome.reason}`);
    return { conceptId: target.conceptId, authored: false, format: 0, freshness: 0, answerKey: 0, total: 0, notes };
  }
  const card = outcome.card;
  const fmt = verifyFormat(card).ok ? 1 : 0;
  if (!fmt) notes.push('format_failed');
  const drift = await checkSnippetDrift(repoPath, card);
  const fresh = drift.status === 'fresh' ? 1 : 0;
  if (!fresh) notes.push(`drift:${drift.status}`);
  const ak = await validateAnswerKey(
    { prompt: card.prompt, snippet: card.snippet.text, path: card.snippet.path, authorAnswer: card.expectedAnswer },
    deps,
  );
  const akScore = ak.verdict === 'agree' ? 1 : ak.verdict === 'skipped' ? 0.5 : 0;
  if (ak.verdict !== 'agree') notes.push(`answer_key:${ak.verdict}`);
  const total = W.format * fmt + W.answerKey * akScore + W.freshness * fresh;
  return { conceptId: target.conceptId, authored: true, format: fmt, freshness: fresh, answerKey: akScore, total, notes };
}

export interface EvalReport {
  /** Mean per-card total across all targets, 0-1. */
  score: number;
  threshold: number;
  passed: boolean;
  authoredRate: number;
  cards: CardScore[];
}

export const DEFAULT_EVAL_THRESHOLD = 0.75;

/**
 * Run the eval over a set of held-out targets and produce the single acceptance
 * number. `passed` is the falsifiable buffer criterion (doc 05): tuning is
 * "done" when score >= threshold, not on vibes. An empty target set fails.
 */
export async function runEval(
  repoPath: string,
  targets: AuthorTarget[],
  deps: CardEvalDeps,
  threshold = DEFAULT_EVAL_THRESHOLD,
): Promise<EvalReport> {
  const cards: CardScore[] = [];
  for (const target of targets) {
    cards.push(await scoreCard(repoPath, target, deps));
  }
  const n = cards.length;
  const score = n === 0 ? 0 : cards.reduce((s, c) => s + c.total, 0) / n;
  const authoredRate = n === 0 ? 0 : cards.filter((c) => c.authored).length / n;
  return { score, threshold, passed: n > 0 && score >= threshold, authoredRate, cards };
}
