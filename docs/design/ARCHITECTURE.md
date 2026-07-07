---
title: "MergeLearn Tutor — Architecture"
description: "Authoritative architecture reference for the MergeLearn Tutor platform as built (main, f3ea7fc). Describes the state model, ingest pipeline, card creation paths, provenancing pipeline, daily learning loop, CLI surface, module map, evaluation findings, and key design decisions."
resource: docs/design/ARCHITECTURE.md
tags: [architecture, reference, as-built]
updated: 2026-07-04
---

# MergeLearn Tutor — Architecture

This document describes the platform as it EXISTS (main at f3ea7fc), not as
designed. Every claim is grounded in real source files under `src/core/`.
Cross-references use the form `src/core/<module>.ts`.

---

## 1. System overview

MergeLearn Tutor is a **local-first, repo-aware flashcard tutor**. It reads
a git repository's commit history (ingest), builds a concept graph from the
code that changed, and generates spaced-repetition cards that teach you the
repo. Cards are authored by a language model and gated by a deterministic
provenancing pipeline before they can be scheduled. Everything runs locally;
the single persistent artifact is `.skilltrace/state.json` in the repo root.

There are exactly two card-creation paths:
- **Generate** (`author.ts`): the LLM is the sole author. It gets a code
  range chosen by the planner, writes the card, and the pipeline freezes the
  real snippet from disk.
- **Import** (`importCards.ts`, S11): an external coding agent authors
  drafts. The tutor re-fetches the cited range from disk (the agent's snippet
  text is never trusted) and runs the same pipeline.

Both paths converge at the same provenancing chain, and both produce
schedulable `LearningItem`s tracked by the FSRS-based scheduler.

---

## 2. State model

A single JSON file at `.skilltrace/state.json` (`src/core/store.ts`).
Version 1, stored as a `TutorState` object (`src/core/types.ts:271`).

### Core collections

| Collection        | Type             | Purpose                                          |
|-------------------|------------------|--------------------------------------------------|
| `concepts`        | `Concept[]`      | Extracted code concepts (id, label, kind, difficulty, evidence) |
| `conceptStates`   | `ConceptState[]` | Per-concept mastery, confidence, FSRS fields      |
| `learningItems`   | `LearningItem[]` | Schedulable flashcards (the things `today` shows) |
| `cardBatches`     | `CardBatch[]`    | Bookkeeping: which cards were generated together  |
| `learningEvents`  | `LearningEvent[]`| Every review action (shown, answered, graded)     |
| `artifacts`       | `CommitArtifact[]` | Git commits surfaced by ingest (diffs, titles)  |
| `corrections`     | `Correction[]`   | User corrections (wrong concept, bad evidence)    |

### Legacy collections (surviving from pre-v2 era)

| Collection         | Note                                             |
|-------------------|--------------------------------------------------|
| `questionBank`    | Pre-v2 deterministic question drafts. Not used by the LLM author path. |
| `questionDraftBatches` | Batch metadata for the deterministic pipeline. Retained for compatibility. |
| `courses`          | Course grouping (goals + material paths).         |
| `manualRatings`    | 5-axis manual card-rating form.                  |
| `studyAssignments` | A/B crossover study scaffolding (research artifact). |
| `delayedProbes`    | Legacy scheduled probes, being replaced by FSRS. |

The v2 redesign (doc 00 in `design-core-2026-07-01/`) proposed removing several
legacy collections. The migration to version 2 (dropping `questionBank`,
`questionDraftBatches`, `studyAssignments`, `manualRatings`) is designed but
**not yet executed** — it is gated on card quality validation.

### Key types

```
Concept           (types.ts:68)   — id, label, kind, difficulty, evidence[], edges
ConceptState      (types.ts:91)   — masteryEstimate, confidence, nextReviewAt, FSRS stability
LearningItem      (types.ts:107)  — id, conceptId, questionPlane, snippet, prompt,
                                    explanationMarkdown, expectedFocus, evidence,
                                    difficulty, status, source, batchId, generation
AuthoredCard      (author.ts:82)  — conceptId, plane, prompt, expectedAnswer,
                                    expectedFocus, snippet (frozen, SHA-pinned)
AgentCardDraft    (importCards.ts:59) — the shape a coding agent sends (no snippet text)
```

---

## 3. The ingest pipeline

The ingest pipeline builds the concept graph from git history. It does NOT
author cards — it extracts what is worth learning about.

```
git log (git.ts:collectCommits)
    ↓
concept extraction (concepts.ts:extractConcepts)
    ↓  (splits diffs by file, extracts symbols, labels them)
lexicon application (lexicon.ts:applyLexicon)
    ↓  (user-curated aliases + ignores)
merge into state (planner.ts:mergeLearningState)
    ↓  (new concepts + concept states seeded, duplicate evidence deduplicated)
TutorState updated, saved to .skilltrace/state.json
```

Ingest runs deterministic code analysis — no LLM in this path. The LLM only
enters when cards are authored from the concepts ingest produced.

---

## 4. Card creation paths

### 4.1 Generate path (`author.ts`)

The LLM is the sole author. The planner (`planner.ts:generateCardBatch`)
selects which concepts to author against. For each target:

1. **Context bundle assembled** (`author.ts:buildContextBundle`): the
   snippet from `readRange`, neighbor usages from `grepRepo`, recent commit
   subjects from `gitContext`.
2. **Prompt built** (`author.ts:buildAuthorPrompt`): 5 blocks — role framing,
   material (grounding), target (plane + Bloom), exemplars (few-shot),
   constraints + JSON schema.
3. **LLM authors** (`author.ts:authorCard`): one `complete()` call. Up to
   `attempts` retries on unparseable JSON.
4. **Snippet frozen from disk**: the model cites a line range; `readRange`
   re-fetches it, and THAT text is pinned to the current HEAD commit SHA.
   The model's own snippet text is never trusted.
5. **The card is an `AuthoredCard`**. It has NOT yet been staged or
   scheduled — that is the provenancing pipeline's job (see §5).

### 4.2 Import path (`importCards.ts`, S11)

An external coding agent authors drafts as `AgentCardDraft[]` in a JSON file.
The CLI command `cards import --file <path>` runs the full pipeline:

1. **Freeze from disk** (`importCards.ts:freezeDraft`): the cited line range
   is re-read via `readRange`. The agent's snippet text is discarded.
2. **Concept creation** (Option 2): a synthetic `Concept` + `ConceptState`
   is created per unique range so the scheduler works unchanged. Idempotent
   on re-import.
3. **Pipeline**: `verifyFormat` → `validateAnswerKey` → `decideStaging`.
4. **Attached**: only `active` cards become `LearningItem`s. Rejected cards
   are reported but not scheduled.

The import path exists because the platform evaluation found the local LLM
was the quality bottleneck (answer_correct failed ~44% of the time).
A frontier coding agent is expected to close that gap.

---

## 5. The provenancing pipeline

This is the trust boundary. It runs identically for both card-creation paths
and is non-negotiable: every card passes every gate before it can be scheduled.

### 5.1 Freeze from disk (`tools.ts:readRange`)

The model or agent cites a file + line range. The tutor re-reads those
exact lines from disk and stores THAT text, pinned to the current HEAD commit
SHA. The author's snippet text is discarded. This is the anti-hallucination
guarantee.

### 5.2 Format verification (`verify.ts:verifyFormat`)

Deterministic, zero-cost checks that every card must pass:
- Prompt is not empty, ends with `?`.
- Expected answer is not empty.
- Expected focus is not empty.
- Snippet is not empty.
- Prompt does not contain the expected answer verbatim (anti-trivia guard).

### 5.3 Answer-key validation (`answerKey.ts:validateAnswerKey`)

An independent LLM oracle blind-derives an answer from the snippet alone and
compares it to the author's answer. This is the **only mechanical check on
semantic correctness**.

- With a usable endpoint: `deriveAnswer` (snippet + question, never the
  author's answer) → `judgeAgreement` → verdict `agree` | `disagree`.
- With no usable endpoint: verdict `skipped`. **Never throws.** If the
  endpoint is unreachable, the oracle degrades gracefully (S10 fix).
- `skipped` is honest — the card is grounded and format-checked, but
  truth was not independently verified.

### 5.4 Staging (`staging.ts:decideStaging`)

Combines the format verdict and answer-key verdict into a status:
- `active` — all gates pass. Card is schedulable.
- `needs_review` — format, trivia, or answer-key failure. Card is NOT
  scheduled; the human reviews it.
- `blocked` — reserved for prior user feedback (wrong-evidence,
  marked-bad-card). Card is suppressed.

### 5.5 Teachability gate (`teachability.ts`, S12)

A deterministic content-quality guard on the frozen snippet text. Runs with
or without an oracle. A cited range must be at least 34% substantive code
lines (excluding comments, imports, and lone braces). Below that floor, the
card can never be `active` → routed to `needs_review` instead.

This gate directly enforces the platform evaluation's #1 finding: target/plane
choice moves card quality ~1.7 points, and comment/import-heavy ranges yield
the weakest cards.

### 5.6 Scheduling

Cards that clear staging (`active`) are adapted to `LearningItem`s and
attached to state. They appear in `today` and `review`. The FSRS scheduler
(`scheduler.ts`) manages spacing and mastery tracking.

---

## 6. The daily learning loop

The core user workflow after `init` + `ingest`:

```
today               shows the next 3-5 minute review session (top-N due items)
  ↓
review              shows full cards with prompts, snippets, explain-back
  ↓
grade                |  the user answers, then self-grades (again/hard/good/easy)
  ↓                  |  mapped to FSRS Rating
events recorded      |  learningEvents updated
  ↓
FSRS update          |  due, stability, difficulty recalculated
  ↓
mastery update       |  conceptState masteryEstimate, confidence updated
  ↓
state machine        |  concepts reclassified: ready / blocked / mastered
  ↓
planner              |  ready concepts feed the next `cards generate` batch
```

The planer's scheduler (`scheduler.ts`) replaced the old ad-hoc `addDays(now,
isCorrect ? 3 : 1)` with `ts-fsrs`, a principled spaced-repetition model.
Parameter optimization requires accumulated history and is deferred.

---

## 7. Module map

Grouped by concern. New/modified in the v2 era (post-July-1 redesign) are
marked **[v2]**. Modules added in the S10-S12 hardening pass are marked
**[S10]** / **[S11]** / **[S12]**.

### Provenancing and gating

| Module            | Role                                              |
|-------------------|---------------------------------------------------|
| `tools.ts`        | `readRange`, `grepRepo`, `gitContext` — disk I/O  |
| `verify.ts`       | `verifyFormat` — deterministic anti-trivia gates  |
| `answerKey.ts`    | `validateAnswerKey` — independent oracle [v2]     |
| `staging.ts`      | `decideStaging` — combine gates into status [v2]  |
| `teachability.ts` | `scoreSnippetTeachability` — content signal ratio [S12] |

### Card authoring

| Module            | Role                                              |
|-------------------|---------------------------------------------------|
| `author.ts`       | `authorCard`, `buildContextBundle` — LLM sole author [v2] |
| `importCards.ts`  | `importAgentCards` — agent-authored card import [S11] |
| `exemplars.ts`    | Plane-specific gold exemplars for the author prompt [v2] |
| `endpoint.ts`     | `resolveEndpoint` — local-first, cloud consent-gated |
| `llmClient.ts`    | OpenAI-compatible fetch client (`createLlmClient`) |
| `budget.ts`       | Per-run token/cost budget guard [v2]              |

### Knowledge model

| Module            | Role                                              |
|-------------------|---------------------------------------------------|
| `types.ts`        | All shared types: Concept, LearningItem, TutorState, etc. |
| `concepts.ts`     | Concept extraction from git diffs                 |
| `conceptState.ts` | State machine: ready/blocked/mastered derivation  |
| `graph.ts`        | Concept DAG: cycle detection, topological sort    |
| `learningPath.ts` | Prerequisite ordering + path visualization        |

### Scheduler and daily loop

| Module            | Role                                              |
|-------------------|---------------------------------------------------|
| `scheduler.ts`    | `ts-fsrs` integration — stability, due, mastery [v2] |
| `planner.ts`      | `generateCardBatch`, `buildLearningItems` — the generation planner |
| `events.ts`       | `recordReviewEvent` — grade recording             |
| `render.ts`       | `renderToday`, `renderReview`, `renderProgress` — CLI output |

### Safety and correctness

| Module            | Role                                              |
|-------------------|---------------------------------------------------|
| `safeStore.ts`    | Atomic + version-checked state writes [v2]        |
| `featureFlags.ts` | `MERGELEARN_V2` env flag gating [v2]             |

### Evaluation (internal)

| Module            | Role                                              |
|-------------------|---------------------------------------------------|
| `grade.ts`        | Self-grading cards against a real code oracle [v2] |
| `cardEval.ts`     | Card quality scoring (falsifiable metrics) [v2]   |
| `evalTargets.ts`  | Seed targets for reproducible eval [v2]           |

### Legacy modules (pre-v2, still in use for non-author paths)

| Module            | Role                                              |
|-------------------|---------------------------------------------------|
| `questions.ts`    | Deterministic question authoring (pre-v2 path)    |
| `cardQuality.ts`  | Card quality evaluation (evidence, answerability) |
| `delayedProbes.ts` | Legacy delayed recall probes                     |
| `study.ts`        | A/B crossover study assignments                   |
| `ratings.ts`      | Manual 5-axis card rating                         |
| `courses.ts`      | Course grouping and management                    |
| `enrichment.ts`   | Learning item enrichment with deep explanations   |

### Infrastructure

| Module            | Role                                              |
|-------------------|---------------------------------------------------|
| `git.ts`          | `collectCommits`, `getLastCommitSha` — git I/O    |
| `store.ts`        | `loadState`, `saveState`, `statePath` — JSON persistence |
| `lexicon.ts`      | User-curated concept aliases and ignores          |
| `preferences.ts`  | Per-repo user preferences                         |
| `privacy.ts`      | Outbound snippet review config                    |
| `calibration.ts`  | Rating calibration for self-grading               |
| `workbench.ts`    | Developer workbench for concept inspection        |
| `progress.ts`     | Long-term progress tracking and visualization     |
| `evidenceTimeline.ts` | Evidence timeline for concept tracing          |
| `diffEvidence.ts` | Diff-based evidence extraction                    |
| `mapScaling.ts`   | Concept map scaling for large repos               |
| `evidenceIdentity.ts` | Evidence deduplication                        |

### Rendering and delivery

| Module            | Role                                              |
|-------------------|---------------------------------------------------|
| `render.ts`       | CLI output: today, review, progress, map, profile |
| `markdownHtml.ts` | Markdown-to-HTML for dashboard                    |
| `diffView.ts`     | Diff rendering for evidence display               |
| `session/server.ts` | Rich HTML review session and dashboard          |
| `dashboard/html.ts` | Static dashboard rendering                      |

---

## 8. CLI surface

```
mergelearn-tutor <command> [options]

init        Create .skilltrace/state.json for a repo
ingest      Read git history and build the concept graph
today       Show the next ~5-minute review session
review      Show full learning cards with prompts and evidence
serve       Start the HTML review server + dashboard

cards
  generate    Generate flashcards from concepts (LLM author path)
  import      Import agent-authored draft cards [S11]
    --file <path>    JSON array of AgentCardDraft
    --oracle         Run the independent answer-key oracle (default: skip)

events      Record review events (grading, corrections)
study       A/B crossover study management
course      Learning course management
questions   Pre-v2 deterministic question management
lexicon     User-curated concept aliases and ignores
privacy     Outbound snippet review consent
enrichment  Learning item enrichment
evidence    Git evidence inspection
ratings     Manual card rating
preferences User preference management
corrections User corrections (wrong concept, bad evidence)
```

---

## 9. Platform evaluation (2026-07-04)

The full eval kit at `/home/adam/mergelearn-eval/` ran 54 cards across 5
generation runs against local Ollama models, blind-judged by an independent
per-card Hermes session. Key findings:

- **Card quality distribution**: 13 good / 24 weak / 17 bad (~24% good rate).
- **What drives quality**: answer_correct and answerable_from_snippet are the
  failing dimensions (44% and 41% fail rate). These are the two dimensions no
  deterministic check can police — only the oracle touches them.
- **What the platform handles**: no_answer_leak (7% fail) and not_trivial
  (19% fail). The mechanical guardrails work. The format and safety gates
  are sound.
- **Target selection is the biggest lever**: architecture_flow (4.36) vs
  language_mechanics (2.66). Plane choice moves quality ~1.7 points.
- **Model size is inside the noise**: 1.5b (2.97) vs 7b (3.33), but three
  1.5b runs spanned 2.90-3.17. The 0.16 edge is not a proven win at n=6.
- **The judge is trustworthy**: separates good (4.5) from broken (2.7) on
  sanity anchors. Slightly lenient but correctly ranks.
- **One concrete bug**: the platform crashed on connection errors. Fixed in
  S10 (authorCard) and S11 (answerKey).

Full report: `/home/adam/mergelearn-eval/runs/CONCLUSIONS.md`.

---

## 10. Key design decisions

### 10.1 The trust boundary

The author's snippet text is never trusted. The cited range is re-read from
disk at the current HEAD commit SHA. This is the single invariant the entire
platform depends on.

### 10.2 Author LLM is optional (never a hard dependency)

Both `authorCard` and `validateAnswerKey` treat the LLM as optional: with
no usable endpoint they return `skipped` rather than throwing. S10 and S11
hardened this to also cover unreachable endpoints (fetch failure → skip).

### 10.3 The oracle is honest, never silent

When the answer-key oracle cannot run, the system says so. It never invents
a verdict. The CLI prints an explicit NOTE; the staging reason records
`answer_key:skipped_no_oracle`. With Ollama removed, this is the default state.

### 10.4 Local-first, cloud by consent

The default endpoint is a local OpenAI-compatible server. A cloud endpoint
requires `MERGELEARN_ALLOW_CLOUD=1` (explicit consent) + an API key. The
consent gate exists because authoring ships code snippets to the endpoint.

### 10.5 State is a single JSON file

`.skilltrace/state.json` is the only persistent artifact. No database, no
separate FSRS store. This keeps the platform portable, inspectable, and
backup-friendly.

### 10.6 v2 migration is designed but deferred

The v2 state migration (version 1 → 2, dropping legacy collections) is
specified in the design docs but not executed. It is gated on card quality
validation showing the v2 pipeline is at least as good as the pre-v2 path.

### 10.7 Cards are frozen to a commit SHA

Every card carries `snippet.commit` — the SHA at which the lines were
resolved. `checkSnippetDrift` (`verify.ts`) re-resolves the range at the
current HEAD and flags `fresh` / `drifted` / `missing`. This makes stale
cards detectable, never silently wrong.

---

## 11. Related documents

- `docs/design/design-core-2026-07-01/` — Original v2 redesign documents
  (design proposals, pre-implementation). Where they differ from this
  document, this document reflects what was actually built.
- `docs/design/CORE_PLATFORM_PLAN_2026_07_01.md` — High-level platform plan
  that spawned the v2 redesign.
- `docs/EVALUATION.md` — Evaluation methodology reference.
- `docs/ROADMAP.md` — Feature roadmap and priorities.
- `../../mergelearn-eval/runs/CONCLUSIONS.md` — Platform evaluation report
  (independent, in the eval kit sibling directory).
