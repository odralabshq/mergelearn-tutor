---
title: "MergeLearn Tutor — Object Model (2026-07 Redesign)"
description: "Target object model: CardSet as the user-facing atom, self-contained Card backs, a single agent-maintained tag taxonomy that IS the learning graph, per-session review history, folder-per-set + card-per-file storage. QuestionPlane, the concept graph, and the answer-key oracle are removed."
resource: docs/design/redesign-2026-07/01-OBJECT-MODEL.md
tags: [architecture, object-model, types, redesign]
updated: 2026-07-07
status: design
---

# Object Model

Grounded against the current model in `src/core/types.ts` (TutorState v1).
This doc defines the target shapes and the exact migration mapping.

The guiding cut: **the tutor stores and validates learning structure; it
never infers it.** Concepts, tags, ordering, and question type all come from
the agent. There is one taxonomy (tags), not a tag system plus a concept
graph.

---

## 1. The shape in one picture

```
GlobalLibrary (~/.mergelearn/)
  CardSet[]            user-facing organizing atom (a folder on disk)
    Card[]             belongs to exactly ONE set; one JSON file each
      CardFront        prompt + optional context
      CardBack         short answer + full educational explanation (self-contained)
      SourceRef[]      OPTIONAL SHA-pinned provenance (frozen from disk)
      FsrsState        scheduling state, embedded on the card
    order              agent-authored card sequence (order.json)
  CardTag[]            THE taxonomy: hierarchy + relations live here (agent-maintained)
  Folder paths         set/card organization (plain path strings)
  ReviewSession[]      per-session review history files
  RepoRef[]            OPTIONAL stable repoId -> current path registry
  UserProfile          preferences + derived learning summary
```

The atom the user sees is **CardSet**. Tags carry the hierarchy that used to
live in a separate concept graph. Nothing in the model requires a repo.

---

## 2. Core types (target)

```ts
// The user-facing organizing unit. A folder on disk. Replaces LearningCourse.
export type CardSet = {
  id: string;                 // slug, also the folder name (e.g. "typescript-basics")
  title: string;
  description?: string;
  folderPath?: string;        // e.g. "typescript/basics" — plain path string
  repoId?: string;            // OPTIONAL: set is not required to be repo-bound
  tagIds: string[];           // set-level tags
  createdVia: 'agent_import' | 'manual' | 'migration';
  createdAt: string;
  updatedAt: string;
};

// The schedulable flashcard. One JSON file. Replaces LearningItem.
export type Card = {
  id: string;                 // stable id, also the card filename
  setId: string;              // belongs to EXACTLY ONE set
  folderPath?: string;        // optional override within the set
  tagIds: string[];           // many-to-many cross-cutting tags (incl. card type)
  front: CardFront;
  back: CardBack;             // self-contained: short answer + full explanation
  sourceRefs?: SourceRef[];   // OPTIONAL provenance (frozen from disk when present)
  difficulty?: Difficulty;    // optional hint; agent-supplied
  status: CardStatus;         // active | needs_review | blocked | archived
  fsrs: FsrsState;            // embedded scheduling state
  createdBy: {
    agentName?: string;
    agentModel?: string;
    importedAt: string;
  };
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
};

export type CardStatus = 'active' | 'needs_review' | 'blocked' | 'archived';
```

---

## 3. CardFront / CardBack — cards teach on their own

This is the change that lets you learn a topic (TypeScript unions, error
handling, a repo's auth flow) purely by reading and answering the card, with
no need to open the source. The back has two layers: a direct answer, then a
full educational explanation.

```ts
export type CardFront = {
  prompt: string;             // the question
  contextMarkdown?: string;   // optional setup shown with the question
};

export type CardBack = {
  shortAnswer: string;        // layer 1: the direct answer to the prompt
  explanationMarkdown: string;// layer 2: full, self-contained teaching explanation
  examples?: CardExample[];   // optional worked examples / counterexamples
  commonMistakes?: string[];  // optional pitfalls (valuable for programming topics)
  sourceNotes?: string[];     // optional pointers back to code/docs
};

export type CardExample = {
  label?: string;
  language?: string;          // for syntax highlighting
  code?: string;              // illustrative (NOT provenance — see SourceRef)
  note?: string;
};
```

**Two distinct notions of code.** `CardExample.code` is illustrative material
the agent wrote to teach (never frozen, never trust-checked). `SourceRef`
(sec 6) is provenance: a citation into a real repo that the tutor freezes from
disk. A conceptual card may have examples and no source refs at all.

**Validation (deterministic, model-free):** `prompt`, `shortAnswer`, and
`explanationMarkdown` must be non-empty; `prompt` must not contain
`shortAnswer` verbatim (anti-trivia). That is the whole content gate — there
is no answer-key oracle.

---

## 4. CardTag — the taxonomy IS the learning graph

There is no separate concept graph. A tag carries hierarchy and relations, so
the tag set *is* the DAG. This deletes an entire subsystem (`concepts.ts`,
`graph.ts` as a concept builder, `ConceptNode`) and means the agent extends
exactly one structure.

```ts
export type CardTag = {
  id: string;                 // stable slug
  label: string;              // "unions", "error-handling", "auth-flow"
  kind?: string;              // free-form but validated against known kinds
  description?: string;       // what this tag means (helps the agent reuse it)
  aliases?: string[];         // dedup synonyms ("errors" -> "error-handling")
  parentIds?: string[];       // hierarchy (was Concept.parentIds)
  relatedIds?: string[];      // cross-links (was Concept.relatedIds)
  createdBy: 'agent' | 'user' | 'migration';
};
```

**Kinds are guidance, not a hard enum.** Common kinds: `topic`, `skill`,
`card_type`, `difficulty`, `repo`, `status`. Card *type* is just a tag
(`card_type/code-reading`, `card_type/conceptual`, `card_type/debugging`) —
this is what replaces the deleted `QuestionPlane`. The tutor validates that a
tag's `kind` is either a known kind or explicitly proposed; it does not
prescribe the vocabulary.

**Why one structure.** If tags already carry `parentIds`/`relatedIds`, a
second `ConceptNode` graph is pure duplication — two things to keep in sync,
two things the agent must reason about. Collapsing them is the single largest
simplification in this redesign and is a deliberate step beyond the research,
which kept them separate.

The taxonomy powers the same background jobs the concept graph used to:
search facets (filter by a tag ancestor), related-cards (siblings/children
during review), weak-area rollups (aggregate low-FSRS cards up to a parent
tag), and agent context (hand the existing taxonomy to the agent so it extends
rather than duplicates — see doc 03). None of these render as a graph UI.

---

## 5. FsrsState — scheduling, embedded on the card

```ts
export type FsrsState = {
  due: string;                // ISO-8601 next-due
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  state: 0 | 1 | 2 | 3;       // New | Learning | Review | Relearning
  lastReviewAt?: string;
};
```

"Due today" = every active card across all sets with `due <= now`, optionally
filtered by set / folder / tag. Sets are containers, never schedulers.

---

## 6. SourceRef — optional provenance (the trust boundary)

Present only when a card cites real repo code. Absent on purely conceptual
cards. When present, the tutor freezes the cited lines from disk (doc 03).

```ts
export type SourceRef = {
  repoId: string;             // stable id from the repo registry (doc 02)
  repoLabel?: string;         // human-friendly, for prompts/UI
  path: string;               // file path relative to repo root
  startLine?: number;
  endLine?: number;
  commit: string;             // SHA the snippet was frozen at
  frozenText?: string;        // the disk-read lines (author text discarded)
  status?: 'fresh' | 'drifted' | 'missing' | 'orphaned_commit';
};
```

`status` is derived by re-resolving the range at current HEAD (the existing
`checkSnippetDrift` logic). A card whose repo moved or was deleted stays
reviewable on its frozen text; only live re-resolution degrades.

---

## 7. ReviewSession — per-session history

Review history is NOT one global event log and NOT inlined in card files.
It is grouped into **session files** — one per review sitting — matching how
the user actually experiences review (sit down, review N cards, stop).

```ts
export type ReviewSession = {
  id: string;
  startedAt: string;
  endedAt?: string;
  mode: 'recommended' | 'set' | 'folder' | 'tag_filter';
  filter?: { setIds?: string[]; folderPaths?: string[]; tagIds?: string[] };
  events: ReviewEvent[];
  summary: {
    reviewedCount: number;
    again: number; hard: number; good: number; easy: number;
  };
};

export type ReviewEvent = {
  cardId: string;
  rating: 1 | 2 | 3 | 4;      // Again | Hard | Good | Easy
  stateBefore: 0 | 1 | 2 | 3;
  stabilityBefore: number;
  difficultyBefore: number;
  elapsedDays: number;
  scheduledDays: number;
  reviewedAt: string;
};
```

**Why sessions, not a global JSONL.** A session file is human-readable ("what
did I study Tuesday night"), bounds file size naturally, isolates corruption
risk to one sitting, and still preserves every event an FSRS optimizer needs
(the optimizer just reads all session files). `profile/stats.json` is a
derived cache, always rebuildable from the session files + cards — never a
source of truth.

---

## 8. Exact old -> new mapping

| Current (`types.ts` v1) | Target | Migration action |
|---|---|---|
| `LearningCourse` | `CardSet` | title/goal -> set; its items regrouped into the set |
| `LearningItem` | `Card` | fields split into `front`/`back`; add `setId`, `tagIds`, `fsrs`, `createdBy` |
| `LearningItem.conceptId` (PK) | dropped as PK | concept becomes a tag; set is the container |
| `LearningItem.prompt` | `Card.front.prompt` | direct |
| `explanationMarkdown`/`expected*` | `Card.back` | fold into `shortAnswer` + `explanationMarkdown` |
| `LearningItem.questionPlane` | dropped | card type is now a `card_type/*` tag |
| `ConceptState` (FSRS half) | `Card.fsrs` | merge stability/difficulty/due onto the card |
| `ConceptState` (mastery half) | derived rollup | recomputed from sessions, not stored |
| `Concept` | `CardTag` | hierarchy/relations absorbed into the tag |
| `LearningEvent` | `ReviewSession.events` | grouped into per-session files |
| `questionBank`, `questionDraftBatches` | deleted | deterministic pipeline retired |
| `studyAssignments` | deleted | A/B harness retired |
| `manualRatings`, `delayedProbes` | deleted | superseded by FSRS + status |
| `corrections` | folded into `Card.status` | "bad card" -> `blocked`; "needs work" -> `needs_review` |
| `cardBatches` | `ImportRecord` | one record per `AgentSetPatch` import (doc 03) |
| `artifacts` (`CommitArtifact`) | deleted | tutor no longer ingests commits; the agent reads the repo |

`Difficulty` and `CodeSnippet` are reused. `QuestionPlane`, `ConceptKind`,
`EvidenceRef`, and the `Concept`/`ConceptState` types are retired.

---

## 9. Why these choices

- **Set as atom** matches how Quizlet/Anki users think (goals, not concept
  IDs) and how the research unanimously landed.
- **Card in exactly one set** avoids many-to-many sync cascades on local
  files; cross-cutting lives in tags and folders.
- **Self-contained backs** let the user learn a topic by reading the card,
  which is the whole point of a tutor — source refs enrich, they don't gate.
- **One taxonomy** (tags = graph) removes a whole subsystem and gives the
  agent a single structure to extend.
- **Session files** keep history human-readable and corruption-isolated while
  preserving optimizer data.
- **Optional source refs** let conceptual sets (TypeScript, algorithms) be
  first-class, not second-class to repo sets.
