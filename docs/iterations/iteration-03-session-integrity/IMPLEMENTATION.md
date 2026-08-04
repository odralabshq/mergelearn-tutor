---
type: implementation-design
title: "Iteration 03: Session Integrity Implementation"
description: "Verified-path implementation contract for durable focused sessions."
resource: docs/iterations/iteration-03-session-integrity/IMPLEMENTATION.md
tags: [iteration, session, implementation]
timestamp: 2026-08-05
---

# Iteration 03 Implementation Design

## Change surfaces

Modify existing `src/core/library/types.ts`, `src/core/library/review/session.ts`, `src/session/server.ts`, `tests/core/library/session.test.ts`, `tests/session/server.test.ts`, and `tests/session/practiceAccessibility.test.ts`. `src/session/requeue.ts`, `src/core/library/review/dueQueue.ts`, and `src/core/library/review/interleave.ts` remain policy sources and may be extended only if a focused failing test proves a missing pure helper. No production module, dependency, or storage root is proposed.

## Persistent contract

Add optional versioned plan fields to `ReviewSession`: stable entry ids, selected references, monotonic revision, current entry, first-pass and retry state, unresolved references, separate truthful summary counters, a 512-entry grade ledger, and one pending transition. Add optional `sessionTransitionId` to Card. Store references, not card copies. Legacy sessions remain end-only.

Add a keyed async lock in `server.ts`. Before exposing session mutation routes, acquire a library-local writer claim with exclusive file creation, pid, and instance id. Reclaim only when the recorded pid is dead. Reread and compare the exact instance id immediately before every intent, card, and session write; losing ownership disables mutation routes and returns `session_writer_lost`. Cleanup rereads the claim and removes only its own instance. Tests prove a paused but live owner is never reclaimed and that a replacement claim is never removed by the old owner.

Under the lock, recover pending work, reload the disk session, then check tombstone, existing request id and semantic hash, budget, revision, and entry in that order. A scheduling transition persists its complete intent, revalidates ownership, saves a card carrying the fresh transition id, revalidates again, then finalizes the session. Recovery uses transition identity, with expected pre-`updatedAt` as an unrelated-edit guard, never FSRS equality. All non-session card mutations already replace `updatedAt`; preserve that invariant in tests. Divergence is explicit and non-destructive.

Focused retries and Review revisits record evidence and advance plan state without `gradeCard` or `due`. Each selected card gets at most two evidence revisits. Only the first live scheduling result creates a ReviewEvent; undo removes that result and restores eligibility for one corrected grade. The ledger stores semantic hash, exact success body, and permanent tombstones.

## Practice client contract

`practiceScript()` takes state only from start or `GET /api/session/:id`. It sends `revision` and `entryId`, uses `crypto.randomUUID()` with an opaque fallback, and retains the exact grade payload until confirmed. Network failure offers identical retry. A 409 with authoritative state resynchronizes instead. The browser stores only the unfinished local session id, clears it after confirmed End, and never auto-starts a replacement.

## Implementation sequence

1. Add failing first-pass and retry tests proving one FSRS mutation per distinct card.
2. Add failing replay, semantic-conflict, tombstone, and request-budget tests.
3. Add failing revision/entry and two-tab tests, then add the session-local lock and authoritative reload.
4. Add crash-boundary tests, then implement pending transition recovery for grade and undo.
5. Add start, resume, legacy, unavailable-card, and empty-plan HTTP tests.
6. Replace the independent browser queue with server state, explicit retry/resync, and always-available End.
7. Add accessibility assertions and complete built-artifact, browser, and full regression gates.

No automatic client mutation replay, global serialization queue, external ledger, adaptive scheduler, or runtime dependency belongs in this iteration. The monotonic revision is session-local fencing, not a repository-wide revision system.
