---
type: implementation-design
title: "Iteration 04: Completion and Spacing Quality Implementation"
description: "Verified-path implementation contract for evidence-derived completion and sibling spacing."
resource: docs/iterations/iteration-04-completion-spacing/IMPLEMENTATION.md
tags: [iteration, completion, spacing, implementation]
timestamp: 2026-08-05
---

# Iteration 04 Implementation Design

## Change surfaces

Modify `src/core/library/types.ts`, `review/sessionHistory.ts`, `review/interleave.ts`, `validateSetPatch.ts`, `importAgentSet.ts`, and the existing server progress renderers. Extend their existing tests. Do not create a production evidence module, relationship store, or scheduler.

## Completion contract

Replace `attemptedCardIds` and `attemptedByLessonSet` call sites with evidence readers over persisted lesson sessions for the same first Set filter. New records must be scheduled lesson results whose request id is not tombstoned; evidence-only records and non-lesson modes are excluded before classification. Legacy events without result identity inherit scheduled lesson status only from their containing legacy lesson session. A pure classifier then checks `attempt.correct` presence: true plus non-Again or malformed missing rating is deterministic, false or Again is not passed, and absent correctness plus rating 2 through 4 is self-assessed. Per card, retain only the highest live historical class.

`computeLessonProgress` accepts ordered active card ids plus the evidence map. It computes current counts and first unpassed card without mutating history. The API and rendered rows expose the separated counts. Existing session files need no migration.

## Sibling contract

Add optional `siblingGroupId` to Card and AgentCardDraft. Import persists the trimmed author-owned value, removes it only when absent on re-import, and updates `updatedAt` normally. Validation rejects an explicit value unless its trimmed form is 1 through 100 JavaScript string code units. Sibling identity requires equal Set ids and exact-case normalized group ids.

Add `spaceSiblingCards(cards)` beside `orderDueQueue`. Build stable per-group queues, treating each ungrouped card as its own singleton. At each step choose the non-previous group with greatest remaining count, then earliest original index; preserve order inside a group. If only the previous group remains, emit it. Apply once after current Review selection. Iteration 03 may call the helper only after its design is independently cleared.

## Implementation sequence

1. Add failing event-classification and mixed-progress tests, then implement the pure evidence path.
2. Update server progress contracts and labels, preserving current active-card denominators.
3. Add failing sibling validation/import tests, then persist the optional field.
4. Add failing stable-spacing tests, then apply the helper only to Review paths.
5. Run weak-card, history, due, interleave, server, browser, and full package gates.

No evidence taxonomy, correctness inference for prose, runtime model, mastery threshold, readiness score, cross-Set graph, or confidence-driven scheduling belongs in this iteration.
