---
type: plan
title: "Iteration 03: Focused Practice"
description: "Separate selected-card practice from scheduler-led review."
resource: docs/iterations/iteration-03-focused-practice/README.md
tags: [iteration, practice, fsrs]
timestamp: 2026-08-04
---

# Iteration 03: Focused Practice Modes

## Outcome

Users can study a chosen scope once or retry missed cards without corrupting FSRS scheduling.

## Scope

- Separate card scope from session goal in Manage and Practice.
- Add `Study once` as the default focused goal.
- Add bounded `Retry missed` rounds for Again or incorrect results.
- Prevent immediate repetition of the same card.
- Cap retry rounds and exposures, always allowing End session.
- Record drill attempts separately and update FSRS at most once per card per focused session.
- Keep `Review due` as the distinct scheduler-led action.
- Add a completion summary with first-pass, retried, and unresolved cards.

## Prove it

- Unit-test queue construction, bounds, termination, and FSRS write counts.
- Verify Study once visits every selected card exactly once.
- Verify Retry missed cannot create multiple spaced repetitions.
- Browser-test selection, mode explanation, session completion, early exit, and empty scopes.

## Excluded

- Labels such as Perfect or Mastered, unbounded grinding, adaptive algorithms, or readiness scores.
