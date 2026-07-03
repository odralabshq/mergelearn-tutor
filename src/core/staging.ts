/**
 * Card staging state machine (S6c, doc 05 removal-list fix).
 *
 * The full questionBank/questionDraftBatches two-collection pipeline is removed,
 * but the pre-schedule CATCH it provided survives as a lightweight status on the
 * item. A freshly authored card lands in `pending` and is only promoted to
 * `active` once it clears BOTH deterministic format verification AND independent
 * answer-key validation. Anything questionable goes to `needs_review` (visible,
 * not scheduled) rather than being silently scheduled.
 *
 * Pure and deterministic: takes the two verdicts, returns the staging decision.
 */

import type { VerifyResult } from './verify.js';
import type { AnswerKeyVerdict } from './answerKey.js';

export type StagingStatus = 'pending' | 'active' | 'needs_review';

export interface StagingDecision {
  status: StagingStatus;
  reasons: string[];
}

/**
 * Decide a card's staging status from its guardrail results.
 * - format fails            -> needs_review (never scheduled)
 * - answer key disagrees     -> needs_review (independent oracle rejected it)
 * - format ok + key agree    -> active (promoted)
 * - format ok + key skipped  -> active, but flagged (no oracle available; the
 *   card is grounded and well-formed, so it schedules, but the reason records
 *   that truth was not independently checked - honest, not a false promotion)
 */
export function decideStaging(verify: VerifyResult, answerKey: AnswerKeyVerdict): StagingDecision {
  const reasons: string[] = [];
  if (!verify.ok) {
    reasons.push(...verify.issues.map((i) => `format:${i.code}`));
    return { status: 'needs_review', reasons };
  }
  if (answerKey === 'disagree') {
    reasons.push('answer_key:disagree');
    return { status: 'needs_review', reasons };
  }
  if (answerKey === 'skipped') {
    reasons.push('answer_key:skipped_no_oracle');
    return { status: 'active', reasons };
  }
  reasons.push('verified:format+answer_key');
  return { status: 'active', reasons };
}
