---
title: "MergeLearn Tutor — Simplified Platform Architecture (2026-07 Redesign)"
description: "North-star architecture after the 2026-07 simplification pivot: model-free library + FSRS review shell, agent-authored learning sets, Quizlet-style sets/folders/tags, agent-maintained tag taxonomy, self-contained card backs, two-tab UI, global library. Supersedes the concept-centric v2 design where they conflict."
resource: docs/design/redesign-2026-07/00-OVERVIEW.md
tags: [architecture, redesign, north-star, 2026-07]
updated: 2026-07-07
status: design
---

# MergeLearn Tutor — Simplified Platform (2026-07 Redesign)

This is the **target** architecture, not the as-built one. For what exists
today (main at f3ea7fc), see `docs/design/ARCHITECTURE.md`. Where the two
disagree, ARCHITECTURE.md is the present and this folder is the destination.

This redesign is an aggressive **simplification**. The platform grew a
concept-graph-first model, a deterministic question pipeline, a bundled LLM
author, an answer-key oracle, an A/B study harness, and a per-plane question
taxonomy. Nearly all of it is being deleted. What remains is small, honest,
and centered on one job.

---

## 1. The pivot in one paragraph

MergeLearn stops being a card *generator* and a code *analyzer*. It becomes a
**model-free local learning library and FSRS review shell.** The user's own
connected coding agent authors complete learning sets — cards, self-contained
explanations, tags, folders, ordering, and taxonomy updates. MergeLearn
stores those sets as folder-based local files, validates their structure,
freezes any cited code from disk, schedules cards with FSRS, records review
sessions, and presents a two-tab (Home + Practice) UI. The tutor never infers
learning structure and never runs a model.

---

## 2. Mission

**Turn agent-authored learning material — often grounded in a repo, but not
required to be — into local spaced-repetition card sets a developer actually
reviews.**

The repo is a common *source* of material, not the root of the data model. A
set teaching TypeScript unions is as first-class as a set teaching a repo's
auth flow. Cards must teach on their own; source references are provenance and
enrichment, not the only place learning lives.

---

## 3. Eight decisions this redesign locks in

1. **No card generation in the tutor.** The `cards generate` (LLM sole
   author) path and the deterministic question pipeline are deleted. Card
   creation is **import-only**: the agent authors, the tutor imports.
2. **Zero model runtime.** The tutor never hosts, bundles, or requires a
   model. A user who wants local-model privacy connects an agent running a
   local model. Model choice and privacy are the agent's concern.
3. **No deterministic learning-structure inference.** The tutor does NOT
   extract concepts, tags, question types, or ordering from code. The agent
   authors all of it. The tutor stores and validates; it never invents.
4. **One taxonomy, agent-maintained.** Tags ARE the learning graph: a tag
   carries hierarchy (`parentIds`) and relations (`relatedIds`). There is no
   separate concept graph. The tutor hands the existing taxonomy to the agent
   as context so it extends rather than duplicates.
5. **Quizlet-style object model.** `CardSet` is the user-facing atom. A card
   belongs to exactly one set and carries many-to-many tags. Folders and tags
   handle all cross-cutting organization (including question type).
6. **Self-contained cards.** Every card back has a short answer AND a full
   educational explanation, so the user learns by reading and answering — no
   need to open the repo. `QuestionPlane` and the answer-key oracle are
   removed from the core.
7. **Folder-per-set, card-per-file, session-based history.** Storage is a
   global `~/.mergelearn/` library: one folder per set, one JSON per card,
   review history in per-session files. No monolithic set JSON, no global
   event log.
8. **FSRS + profile kept underneath.** Scheduling stays per-card. The profile
   is a calm reflection of progress and the substrate the agent reads to
   refine weak cards.

---

## 4. What MergeLearn is (and is not) after this

| MergeLearn IS | MergeLearn is NOT |
|---|---|
| A model-free local learning library | A card generator |
| An FSRS review shell (Home + Practice) | An LLM host or runtime |
| An importer + validator of agent-authored sets | A code analyzer / concept extractor |
| A store for sets, cards, tags, sessions | An A/B research harness |
| Provenance freezing for cited code | A course/curriculum builder |

---

## 5. The one invariant that does not change

**Cited code is never trusted from the author; it is frozen from disk.** When
a card carries source references, the tutor re-reads those exact lines at the
current HEAD SHA and pins THAT text — the agent's snippet text is discarded.
This anti-hallucination guarantee is preserved verbatim. It now applies
conditionally: pure conceptual cards carry no source refs and have nothing to
freeze.

---

## 6. Document set

| Doc | Covers |
|---|---|
| `00-OVERVIEW.md` | This file — north-star + the eight decisions |
| `01-OBJECT-MODEL.md` | CardSet / Card / CardBack / CardTag (taxonomy) / ReviewSession |
| `02-STORAGE-AND-MIGRATION.md` | `~/.mergelearn/` folder layout, repo registry, clean-slate cutover |
| `03-CARD-PIPELINE.md` | Agent authoring handshake, `AgentSetPatch`, validation, source freezing |
| `04-UI-AND-UX.md` | Two-tab IA, onboarding, honest progress, profile |
| `05-WHAT-GETS-DELETED.md` | The simplification: modules/CLI/collections retired |
