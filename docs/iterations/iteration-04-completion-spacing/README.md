---
type: plan
title: "Iteration 04: Completion and Spacing Quality"
description: "Make completion truthful and prevent related cards from cueing each other."
resource: docs/iterations/iteration-04-completion-spacing/README.md
tags: [iteration, completion, review, spacing]
timestamp: 2026-08-04
---

# Iteration 04: Completion and Spacing Quality

## Outcome

Completion means demonstrated graded recall, and review ordering avoids adjacent cards that reveal one another.

## Scope

- Replace attempt-only lesson completion with a minimal graded-recall rule.
- Keep qualitative self-responses visible without treating them as deterministically correct.
- Add the smallest source/sibling marker needed to relate cards from one example.
- Keep sibling cards apart when the queue has alternatives.
- Use a deterministic fallback when complete separation is impossible.
- Update labels and documentation to avoid durable-learning claims after one sitting.

## Prove it

- Test completion for choice, Parsons, self-response, mixed, and partially graded lessons.
- Verify sibling spacing and deterministic fallback across small and large queues.
- Regression-test due ordering, interleaving, weak-card reports, and session history.
- Browser-test progress labels and review order with a disposable lesson.

## Excluded

- Evidence taxonomy, mastery model, readiness percentage, runtime grading, and confidence-driven scheduling.
