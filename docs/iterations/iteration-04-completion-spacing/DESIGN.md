---
type: design
title: "Iteration 04: Completion and Spacing Quality"
description: "Target design for honest lesson completion and sibling-aware Review order."
resource: docs/iterations/iteration-04-completion-spacing/DESIGN.md
tags: [iteration, completion, spacing, design]
timestamp: 2026-08-05
---

# Iteration 04 Design: Completion and Spacing Quality

## Status and grounding

Current lesson progress in `src/core/library/review/sessionHistory.ts:37-88` treats any lesson ReviewEvent as completion evidence. `ReviewAttempt.correct` already distinguishes deterministic choice and Parsons outcomes from self-graded flashcard and self-response attempts. `orderDueQueue` provides deterministic Set interleaving but has no relationship marker within a Set.

## Decisions

- D1: Replace attempted-card sets with per-card lesson evidence derived from existing ReviewEvents. Do not add a new evidence file, mastery model, score, or runtime grader.
- D2: Classify the event that was recorded, never the card's current interaction. If `attempt.correct` is present, it suppresses the self-assessed path: `true` with Hard, Good, Easy, or a malformed missing rating is a deterministic pass; `false` or Again is not passed. The conservative `correct: true` plus Again failure is deliberate.
- D3: An event without deterministic correctness passes only as self-assessed recall when rated Hard, Good, or Easy. A missing or invalid rating does not pass. This includes legacy rating-only events, even if re-import later changes the card to choice or Parsons. It never increments the deterministic count or receives a Correct label.
- D4: Only events from lesson-mode sessions whose first Set filter equals the lesson Set contribute. Any historical passing lesson event remains coverage evidence; later FSRS lapse does not erase it. Each current card is counted exactly once at its highest historical evidence class, so `passedCount = deterministicCount + selfAssessedCount` and cannot exceed `total`. Lesson state is complete only when every current active card has passing evidence, so adding a card can return a lesson to in progress. Progress reports those counts, `total`, state, and first unpassed card. Empty lessons remain not started; archived and removed cards do not block.
- D5: Add optional `siblingGroupId` to Card and AgentCardDraft. It is an author-owned, nonempty, set-local opaque string that groups activities derived from one example or answer-bearing source. It is not a new entity, foreign key, tag, or cross-Set relationship.
- D6: Normalize an authored sibling id with `trim()`, require 1 through 100 JavaScript string code units, and compare case-sensitively. Two cards are siblings only when they have the same `setId` and identical normalized `siblingGroupId`. An explicitly empty or whitespace-only value is invalid; re-import removes the field only when it is absent. Learner-owned FSRS is preserved. Never infer the group from prompts, titles, tags, or content.
- D7: Add a pure deterministic spacing pass after final Review selection. Treat every ungrouped card as a unique singleton group. Repeatedly choose the eligible group with the most remaining cards, excluding the previously emitted group; tie-break by that group's earliest remaining original index, and preserve original order within each group. If no other group exists, emit from the remaining group. This standard group-count schedule separates siblings whenever the selected group counts permit it and falls back deterministically otherwise.
- D8: Spacing may displace exact overdue priority within the already selected Review set; membership and cap remain unchanged, and avoiding answer cues takes precedence there. Apply it now only to the current Review due queue. Iteration 03 may reuse the helper for planned Review due only after its cross-design gate passes. Never reorder authored Learn, Study once, or Retry missed plans.
- D9: UI language says Lesson complete, Deterministic recall, and Self-assessed recall. It never says Mastered, Proven, Ready, or a readiness percentage.

## Acceptance criteria

1. Incorrect deterministic attempts and Again ratings cannot complete a card.
2. Self-graded cards can complete a lesson but remain visibly self-assessed, never deterministically correct.
3. Current active cards alone define the denominator and resume target.
4. Siblings are non-adjacent whenever the selected group counts permit a no-adjacency arrangement; infeasible inputs use deterministic fallback.
5. Existing due membership, cap, weak-card reports, FSRS, and authored Learn order remain unchanged; exact within-selection overdue order may move for spacing.
