/**
 * Agent-authored card import (S11).
 *
 * The v2 pipeline had the LLM author cards in-process against a local endpoint.
 * The eval showed the machinery (freeze/verify/oracle/staging) is sound but a
 * small local author caps quality (answer_correct failed ~44%). This module lets
 * an EXTERNAL coding agent be the author instead: the agent picks teachable code
 * ranges and writes drafts, and the tutor still owns provenance and gating.
 *
 * The trust boundary is unchanged and non-negotiable:
 *   - The agent's snippet TEXT is never trusted. We re-fetch the cited range from
 *     disk (readRange) and freeze THAT, pinned to the current HEAD commit.
 *   - Every card passes verifyFormat (deterministic) before it can be scheduled.
 *   - answer-key validation (validateAnswerKey) runs when an oracle endpoint is
 *     configured; with none it is honestly 'skipped', never faked.
 *   - decideStaging is the gate: only 'active' cards attach; 'needs_review' are
 *     reported but NOT scheduled.
 *
 * Option 2 (agent picks ranges freely): each imported card gets a synthetic
 * concept + concept-state so the scheduler/mastery model works unchanged.
 */

import { readRange } from './tools.js';
import { verifyFormat, type VerifyResult } from './verify.js';
import { validateAnswerKey, type AnswerKeyResult } from './answerKey.js';
import { decideStaging, type StagingDecision } from './staging.js';
import { scoreSnippetTeachability } from './teachability.js';
import type { AuthoredCard, AuthorLlm } from './author.js';
import type { EndpointConfig } from './endpoint.js';
import type {
  Concept, ConceptState, LearningItem, LearningItemType, QuestionPlane, ConceptKind, CodeSnippet, TutorState,
} from './types.js';
import { stableId, nowIso } from './util.js';

/**
 * Adapt a resolved endpoint into the oracle's AuthorLlm shape (fetch, OpenAI-
 * compatible). Only meaningful when the endpoint is usable; callers pass this as
 * the oracle only then, so a missing/unreachable endpoint stays an honest skip.
 */
export function createEndpointLlm(endpoint: EndpointConfig): AuthorLlm {
  return {
    async complete(messages) {
      const res = await fetch(`${endpoint.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(endpoint.apiKey ? { authorization: `Bearer ${endpoint.apiKey}` } : {}),
        },
        body: JSON.stringify({ model: endpoint.model, temperature: 0.2, stream: false, messages }),
      });
      if (!res.ok) throw new Error(`oracle request failed (${res.status})`);
      const payload = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return payload.choices?.[0]?.message?.content ?? '';
    },
  };
}

/** One draft as produced by the external agent. Snippet text is intentionally absent. */
export interface AgentCardDraft {
  conceptLabel: string;
  plane: QuestionPlane;
  path: string;
  startLine: number;
  endLine: number;
  prompt: string;
  expectedAnswer: string;
  expectedFocus: string[];
  explanationMarkdown?: string;
  planeConfidence?: number;
}

/** Per-card outcome of an import run (for honest reporting). */
export interface ImportCardResult {
  conceptLabel: string;
  path: string;
  status: StagingDecision['status'];
  reasons: string[];
  answerKey: AnswerKeyResult['verdict'];
  attached: boolean;
}

const PLANE_KIND: Record<QuestionPlane, ConceptKind> = {
  language_mechanics: 'language',
  local_behavior: 'repo_architecture',
  file_role: 'repo_architecture',
  architecture_flow: 'repo_architecture',
  risk_and_tests: 'testing',
  repo_domain: 'repo_domain',
};

const PLANE_TYPE: Record<QuestionPlane, LearningItemType> = {
  language_mechanics: 'concept_card',
  local_behavior: 'concept_card',
  file_role: 'concept_card',
  architecture_flow: 'trace_flow',
  risk_and_tests: 'spot_risk',
  repo_domain: 'concept_card',
};

function languageForPath(path: string): string | undefined {
  if (/\.tsx?$/.test(path)) return 'typescript';
  if (/\.jsx?$/.test(path)) return 'javascript';
  if (/\.py$/.test(path)) return 'python';
  if (/\.json$/.test(path)) return 'json';
  if (/\.ya?ml$/.test(path)) return 'yaml';
  if (/\.md$/.test(path)) return 'markdown';
  return undefined;
}

/**
 * Freeze one draft into an AuthoredCard by re-fetching the cited range from disk.
 * The agent's own snippet text (if any) is discarded; disk is the oracle.
 */
export async function freezeDraft(
  repoPath: string,
  draft: AgentCardDraft,
  commitSha: string,
): Promise<AuthoredCard> {
  const resolved = await readRange(repoPath, draft.path, draft.startLine, draft.endLine);
  return {
    conceptId: conceptIdFor(draft),
    plane: draft.plane,
    prompt: draft.prompt.trim(),
    expectedAnswer: draft.expectedAnswer.trim(),
    expectedFocus: (draft.expectedFocus ?? []).filter((f) => typeof f === 'string').slice(0, 8),
    explanationMarkdown: (draft.explanationMarkdown ?? '').trim(),
    planeConfidence: typeof draft.planeConfidence === 'number' ? draft.planeConfidence : 0.5,
    snippet: {
      path: resolved.path,
      startLine: resolved.startLine,
      endLine: resolved.endLine,
      text: resolved.text,
      commit: commitSha,
    },
  };
}

/** Stable concept id from the cited range, so re-import is idempotent. */
export function conceptIdFor(draft: AgentCardDraft): string {
  return stableId('concept', ['agent', draft.path, draft.startLine, draft.endLine, draft.conceptLabel]);
}

function difficultyFor(card: AuthoredCard): 'beginner' | 'intermediate' | 'advanced' {
  if (card.planeConfidence >= 0.75) return 'advanced';
  if (card.planeConfidence <= 0.35) return 'beginner';
  return 'intermediate';
}

/** Synthetic concept for a freely-picked range so the scheduler has a node. */
export function conceptForCard(draft: AgentCardDraft, card: AuthoredCard): Concept {
  return {
    id: card.conceptId,
    label: draft.conceptLabel,
    kind: PLANE_KIND[card.plane],
    description: `Agent-authored: ${draft.path}:${card.snippet.startLine}-${card.snippet.endLine}`,
    difficulty: difficultyFor(card),
    parentIds: [],
    prerequisiteIds: [],
    relatedIds: [],
    evidence: [{ commit: card.snippet.commit, path: card.snippet.path, label: draft.conceptLabel, snippet: card.snippet.text }],
  };
}

/** Fresh, unlearned concept-state. Mid-high importance so imported cards surface. */
export function conceptStateForCard(conceptId: string): ConceptState {
  return {
    conceptId,
    exposureCount: 0,
    activeRecallCount: 0,
    correctCount: 0,
    failedCount: 0,
    hintCount: 0,
    masteryEstimate: 0,
    confidence: 0,
    importance: 0.6,
    repoRelevance: 0.6,
  };
}

/** Adapt a frozen AuthoredCard into a schedulable LearningItem. */
export function authoredCardToLearningItem(
  card: AuthoredCard,
  label: string,
  batchId: string,
  generation: number,
  now: string,
): LearningItem {
  const snippet: CodeSnippet = {
    path: card.snippet.path,
    label,
    language: languageForPath(card.snippet.path),
    commit: card.snippet.commit,
    code: card.snippet.text,
  };
  return {
    id: stableId('item', [batchId, card.conceptId, card.snippet.commit, card.plane]),
    conceptId: card.conceptId,
    type: PLANE_TYPE[card.plane],
    questionPlane: card.plane,
    title: `${card.snippet.path}: ${label}`,
    snippet,
    bodyMarkdown: card.explanationMarkdown || card.expectedAnswer,
    prompt: card.prompt,
    explanationMarkdown: card.explanationMarkdown || card.expectedAnswer,
    expectedFocus: card.expectedFocus,
    whyShown: `Agent-authored card for ${label}`,
    evidence: [{ commit: card.snippet.commit, path: card.snippet.path, label }],
    difficulty: difficultyFor(card),
    createdAt: now,
    status: 'active',
    batchId,
    generation,
    source: 'agent_import',
  };
}

/**
 * Run a full import: freeze each draft from disk, verify, independently validate
 * the answer key (when an oracle endpoint is configured), and attach only cards
 * that clear staging. Returns the next state plus a per-card report. Pure w.r.t.
 * `state` (returns a new object); all I/O is disk reads + the optional oracle.
 */
export async function importAgentCards(
  repoPath: string,
  state: TutorState,
  drafts: AgentCardDraft[],
  commitSha: string,
  deps: { llm?: AuthorLlm; endpoint: EndpointConfig },
): Promise<{ state: TutorState; results: ImportCardResult[]; batchId: string }> {
  const now = nowIso();
  const batchId = stableId('batch', [now, 'agent_import', String((state.cardBatches ?? []).length + 1)]);
  const generation = (state.cardBatches ?? []).length + 1;

  const results: ImportCardResult[] = [];
  const newConcepts: Concept[] = [];
  const newConceptStates: ConceptState[] = [];
  const newItems: LearningItem[] = [];

  for (const draft of drafts) {
    const card = await freezeDraft(repoPath, draft, commitSha);
    const verify: VerifyResult = verifyFormat(card);
    const answerKey: AnswerKeyResult = await validateAnswerKey(
      { prompt: card.prompt, snippet: card.snippet.text, path: card.snippet.path, authorAnswer: card.expectedAnswer },
      deps,
    );
    const decision: StagingDecision = decideStaging(verify, answerKey.verdict);

    // Extra deterministic gate (eval blind-spot): a cited range that is mostly
    // comments/imports/braces yields a weak card and, with no oracle, ships
    // silently. A low-signal range can never be 'active'; route it to review.
    const teach = scoreSnippetTeachability(card.snippet.text);
    const status: StagingDecision['status'] =
      !teach.teachable && decision.status === 'active' ? 'needs_review' : decision.status;
    const reasons = teach.teachable ? decision.reasons : [...decision.reasons, 'teachability:low_signal'];
    const attached = status === 'active';

    if (attached) {
      const conceptId = card.conceptId;
      if (!state.concepts.some((c) => c.id === conceptId) && !newConcepts.some((c) => c.id === conceptId)) {
        newConcepts.push(conceptForCard(draft, card));
        newConceptStates.push(conceptStateForCard(conceptId));
      }
      newItems.push(authoredCardToLearningItem(card, draft.conceptLabel, batchId, generation, now));
    }

    results.push({
      conceptLabel: draft.conceptLabel,
      path: draft.path,
      status,
      reasons,
      answerKey: answerKey.verdict,
      attached,
    });
  }

  const nextState: TutorState = {
    ...state,
    concepts: [...state.concepts, ...newConcepts],
    conceptStates: [...state.conceptStates, ...newConceptStates],
    learningItems: [...state.learningItems, ...newItems],
    cardBatches: [
      ...(state.cardBatches ?? []),
      { id: batchId, mode: 'more', requestedCount: drafts.length, itemIds: newItems.map((i) => i.id), archivedItemIds: [], createdAt: now, reason: 'agent_import' },
    ],
  };

  return { state: nextState, results, batchId };
}
