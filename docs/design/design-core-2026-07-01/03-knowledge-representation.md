---
type: design
title: "Core Redesign: Knowledge Representation"
description: "Typed concept graph, ready/blocked/mastered state machine, and FSRS scheduling."
resource: docs/design/design-core-2026-07-01/03-knowledge-representation.md
tags: [design, core, knowledge-graph, fsrs]
timestamp: 2026-07-01
---

# Core Redesign - Knowledge Representation

Date: 2026-07-01
Author: Claude Opus 4.8 (via kiro)
Status: design, not yet implemented
Parent: `../CORE_PLATFORM_PLAN_2026_07_01.md`
REFINED: see `05-review-and-refinements.md`. The MoA review cut the edge set to 2 (prereq_of + is_a), removed confidence from the FSRS Rating, defined the mastery formula, set daily-cadence learning_steps, and fixed the migration to seed FSRS state (no cold-start herd). Where this doc and 05 differ, 05 wins. Inline corrections marked [REFINED].

## Goal

Make "what I know / what I don't / how it relates" honest and legible. Three parts: a typed concept graph, a ready/blocked/mastered state machine over it, and FSRS as the real scheduler. Time: 5-7 days.

## Current state (grounded)

- `Concept` (types.ts:68-78) already has `parentIds`, `prerequisiteIds`, `relatedIds` - three untyped id arrays. The relationships exist; they are just not typed edges or validated.
- `ConceptState` (types.ts:91-105) has `masteryEstimate`, `confidence`, `nextReviewAt`, `lastTestedAt`. Enough to derive state, missing FSRS's stability/difficulty.
- `learningPath.ts` already builds a prerequisite ordering (referenced in tests as a DAG). The acyclic check exists to reuse.
- Scheduling is the ad-hoc `addDays(now, isCorrect ? 3 : 1)` at events.ts:129.

## Typed concept graph (3 edges to start)

Formalize the three id arrays into typed edges. Add to `Concept` (or a sibling `edges` collection on `TutorState`) a single `ConceptEdge` type:

- `{ from: string; to: string; kind: 'is_a' | 'prereq_of' | 'relates_to' }`.
- `is_a` replaces `parentIds`, `prereq_of` replaces `prerequisiteIds`, `relates_to` replaces `relatedIds`. The v2 migration (doc 00) converts the arrays into edges mechanically.

Start with THREE edge kinds, not ten. The full property-graph vocabulary (targets, uses_evidence, from_commit, etc.) is over-modeling for a repo with ~12-50 concepts. Add an edge kind only when a feature needs to traverse it. This is a deliberate simplification versus the research's 10-edge proposal.

Validation: keep the acyclic invariant on `prereq_of` only (`is_a` and `relates_to` may form cycles harmlessly). Reuse the existing acyclic check from `learningPath.ts`. A cycle in `prereq_of` is a data error - reject the edge at insert time.

## Ready / blocked / mastered state machine

Derive a per-concept state from mastery + prereq edges (not stored, computed):

- `mastered`: `masteryEstimate >= threshold` (e.g. 0.8).
- `ready`: not mastered, and every `prereq_of` predecessor is mastered.
- `blocked`: not mastered, and at least one prereq predecessor is not mastered.

This is the honest-progress view. The Workbench colors concepts by state; the author (doc 01) prefers `ready` concepts (learnable now) and surfaces `blocked` ones only to teach their prerequisites first. A `prereq_of` cycle cannot deadlock this because the acyclic check rejects such edges at insert.

## FSRS scheduler (the one new dependency)

Replace the ad-hoc scheduler with `ts-fsrs` (open-spaced-repetition/ts-fsrs). It is pure TypeScript (ESM/CJS/UMD), no native build - the only new hard dependency in the whole redesign, and a justified one.

- Add FSRS card state to `ConceptState` (or a parallel `fsrsCards` keyed by itemId): `stability`, `difficulty`, `due`, `lastReview`, `state` (New/Learning/Review/Relearning), `reps`, `lapses`. These are the `createEmptyCard()` fields from ts-fsrs.
- On each graded review: map the grade (doc 02) to a ts-fsrs `Rating` (Again/Hard/Good/Easy), call `f.repeat(card, now)[rating]`, store the returned card + `due`. `nextReviewAt` becomes the FSRS `due`.
- Cold start: FSRS's own `learning_steps` handle the first reviews. Do NOT keep the hardcoded 2/7-day probes as a parallel system - let FSRS own the whole schedule. `DelayedProbe` and `delayedProbes.ts` are removed.
- Honesty note: adopt FSRS for the principled model, not a near-term review-count win. The "20-30% fewer reviews" figure needs accumulated per-user history to fit parameters; a fresh deck runs on presets. Ship with default parameters; parameter optimization is a much-later, optional step.

## The coherent loop

grade (doc 02) -> FSRS Rating -> `due` + stability -> mastery update -> state machine reclassifies (ready/blocked/mastered) -> author (doc 01) picks the next `ready` concept to work on. One directed flow, no competing schedulers.

## Time breakdown (5-7 days)

- `ConceptEdge` type + v2 migration from the three id arrays + acyclic validation: 1.5 days.
- State machine (derive ready/blocked/mastered) + Workbench coloring: 1.5 days.
- `ts-fsrs` integration: card state fields, Rating mapping, replace events.ts:129 scheduler: 2 days.
- Remove `delayedProbes`, wire the loop, tests: 1-2 days.