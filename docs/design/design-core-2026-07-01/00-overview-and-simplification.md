---
type: design
title: "Core Redesign: Overview and Simplification"
description: "Thesis, removal list, and time budget for the LLM-sole-author core redesign."
resource: docs/design/design-core-2026-07-01/00-overview-and-simplification.md
tags: [design, core, simplification]
timestamp: 2026-07-01
---

# Core Redesign - Overview and Simplification

Date: 2026-07-01
Author: Claude Opus 4.8 (via kiro)
Status: design, not yet implemented
Parent: `../CORE_PLATFORM_PLAN_2026_07_01.md`
Siblings: `01-card-generation.md`, `02-review-grading-history.md`, `03-knowledge-representation.md`, `04-delivery-and-sequence.md`
REFINED: `05-review-and-refinements.md` records an MoA review that reversed several decisions below. Where this doc and 05 differ, 05 wins. Inline corrections are marked [REFINED].

## What this doc set is

Five design documents describing HOW to implement the four core work areas in the parent plan, grounded in the current code. Each doc names the exact files to change, what to add, and what to delete. This overview covers the shared thesis, the simplification (what to remove), the migration approach, and the time budget.

## The thesis in one line

Make the LLM the sole card author over a small, honest, well-typed core - and delete the deterministic-authoring machinery and research scaffolding that no longer serves that core.

## Current core inventory (grounded)

The state model (`src/core/types.ts`) is large: 20+ top-level collections on `TutorState`. Not all of it is core. Sorting it:

- Keep and improve: `concepts`, `conceptStates`, `learningItems`, `learningEvents`, `artifacts`, `delayedProbes` (to be replaced by FSRS state), `corrections`.
- Simplify or remove (see below): `questionBank`, `questionDraftBatches`, `studyAssignments`, `manualRatings`, `cardBatches`, `courses`.

## Simplification - what to remove and why

The deterministic-authoring era left machinery that an LLM-sole-author core does not need. Removing it is half the work and most of the risk reduction.

- Deterministic question author (`src/core/questions.ts`). The one-line template prompt (`Using ${path}, explain ${label} from the ${plane} perspective.`) produces filler. Delete the deterministic author path. Keep only the plane/Bloom metadata that the LLM prompt will reuse.
- `questionBank` + `questionDraftBatches` (types.ts:155-187, 178-187). This is a two-stage draft/accept/reject pipeline built for deterministic drafting plus human curation. With an LLM sole author writing directly into `learningItems` (gated by verification, see doc 02), the intermediate bank is dead weight. Remove both collections and the `QuestionAuthorType`/`QuestionProvider` unions.
- `studyAssignments` (types.ts:232-244). A/B crossover-study scaffolding (`mergelearn` vs `active_control`). This is research-experiment apparatus, not a product feature. Remove it and `StudyCondition`/`StudyAssignmentStatus`.
- `manualRatings` (types.ts:257-269). A 5-axis manual card-rating form. The honest signal now comes from LLM grading + FSRS (doc 02), not a manual rubric. Remove it; keep the lighter `corrections` mechanism which drives real suppression/pinning (events.ts:94-107).
- `courses` (types.ts:143-153). A grouping layer around planes and material paths. Assess during implementation: if the CLI's course commands are load-bearing for multi-goal repos, keep a slimmed version; otherwise fold its two useful fields (goal, materialPaths) into `TutorState.goals` and remove the collection.
- `cardBatches` (types.ts:133-141). [REFINED: KEEP - reversed by doc 05.] Batch bookkeeping gives bulk rollback of a poisoned generation run, which is worth MORE during heavy prompt-tuning (step 7 regenerates repeatedly), not less. Retain it.
- [REFINED: retained card-quality signal.] Removing `manualRatings` does NOT lose card-quality signal: the existing `ReviewEventType` values `marked_bad_card`, `marked_useful`, `marked_wrong_evidence`, `marked_duplicate` (types.ts:18) capture it inline in the review flow, and `corrections` drives suppression/pinning. Only the redundant 5-axis form is removed.
- [REFINED: staging survives as a status.] `questionBank`/`questionDraftBatches` are removed as collections, but the staging CONCEPT survives as a `pendingReview` status on `LearningItem`: cards stay pending until they clear verification AND answer-key validation (doc 02), then promote to active. This keeps the pre-schedule catch without the two-collection pipeline.

Net effect: `TutorState` drops from 20+ collections to ~9. Every removed collection is also removed from `createEmptyState`/`normalizeState` (store.ts:16-57), the CLI, and the server routes.

## Migration approach

State is a single JSON file at `.skilltrace/state.json` (store.ts:12), version 1. The redesign bumps to version 2.

- `normalizeState` becomes a v1->v2 migration: drop removed collections, seed FSRS fields on existing `conceptStates`, and convert existing `delayedProbes` to FSRS cards (or discard - they are low-value historical schedule state).
- The migration is one-way and lossy by design (it drops experiment data). That is acceptable: this is a local tool, the removed data is not user-facing, and a v1 backup is written before migration.

## Time budget (the golden core must be right)

Total: ~4.5 to 6 weeks of focused work, sequenced so a testable core exists at the ~2.5 week mark.

- Simplification + v2 migration: 3-4 days. Do this FIRST - a smaller surface makes everything after it cheaper.
- Card generation (doc 01): 5-7 days. The biggest quality lever; budget the most careful time here.
- Review, grading, history (doc 02): 4-5 days.
- Knowledge representation (doc 03): 5-7 days.
- Delivery: skill + CLI (doc 04): 3-4 days.
- Buffer for real-repo testing and prompt/exemplar tuning (data, not code): 5-7 days.

The buffer is not optional. The core is judged on the cards it produces, and that is tuned empirically after the machinery works.