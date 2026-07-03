/**
 * LLM-sole-author card generation (S3 of the core redesign).
 *
 * The LLM is the sole author: it receives a grounded context bundle and returns
 * a CardDraft. The draft's snippet is NEVER trusted from the model - the cited
 * line range is re-fetched via readRange and the fetched text is frozen on the
 * card, pinned to the commit SHA it was authored against (doc 01 + doc 05).
 *
 * The LLM is injectable and never a hard dependency: with no usable endpoint,
 * authorCard returns a skipped result rather than throwing.
 */

import { readRange, grepRepo, gitContext } from './tools.js';
import { extractFirstJson, type EndpointConfig } from './endpoint.js';
import type { QuestionPlane } from './types.js';

/** Minimal completion interface so tests can inject a fake model. */
export interface AuthorLlm {
  complete(messages: Array<{ role: 'system' | 'user'; content: string }>): Promise<string>;
}

/** What the author writes a card about. */
export interface AuthorTarget {
  conceptId: string;
  conceptLabel: string;
  path: string;
  startLine: number;
  endLine: number;
  plane: QuestionPlane;
}

/** The strict JSON the model must return. */
export interface CardDraft {
  prompt: string;
  snippetPath: string;
  snippetStartLine: number;
  snippetEndLine: number;
  expectedAnswer: string;
  expectedFocus: string[];
  explanationMarkdown: string;
  planeConfidence: number;
}

/** The grounded context handed to the model. The tool surfaces; the LLM judges. */
export interface ContextBundle {
  target: AuthorTarget;
  /** Real, fetched snippet text for the target range (never model-authored). */
  primarySnippet: string;
  /** Nearest caller/callee hits for the concept label, for relational questions. */
  neighbors: Array<{ path: string; line: number; text: string }>;
  /** Most-recent commit subjects touching the file (teachable moments). */
  gitSubjects: string[];
}

/**
 * Assemble a bounded, grounded context bundle for one target.
 * All text comes from real tools; nothing is invented here.
 */
export async function buildContextBundle(repoPath: string, target: AuthorTarget): Promise<ContextBundle> {
  const primary = await readRange(repoPath, target.path, target.startLine, target.endLine);
  const hits = await grepRepo(repoPath, target.conceptLabel, { maxHits: 6 });
  const neighbors = hits
    .filter((h) => !(h.path.endsWith(target.path) && h.line >= target.startLine && h.line <= target.endLine))
    .slice(0, 3);
  let gitSubjects: string[] = [];
  try {
    const commits = await gitContext(repoPath, target.path, { limit: 3 });
    gitSubjects = commits.map((c) => c.title).filter(Boolean);
  } catch {
    gitSubjects = [];
  }
  return { target, primarySnippet: primary.text, neighbors, gitSubjects };
}

/** Outcome of one author attempt. `skipped` never throws - the LLM is optional. */
export type AuthorOutcome =
  | { ok: true; card: AuthoredCard }
  | { ok: false; reason: string; skipped: boolean };

/** A card after grounding: model prose + a frozen, SHA-pinned snippet. */
export interface AuthoredCard {
  conceptId: string;
  plane: QuestionPlane;
  prompt: string;
  expectedAnswer: string;
  expectedFocus: string[];
  explanationMarkdown: string;
  planeConfidence: number;
  /** Frozen at author time - fetched from disk, never from the model. */
  snippet: { path: string; startLine: number; endLine: number; text: string; commit: string };
}

/** Builds the author prompt. Minimal seam here; S4 enriches with exemplars. */
export function buildAuthorPrompt(bundle: ContextBundle): Array<{ role: 'system' | 'user'; content: string }> {
  const t = bundle.target;
  const neighbors = bundle.neighbors.map((n) => `${n.path}:${n.line}: ${n.text}`).join('\n') || '(none)';
  const gits = bundle.gitSubjects.join('; ') || '(none)';
  const system = 'You are a senior engineer writing a spaced-repetition card to teach a colleague this codebase. Return strict JSON only.';
  const user = [
    `Concept: ${t.conceptLabel}`,
    `Plane: ${t.plane}`,
    `File: ${t.path} (lines ${t.startLine}-${t.endLine})`,
    `Snippet:\n${bundle.primarySnippet}`,
    `Neighbors:\n${neighbors}`,
    `Recent commits touching this file: ${gits}`,
    'Write a card answerable ONLY from the material above. Prefer why / what-happens-if over what-is. Cite the file.',
    'JSON fields: prompt, snippetPath, snippetStartLine, snippetEndLine, expectedAnswer, expectedFocus (string[]), explanationMarkdown, planeConfidence (0-1).',
  ].join('\n\n');
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

function validDraft(d: unknown): d is CardDraft {
  const c = d as Partial<CardDraft>;
  return !!c && typeof c.prompt === 'string' && c.prompt.trim().length > 0
    && typeof c.snippetPath === 'string'
    && typeof c.snippetStartLine === 'number' && typeof c.snippetEndLine === 'number'
    && typeof c.expectedAnswer === 'string' && c.expectedAnswer.trim().length > 0
    && Array.isArray(c.expectedFocus);
}

/**
 * Author one card. The LLM is optional: with no usable endpoint, returns a
 * skipped outcome (never throws). The model's snippet is discarded; the cited
 * range is re-fetched from disk and frozen with the current commit SHA.
 */
export async function authorCard(
  repoPath: string,
  target: AuthorTarget,
  deps: { llm?: AuthorLlm; endpoint: EndpointConfig; commitSha: string; attempts?: number },
): Promise<AuthorOutcome> {
  if (!deps.llm || !deps.endpoint.usable) {
    return { ok: false, reason: deps.endpoint.reason ?? 'no usable LLM endpoint', skipped: true };
  }
  const bundle = await buildContextBundle(repoPath, target);
  const messages = buildAuthorPrompt(bundle);
  const maxAttempts = Math.max(1, deps.attempts ?? 2);
  let lastReason = 'author produced no valid JSON';
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const raw = await deps.llm.complete(messages);
    const draft = extractFirstJson<CardDraft>(raw);
    if (!draft || !validDraft(draft)) {
      lastReason = 'author produced no valid JSON';
      continue;
    }
    // Freeze the snippet from disk (never trust the model's snippet text).
    const resolved = await readRange(repoPath, draft.snippetPath, draft.snippetStartLine, draft.snippetEndLine);
    if (!resolved.text.trim()) {
      lastReason = `cited range is empty: ${draft.snippetPath}:${draft.snippetStartLine}-${draft.snippetEndLine}`;
      continue;
    }
    return {
      ok: true,
      card: {
        conceptId: target.conceptId,
        plane: target.plane,
        prompt: draft.prompt.trim(),
        expectedAnswer: draft.expectedAnswer.trim(),
        expectedFocus: draft.expectedFocus.filter((f) => typeof f === 'string').slice(0, 8),
        explanationMarkdown: (draft.explanationMarkdown ?? '').trim(),
        planeConfidence: typeof draft.planeConfidence === 'number' ? draft.planeConfidence : 0.5,
        snippet: {
          path: resolved.path,
          startLine: resolved.startLine,
          endLine: resolved.endLine,
          text: resolved.text,
          commit: deps.commitSha,
        },
      },
    };
  }
  return { ok: false, reason: lastReason, skipped: false };
}
