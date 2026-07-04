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
  /** Structural gates (0 or 1). These are PRECONDITIONS, not point earners. */
  format: number;
  freshness: number;
  /** The only discriminating quality signal: 0 (disagree) / 0.5 (no oracle) / 1. */
  answerKey: number;
  /** Card total, 0-1. A failed gate disqualifies the card at 0. */
  total: number;
  /** Set when a structural gate failed, naming which one. */
  disqualified?: string;
  notes: string[];
}

export interface CardEvalDeps {
  llm?: AuthorLlm;
  /**
   * Optional INDEPENDENT judge for answer-key validation. When omitted, the
   * author model judges itself (weak evidence) and the report flags selfJudged.
   * Pass a different model here for a genuinely independent oracle.
   */
  judgeLlm?: AuthorLlm;
  endpoint: EndpointConfig;
  commitSha: string;
}

/**
 * Score one target end-to-end through the real pipeline.
 *
 * Scoring model (deliberately NOT a weighted sum - that inflated the number by
 * paying for near-deterministic components):
 *  - authored, format, freshness are HARD GATES. Any failure disqualifies the
 *    card at total=0. They are preconditions for a usable card, not quality, and
 *    freshness in particular is ~always true by construction (we freeze from
 *    HEAD then check drift against HEAD), so it must not bank points.
 *  - The total is driven by the ONE discriminating signal: whether an answer key
 *    survives independent re-derivation. agree=1, skipped=0.5 (grounded but
 *    unproven), disagree=0. That is the real quality measurement.
 */
export async function scoreCard(repoPath: string, target: AuthorTarget, deps: CardEvalDeps): Promise<CardScore> {
  const notes: string[] = [];
  const outcome = await authorCard(repoPath, target, deps);
  if (!outcome.ok) {
    notes.push(`author_failed:${outcome.reason}`);
    return { conceptId: target.conceptId, authored: false, format: 0, freshness: 0, answerKey: 0, total: 0, disqualified: 'author', notes };
  }
  const card = outcome.card;
  const fmt = verifyFormat(card).ok ? 1 : 0;
  if (!fmt) notes.push('format_failed');
  const drift = await checkSnippetDrift(repoPath, card);
  const fresh = drift.status === 'fresh' ? 1 : 0;
  if (!fresh) notes.push(`drift:${drift.status}`);

  // Independent judge when provided; otherwise the author model self-judges.
  const ak = await validateAnswerKey(
    { prompt: card.prompt, snippet: card.snippet.text, path: card.snippet.path, authorAnswer: card.expectedAnswer },
    { ...deps, llm: deps.judgeLlm ?? deps.llm },
  );
  const akScore = ak.verdict === 'agree' ? 1 : ak.verdict === 'skipped' ? 0.5 : 0;
  if (ak.verdict !== 'agree') notes.push(`answer_key:${ak.verdict}`);

  // Hard gates: a failed precondition disqualifies the card regardless of AK.
  if (!fmt || !fresh) {
    const disqualified = !fmt ? 'format' : 'freshness';
    return { conceptId: target.conceptId, authored: true, format: fmt, freshness: fresh, answerKey: akScore, total: 0, disqualified, notes };
  }
  return { conceptId: target.conceptId, authored: true, format: fmt, freshness: fresh, answerKey: akScore, total: akScore, notes };
}

export interface EvalReport {
  /** Mean per-card total across all targets, 0-1. */
  score: number;
  threshold: number;
  passed: boolean;
  authoredRate: number;
  /**
   * True when no independent judgeLlm was supplied, so the author model judged
   * its own answer keys. A passing score under selfJudged=true is WEAK evidence
   * (correlated errors can self-agree); treat it as a smoke test, not proof.
   */
  selfJudged: boolean;
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
  const selfJudged = deps.judgeLlm === undefined;
  return { score, threshold, passed: n > 0 && score >= threshold, authoredRate, selfJudged, cards };
}
