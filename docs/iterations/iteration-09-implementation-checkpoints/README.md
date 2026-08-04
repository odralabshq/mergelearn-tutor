---
type: plan
title: "Iteration 09: Implementation Checkpoints"
description: "Record external full-solution evidence separately from spaced-repetition cards."
resource: docs/iterations/iteration-09-implementation-checkpoints/README.md
tags: [iteration, interview-prep, implementation, evidence]
timestamp: 2026-08-04
---

# Iteration 09: External Implementation Checkpoints

## Outcome

Users can record whether they implemented a pattern under realistic conditions without pretending MergeLearn executed or verified the code.

## Scope

- Add a manual, self-reported implementation-attempt ledger linked to problem and pattern.
- Record date, language, elapsed time, hints, completion, testing outcome, failure modes, and notes.
- Open the canonical external problem and return to record the result.
- Distinguish unaided, hinted, incomplete, and tested evidence.
- Show evidence history and recency without hard-coded readiness thresholds.
- Trigger checkpoints after initial pattern learning, failed transfer, or deliberate user selection.
- Include checkpoint data in export, backup, and migration.

## Prove it

- Test incomplete attempts, edits, deletes, missing external URLs, and relation changes.
- Verify every UI label says self-reported and never claims code execution.
- Browser-test the outbound-and-return workflow without asserting external-site success.

## Excluded

- In-app compiler, judge, sandbox, LeetCode submission integration, or automatic correctness claims.
