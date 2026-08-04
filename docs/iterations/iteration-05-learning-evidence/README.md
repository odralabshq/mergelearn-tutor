---
type: plan
title: "Iteration 05: Learning Evidence"
description: "Replace overclaiming completion with evidence-aware progress and trustworthy review ordering."
resource: docs/iterations/iteration-05-learning-evidence/README.md
tags: [iteration, progress, evidence, review]
timestamp: 2026-08-04
---

# Iteration 05: Honest Learning Progress and Review Integrity

## Outcome

Progress labels describe what the learner actually demonstrated, and related cards do not inflate one another's evidence.

## Scope

- Replace attempt-only `Completed` semantics with explicit evidence-aware states.
- Separate deterministic correctness, qualitative self-response, scheduled review, and session completion.
- Preserve self-responses as useful evidence without treating them as automatically correct.
- Add provenance or sibling-group metadata for cards derived from one source problem or example.
- Keep sibling cards apart in review queues to prevent answer leakage.
- Report first-attempt, retry, confidence, and spacing evidence without a global mastery score.
- Update user-facing language and documentation to avoid durable-learning claims after one sitting.

## Prove it

- Test state transitions for mixed interaction types and incomplete evidence.
- Verify sibling separation where alternatives exist and deterministic fallback where they do not.
- Regression-test due ordering, interleaving, weak-card reports, and session history.
- User-test labels for comprehension and false-confidence risk.

## Excluded

- Runtime AI grading, universal mastery thresholds, or interview-readiness percentages.
