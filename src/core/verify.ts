/**
 * Card verification guardrails (S6a, doc 02 + doc 05).
 *
 * These are the CHEAP, deterministic guardrails: they prove a card is well-formed
 * and grounded (provenance), and flag commit drift. They do NOT prove the answer
 * is TRUE - that is the independent answer-key validator (S6b) and code-as-oracle
 * grading (S6c). Keeping this layer pure and LLM-free is deliberate (doc 05:
 * "verification proves groundedness, not truth").
 */

import { readRange } from './tools.js';
import type { AuthoredCard } from './author.js';

export interface VerifyIssue {
  code: 'empty_prompt' | 'empty_answer' | 'no_focus' | 'not_a_question' | 'trivia' | 'empty_snippet';
  message: string;
}

export interface VerifyResult {
  ok: boolean;
  issues: VerifyIssue[];
}

/**
 * Pure format + anti-trivia checks on an authored card. No I/O.
 * Anti-trivia: reject prompts that leak their own answer or are pure "what is X"
 * recall with the answer verbatim in the prompt.
 */
export function verifyFormat(card: AuthoredCard): VerifyResult {
  const issues: VerifyIssue[] = [];
  const prompt = card.prompt.trim();
  const answer = card.expectedAnswer.trim();
  if (!prompt) issues.push({ code: 'empty_prompt', message: 'prompt is empty' });
  if (!answer) issues.push({ code: 'empty_answer', message: 'expectedAnswer is empty' });
  if (!card.expectedFocus.length) issues.push({ code: 'no_focus', message: 'expectedFocus is empty' });
  if (!card.snippet.text.trim()) issues.push({ code: 'empty_snippet', message: 'frozen snippet is empty' });
  if (prompt && !/[?]/.test(prompt)) {
    issues.push({ code: 'not_a_question', message: 'prompt is not phrased as a question' });
  }
  if (prompt && answer && leaksAnswer(prompt, answer)) {
    issues.push({ code: 'trivia', message: 'prompt leaks its own answer (trivia)' });
  }
  return { ok: issues.length === 0, issues };
}

/** Heuristic: the prompt contains the full answer text verbatim (answer leak). */
function leaksAnswer(prompt: string, answer: string): boolean {
  const a = answer.toLowerCase();
  if (a.length < 12) return false;
  return prompt.toLowerCase().includes(a);
}

export type DriftStatus = 'fresh' | 'drifted' | 'missing';

export interface DriftResult {
  status: DriftStatus;
  /** The commit the snippet was frozen against. */
  authoredCommit: string;
  /** Present when drifted: what the pinned range resolves to now. */
  currentText?: string;
}

/**
 * Commit-drift check (doc 05 fix B). Re-resolves the card's pinned line range
 * at the CURRENT working tree and compares to the frozen text. A repo under
 * active development shifts lines; this catches "card points at moved code"
 * as a flaggable status, never a silent stale render.
 *
 * - fresh:   the pinned range still yields the frozen text (byte-for-byte).
 * - drifted: the range now yields different text (code moved/changed).
 * - missing: the file/range no longer resolves (deleted or truncated).
 */
export async function checkSnippetDrift(repoPath: string, card: AuthoredCard): Promise<DriftResult> {
  const { path, startLine, endLine, text, commit } = card.snippet;
  try {
    const current = await readRange(repoPath, path, startLine, endLine);
    if (!current.text.trim()) return { status: 'missing', authoredCommit: commit };
    if (current.text === text) return { status: 'fresh', authoredCommit: commit };
    return { status: 'drifted', authoredCommit: commit, currentText: current.text };
  } catch {
    return { status: 'missing', authoredCommit: commit };
  }
}
