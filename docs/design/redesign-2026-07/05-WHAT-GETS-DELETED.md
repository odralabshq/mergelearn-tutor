---
title: "MergeLearn Tutor — What Gets Deleted (2026-07 Redesign)"
description: "The aggressive simplification inventory: modules, CLI commands, and state collections removed, refactored, kept, or newly built. Grounded in the as-built module map (main f3ea7fc). The tutor loses card generation, code analysis, the concept graph, the answer-key oracle, and QuestionPlane; it keeps provenance freezing, FSRS, and validation."
resource: docs/design/redesign-2026-07/05-WHAT-GETS-DELETED.md
tags: [architecture, simplification, cleanup, redesign]
updated: 2026-07-07
status: design
---

# What Gets Deleted

The point of the pivot is a much smaller platform. This is the concrete
inventory, grounded in the module map in `docs/design/ARCHITECTURE.md` and the
types in `src/core/types.ts`. Nothing here is executed yet — this is the
target for the clean-slate cutover (doc 02 sec 5).

Legend: **KEEP** (largely unchanged) · **REFACTOR** (survives, changed) ·
**REMOVE** (deleted) · **NEW** (build).

The through-line: anything that **generates cards, analyzes code, or infers
learning structure** is deleted. What survives does something deterministic
and perfect — freeze provenance, schedule, validate, render.

---

## 1. Modules — REMOVE (the bulk of the deletion)

| Module | Why it goes |
|---|---|
| `author.ts` | bundled LLM author — the agent authors now |
| `exemplars.ts` | few-shot for the bundled author |
| `llmClient.ts` | bundled model client — zero model runtime |
| `endpoint.ts` | endpoint resolution — no bundled endpoint |
| `budget.ts` | token/cost guard for the bundled author |
| `questions.ts` | deterministic question pipeline |
| `answerKey.ts` | answer-key oracle — removed from core |
| `concepts.ts` | deterministic concept extraction from diffs |
| `conceptState.ts` | mastery machine — mastery is derived from sessions |
| `learningPath.ts` | prerequisite path visualization — no path UI |
| `lexicon.ts` | concept aliases — folded into `CardTag.aliases` (agent-managed) |
| `cardQuality.ts` | superseded by structure validation |
| `delayedProbes.ts` | superseded by FSRS |
| `study.ts` | A/B crossover harness |
| `ratings.ts` | manual 5-axis rating |
| `courses.ts` | replaced by `CardSet` |
| `enrichment.ts` | agent authors full explanations in the card back |
| `calibration.ts` | tied to the self-grading research path |
| `evidenceTimeline.ts`, `diffEvidence.ts`, `mapScaling.ts`, `evidenceIdentity.ts` | concept-map / timeline era |

---

## 2. Modules — REFACTOR (survive, changed)

| Module | Change |
|---|---|
| `importCards.ts` -> `importAgentSet.ts` | consumes `AgentSetPatch`; writes into a set folder, not a synthetic concept |
| `verify.ts` | keep `verifyFormat` (structure) + `checkSnippetDrift`; drop trivia-vs-oracle coupling |
| `teachability.ts` | downgraded — code-density floor applies ONLY to cards with source refs |
| `staging.ts` -> `decideStatus.ts` | combine structure + freeze into status; delete the oracle branch |
| `scheduler.ts` | keep ts-fsrs; now strictly per-card |
| `events.ts` -> `sessionStore.ts` | writes per-session files, not a flat event array |
| `store.ts` | becomes the global library store (folder-per-set, card-per-file) |
| `preferences.ts` | global profile prefs |
| `privacy.ts` | shrinks to `.mergelearnignore` handling (nothing sends code) |
| `workbench.ts` | Home data provider, not a concept inspector |
| `render.ts`, `session/server.ts`, `dashboard/html.ts` | Home + Practice only |
| `graph.ts` | reduced to a generic DAG validator (cycles/dangling) for the tag taxonomy — NOT a concept builder |

## 3. Modules — KEEP

| Module | Role |
|---|---|
| `tools.ts` | `readRange` — freeze from disk. The invariant. |
| `git.ts` | repo SHA + file reads for freezing |
| `safeStore.ts` | atomic, version-checked writes |
| `progress.ts` | honest progress + heatmap |
| `markdownHtml.ts`, `diffView.ts` | render card backs / snippets |
| `featureFlags.ts` | useful during the cutover, then trim |

## 4. Modules — NEW

| Module | Role |
|---|---|
| `library/libraryStore.ts` | read/write `~/.mergelearn/` |
| `library/setStore.ts` | folder-per-set storage |
| `library/cardStore.ts` | one-card-per-file storage |
| `library/tagStore.ts` | the tag taxonomy (hierarchy + relations) |
| `library/repoRegistry.ts` | `repoId` -> path/label/status |
| `import/validateSetPatch.ts` | tag-patch + structure validation |
| `import/freezeSources.ts` | freeze cited code when source refs present |
| `review/session.ts` | start / grade / end review sessions |

---

## 5. CLI surface

| Before | After |
|---|---|
| init, today, review, serve | KEEP (today/review read the global library) |
| ingest | REMOVE — tutor no longer analyzes commits; the agent reads the repo |
| `cards generate` | REMOVE |
| `cards import --file [--oracle]` | REFACTOR -> `set import --file <patch>` (no `--oracle`) |
| events | REFACTOR — folded into the review session flow |
| study, course, questions, ratings, enrichment | REMOVE |
| lexicon | REMOVE (tag aliases are agent-managed) |
| privacy, preferences, corrections | KEEP (trimmed; corrections -> card status) |
| — | NEW: `set` (create/rename/tag/list/move), `tag` (list/inspect the taxonomy) |
| — | NEW: `repo` (registry), `context` (emit `AuthoringContext` for the agent) |
| — | NEW: `library import-legacy` (one-shot `.skilltrace` -> global) |

The `context` command is the tutor half of the handshake: it prints the
`AuthoringContext` an agent needs before authoring a patch.

---

## 6. State collections (`TutorState` -> global library files)

| Collection | Fate |
|---|---|
| `learningItems` | -> `Card` files under `sets/<id>/cards/` |
| `courses` | -> `CardSet` (`set.json` + folder) |
| `concepts` | -> `CardTag` entries in `tags.json` |
| `conceptStates` | FSRS half -> `Card.fsrs`; mastery -> derived from sessions |
| `learningEvents` | -> `profile/sessions/**` per-session files |
| `cardBatches` | -> `ImportRecord` |
| `corrections` | -> folded into `Card.status` |
| `questionBank`, `questionDraftBatches` | REMOVE |
| `studyAssignments`, `manualRatings`, `delayedProbes` | REMOVE |
| `artifacts` (`CommitArtifact`) | REMOVE — no commit ingest |

---

## 7. Net effect

- **~19 modules removed**, ~12 refactored, ~8 new — but the new modules are
  small storage/validation seams, and the removed ones are the largest
  (author runtime, concept extraction, study harness, deterministic pipeline).
- **~8 CLI command groups removed**, ~5 added.
- **~10 state collections dropped or folded.**
- **Two whole subsystems deleted outright:** card generation (author + oracle +
  deterministic pipeline) and code analysis / concept extraction.
- What remains — provenance freezing, FSRS, structure validation, rendering —
  is deterministic, model-free, and does one job well. The tutor stops trying
  to be smart about content and becomes excellent at being a reliable library.
