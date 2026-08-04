---
type: plan
title: "Iteration 04: Session Continuity"
description: "Resume unfinished work and make uncertain mutations safe to retry."
resource: docs/iterations/iteration-04-session-continuity/README.md
tags: [iteration, sessions, idempotency, recovery]
timestamp: 2026-08-04
---

# Iteration 04: Session Continuity and Mutation Safety

## Outcome

Interrupted sessions resume predictably, and network uncertainty cannot duplicate grades or edits.

## Scope

- Detect unfinished persisted sessions and offer Resume or Start over.
- Restore card position, attempt state, focused-practice mode, and unresolved queue.
- Add client-generated request IDs to grading and other critical mutations.
- Persist deduplication records so retries return the original result safely.
- Distinguish confirmed failure, confirmed success, and unknown outcome in the UI.
- Reconcile browser drafts with persisted server state after restart.
- Document conflict behavior when a card or session changed elsewhere.

## Prove it

- Interrupt before send, during send, after persistence, and before response delivery.
- Verify duplicate request IDs never create duplicate FSRS history or edits.
- Test resume and start-over behavior across server restart and page reload.
- Browser-test all recovery choices and stale-state messages.

## Excluded

- Multi-user synchronization, cloud backup, cross-device sessions, or collaborative editing.
