---
type: review
reviewer: "Opus 5 via Kiro, source-grounded by Hermes"
review_cycles: 3
title: "Iteration 04: Completion and Spacing Quality Review"
description: "Independent review record and source-grounded adjudication."
resource: docs/iterations/iteration-04-completion-spacing/REVIEW.md
tags: [iteration, completion, spacing, review]
timestamp: 2026-08-05
---

# Iteration 04 Design Review

## Review boundary

This package derives honest lesson progress from existing events and adds one optional set-local sibling marker plus stable Review spacing. It must not create an evidence store, mastery model, relationship graph, runtime grader, adaptive scheduler, or readiness score.

## Initial source checks

- `sessionHistory.ts:37-88` currently unions any lesson event and calls every active card attempted once completed.
- `types.ts:185-217` already records deterministic `attempt.correct` only when available and retains qualitative ratings for every event.
- `weakCards.ts:10-35` already documents why missing correctness must not be treated as failure.
- `interleave.ts:15-40` deterministically mixes Sets but cannot identify sibling cards inside one Set.
- `importAgentSet.ts:203-227` clearly separates author-owned fields from preserved learner FSRS.

## Required Opus review

Challenge the completion rule for conflicting rating/correctness, legacy events, archived cards, and mixed lessons. Challenge whether `siblingGroupId` is the smallest useful marker, whether the stable greedy pass preserves priority adequately, and whether any scope should be removed. Record every numbered finding as adopted, modified, deferred, or rejected. At most three cycles.

## Adjudication ledger: Opus cycle 1

The first review is `/tmp/mergelearn-iteration-04-opus-review-cycle-1.md`. It returned BLOCKED. All twelve findings are accounted for below.

- R1 adopted: the contradictory missing-correctness rules are replaced by event-record classification.
- R2 adopted: rating-only events are self-assessed regardless of the card's current interaction.
- R3 adopted: present `correct: false` suppresses self-assessment even with Easy.
- R4 adopted: `correct: true` plus Again deliberately remains not passed.
- R5 adopted: interaction changes never rewrite old evidence; counters expose the evidence class honestly.
- R6 adopted: only lesson-mode events for that lesson Set count. Coverage is monotonic across events, while adding active cards can regress current completion.
- R7 adopted: the earliest-eligible greedy algorithm is removed because `A B B` disproves its guarantee.
- R8 adopted: deterministic largest-remaining-group scheduling handles feasible group arrangements, with original-index tie breaks.
- R9 adopted: exact overdue priority may be displaced inside the already selected set and is documented, not falsely claimed preserved.
- R10 adopted: sibling ids are trimmed, 1 through 100 code units, case-sensitive, and scoped by Set; absence is never inferred.
- R11 adopted: Iteration 03 reuse is explicitly gated by its cross-design approval.
- R12 adopted through the revised tests, including wrong-plus-Easy, legacy rating-only, and `A B B`.

## Adjudication ledger: Opus cycle 2

The focused review is `/tmp/mergelearn-iteration-04-opus-review-cycle-2.md`. It returned NOT BLOCKED. Its eight findings are accounted for below.

- R13 confirmed: the event classifier is disjoint and exhaustive for valid ratings.
- R14 adopted defensively: malformed deterministic events with `correct: true` and missing rating pass deterministically; `correct: false` fails. Missing rating without correctness does not pass.
- R15 adopted: each card contributes once at its highest class, with `passedCount = deterministicCount + selfAssessedCount`.
- R16 confirmed: monotonic historical coverage and the current-active denominator are coherent.
- R17 confirmed: largest-remaining eligible group scheduling guarantees separation whenever group counts permit it.
- R18 adopted as an implementation invariant: ordering uses current remaining counts, never original static counts.
- R19 adopted: sibling identity is equal Set plus identical normalized id; explicit empty values reject, while absence alone removes the field.
- R20 confirmed: scope and tests are proportionate.

## Implementation verdict

Implementation commit: `e94ea7b6229e50fd85a472d14043c3e424298ecb`.

The exact reviewed tree passed 370 tests across 41 files, TypeScript check, build, packaged smoke over 148 files, and `git diff --check`. A fresh built-artifact Brave CDP run proved authored Learn order, capped Review sibling spacing, incorrect deterministic attempts remaining incomplete, and honest deterministic plus self-assessed recall labels on Home and Set.

The final current-tree review is `/tmp/mlt-iteration04-opus-verdict.md`. It returned `NOT BLOCKED`. Its findings and gaps are accounted for below.

- I1 confirmed as intentional compatibility: result-less events remain legacy evidence only in plan-less lesson sessions. Planned sessions require scheduled result identity.
- I2 deferred: malformed hand-edited card files can carry invalid sibling markers outside the validated import boundary. No observed product write path creates this state, and membership is not lost.
- I3 deferred: agent-facing discoverability for the optional sibling marker should be evaluated with the authoring contract rather than adding iteration-local schema machinery.
- T1 deferred: later-failure non-erasure deserves a direct regression, but strongest-class retention is order-independent in the reviewed implementation.
- T2 deferred: HTTP Undo to lesson-progress integration deserves a direct route regression; persisted tombstone classification and the Undo protocol are independently covered.
- T3 accepted through built-browser evidence: completed and deterministic labels were exercised against rebuilt artifacts. A duplicate HTML-only assertion is not required for closure.
- T4 deferred: route-level archived-card denominator coverage would strengthen the existing active-id and ghost-evidence controls.

Iteration 04 is complete. Its planned Review integration is the explicit cross-design approval required by D8. No evidence store, mastery model, relationship graph, runtime grader, adaptive scheduler, or readiness score was added.
