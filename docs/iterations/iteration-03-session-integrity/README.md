---
type: plan
title: "Iteration 03: Session Integrity"
description: "Add focused practice and interruption recovery around one scheduling invariant."
resource: docs/iterations/iteration-03-session-integrity/README.md
tags: [iteration, practice, sessions, idempotency, fsrs]
timestamp: 2026-08-04
---

# Iteration 03: Session Integrity

## Outcome

Users can study selected cards once or retry misses, resume interruptions, and safely retry uncertain requests without duplicate scheduling changes.

## Scope

- Separate selected card scope from `Study once`, `Retry missed`, and `Review due` goals.
- Bound retry rounds and exposures, prevent immediate repeats, and always allow End session.
- Apply at most one FSRS scheduling result per card in a focused session.
- Add client request IDs and persisted server deduplication for grade mutations.
- Resume unfinished sessions with card position, queue, attempts, and unresolved cards.
- Distinguish confirmed success, confirmed failure, and unknown request outcome.
- Add completion summaries for first-pass, retried, and unresolved cards.

## Prove it

- Test queue bounds, termination, one scheduling mutation, and request replay.
- Interrupt before send, after persistence, and before response delivery.
- Verify resume and start-over behavior after reload and server restart.
- Browser-test mode choice, early exit, empty scopes, reconnect, and two tabs.

## Excluded

- Unbounded grinding, adaptive modes, Perfect or Mastered labels, and multi-device sync.
