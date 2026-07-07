/**
 * v2 library model (2026-07 redesign, docs/design/redesign-2026-07/01-OBJECT-MODEL.md).
 *
 * Additive: this file introduces the target shapes alongside the legacy
 * `src/core/types.ts`. Nothing here imports the legacy TutorState. The cutover
 * (Phase B) rewires call sites; Phase A just builds and tests these.
 */

export type Difficulty = 'beginner' | 'intermediate' | 'advanced';
export type CardStatus = 'active' | 'needs_review' | 'blocked' | 'archived';

/** The user-facing organizing unit. A folder on disk. */
export type CardSet = {
  id: string; // slug, also the folder name
  title: string;
  description?: string;
  folderPath?: string; // e.g. "typescript/basics"
  repoId?: string; // OPTIONAL: a set need not be repo-bound
  tagIds: string[];
  createdVia: 'agent_import' | 'manual' | 'migration';
  createdAt: string;
  updatedAt: string;
};

export type CardFront = {
  prompt: string;
  contextMarkdown?: string;
};

export type CardExample = {
  label?: string;
  language?: string;
  code?: string; // illustrative, agent-authored (NOT provenance)
  note?: string;
};

/** Self-contained back: direct answer, then full teaching explanation. */
export type CardBack = {
  shortAnswer: string;
  explanationMarkdown: string;
  examples?: CardExample[];
  commonMistakes?: string[];
  sourceNotes?: string[];
};

export type SourceRefStatus = 'fresh' | 'drifted' | 'missing' | 'orphaned_commit';

/** OPTIONAL provenance. Present only when a card cites real repo code. */
export type SourceRef = {
  repoId: string;
  repoLabel?: string;
  path: string; // repo-relative
  startLine?: number;
  endLine?: number;
  commit: string; // SHA the snippet was frozen at
  frozenText?: string; // disk-read lines; author text discarded
  status?: SourceRefStatus;
};

/** FSRS scheduling state, embedded on the card (mirrors ts-fsrs). */
export type FsrsState = {
  due: string;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  learningSteps: number;
  state: 0 | 1 | 2 | 3; // New | Learning | Review | Relearning
  lastReviewAt?: string;
};

/** The schedulable flashcard. One JSON file. */
export type Card = {
  id: string;
  setId: string;
  folderPath?: string;
  tagIds: string[];
  front: CardFront;
  back: CardBack;
  sourceRefs?: SourceRef[];
  difficulty?: Difficulty;
  status: CardStatus;
  fsrs: FsrsState;
  createdBy: { agentName?: string; agentModel?: string; importedAt: string };
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
};

/**
 * The taxonomy IS the learning graph: a tag carries hierarchy (parentIds) and
 * relations (relatedIds). There is no separate concept graph.
 */
export type CardTag = {
  id: string;
  label: string;
  kind?: string; // guidance, not a hard enum (topic|skill|card_type|difficulty|repo|status)
  description?: string;
  aliases?: string[];
  parentIds?: string[];
  relatedIds?: string[];
  createdBy: 'agent' | 'user' | 'migration';
};

/** Agent-authored card sequence for a set (order.json). */
export type SetOrder = {
  version: 1;
  strategy: 'agent_authored' | 'git_chronological' | 'manual';
  cardIds: string[];
  note?: string;
};

/** Stable repo reference. OPTIONAL infra — conceptual sets have no repo. */
export type RepoRef = {
  id: string;
  normalizedPath: string;
  label: string;
  gitOriginUrl?: string;
  status: 'active' | 'missing' | 'deleted';
  createdAt: string;
  lastSeenAt: string;
};

/** One record per applied AgentSetPatch. Replaces CardBatch. */
export type ImportRecord = {
  id: string;
  setId: string;
  agentName?: string;
  agentModel?: string;
  cardIds: string[];
  tagIdsAdded: string[];
  createdAt: string;
};

export type ReviewRating = 1 | 2 | 3 | 4; // Again | Hard | Good | Easy

export type ReviewEvent = {
  cardId: string;
  rating: ReviewRating;
  stateBefore: 0 | 1 | 2 | 3;
  stabilityBefore: number;
  difficultyBefore: number;
  elapsedDays: number;
  scheduledDays: number;
  reviewedAt: string;
};

/** One review sitting. Persisted as a per-session file, not a global log. */
export type ReviewSession = {
  id: string;
  startedAt: string;
  endedAt?: string;
  mode: 'recommended' | 'set' | 'folder' | 'tag_filter';
  filter?: { setIds?: string[]; folderPaths?: string[]; tagIds?: string[] };
  events: ReviewEvent[];
  summary: {
    reviewedCount: number;
    again: number;
    hard: number;
    good: number;
    easy: number;
  };
};

// ---- Authoring handshake (docs/design/redesign-2026-07/03-CARD-PIPELINE.md) ----

export type SetSummary = {
  id: string;
  title: string;
  folderPath?: string;
  cardCount: number;
};

/** Step 1: tutor -> agent. Existing state the agent must reuse/extend. */
export type AuthoringContext = {
  goal: string;
  repo?: RepoRef;
  existingSets: SetSummary[];
  existingTags: CardTag[];
  folderTree: string[];
  targetSetId?: string;
};

/** A NEW tag proposed within a patch; referenced by cards via localId. */
export type ProposedTag = {
  localId: string;
  label: string;
  kind?: string;
  description?: string;
  aliases?: string[];
  parentIds?: string[]; // existing tag ids OR other localIds in this patch
  relatedIds?: string[];
};

/** Per-card payload. No provenance snippet text — the tutor freezes from disk. */
export type AgentCardDraft = {
  localId: string;
  id?: string;
  folderPath?: string;
  tagRefs: string[]; // existing tag ids OR ProposedTag localIds
  front: CardFront;
  back: CardBack;
  sourceRefs?: {
    repoId: string;
    path: string;
    startLine: number;
    endLine: number;
  }[];
};

/** Step 2: agent -> tutor. The full submission. Replaces AgentCardDraft[]. */
export type AgentSetPatch = {
  version: 1;
  set: {
    id?: string;
    title: string;
    description?: string;
    folderPath?: string;
    tagIds: string[];
  };
  tagPatch: { reuse: string[]; add: ProposedTag[] };
  order: string[]; // localIds/ids covering exactly this patch's cards
  orderNote?: string;
  cards: AgentCardDraft[];
};
