/**
 * v2 library model (2026-07 redesign, docs/design/redesign-2026-07/01-OBJECT-MODEL.md).
 *
 * Additive: this file introduces the target shapes alongside the legacy
 * `src/core/types.ts`. Nothing here imports the legacy TutorState. The cutover
 * (Phase B) rewires call sites; Phase A just builds and tests these.
 */

export type Difficulty = 'beginner' | 'intermediate' | 'advanced';
export type CardStatus = 'active' | 'needs_review' | 'blocked' | 'archived';

/** A set doubles as a lesson: one objective, one kind, ordered activities.
 * See docs/design/redesign-2026-07/08-FIRST-LEARNING-LOOP.md. */
export type LessonKind = 'general' | 'repository' | 'bridge';

/** Abstraction level a card teaches at (orthogonal to Difficulty). */
export type Altitude = 'line' | 'function' | 'module' | 'service' | 'system';

/** Optional lesson metadata shared by CardSet and the import patch's set. */
export type LessonMeta = {
  objective?: string;
  lessonKind?: LessonKind;
  prerequisiteTagIds?: string[];
  estimatedMinutes?: number;
  defaultAltitude?: Altitude;
};

/** The user-facing organizing unit. A folder on disk; also a lesson. */
export type CardSet = LessonMeta & {
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

/** One selectable option in a `choice` interaction. Feedback is authored per
 * option so the reveal is deterministic and needs no live model. */
export type ChoiceOption = { id: string; text: string; feedback: string };

/** How the learner engages a card before the answer is revealed. Absent means
 * the legacy `flashcard` behaviour (reveal + self-grade). A `choice` with one
 * correct id renders single-select; more than one renders multi-select. */
export type Interaction =
  | { type: 'flashcard' }
  | { type: 'self_response'; placeholder?: string }
  | { type: 'choice'; options: ChoiceOption[]; correctOptionIds: string[] };

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
  altitude?: Altitude;
  /** How the card is presented before reveal. Absent = legacy flashcard. */
  interaction?: Interaction;
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

/** Self-rated confidence BEFORE reveal (1 Guessing … 5 Certain). */
export type Confidence = 1 | 2 | 3 | 4 | 5;

/** What the learner actually did before reveal. All fields optional so a
 * legacy flashcard grade (no attempt) is unchanged. Deterministic correctness
 * is recorded only for `choice`; self_response stays self-graded. */
export type ReviewAttempt = {
  interaction: Interaction['type'];
  responseText?: string;
  selectedOptionIds?: string[];
  correct?: boolean;
  revealedFull?: boolean;
  elapsedMs?: number;
};

export type ReviewEvent = {
  cardId: string;
  rating: ReviewRating;
  /** Pre-reveal confidence, recorded for calibration; does not affect FSRS. */
  confidenceBeforeReveal?: Confidence;
  /** The learner's pre-reveal action; evidence, not a scheduling input. */
  attempt?: ReviewAttempt;
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
  // 'lesson' walks a set's authored order (Learn); the others are due Review.
  mode: 'recommended' | 'set' | 'folder' | 'tag_filter' | 'lesson';
  filter?: {
    setIds?: string[];
    folderPaths?: string[];
    tagIds?: string[];
    // How to combine populated dimensions (folders vs tags vs sets). Within a
    // single dimension, values are always OR'd. Default 'union' = a card
    // matches if it satisfies ANY dimension; 'intersection' = must satisfy all.
    combinator?: 'union' | 'intersection';
  };
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
  // Lesson context so the authoring agent can reuse/extend lessons instead of
  // duplicating general knowledge per repo.
  objective?: string;
  lessonKind?: LessonKind;
  tagIds?: string[];
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
  difficulty?: Difficulty;
  altitude?: Altitude;
  /** Presentation before reveal. Absent = legacy flashcard. Validated by
   * validateSetPatchStructure (HARD rejects on unsatisfiable choice shapes). */
  interaction?: Interaction;
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
  set: LessonMeta & {
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
