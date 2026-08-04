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

Add optional versioned plan fields to `ReviewSession`: stable entry ids, selected references, monotonic revision, current entry, first-pass and retry state, unresolved references, separate truthful summary counters, a 512-entry grade ledger, terminal reason, and one pending transition. New ReviewEvents carry session id/mode, scheduled-or-evidence class, entry id, and request id; scheduling snapshots are optional only for evidence events. Store plan references, not card copies. Legacy sessions remain end-only.

Add a keyed async lock in `server.ts`. Before exposing session mutation routes, acquire a library-local writer claim with exclusive file creation, host id, pid, process-start marker, and instance id. On the same host, reclaim only when the pid is dead or its independently observed start marker differs; refuse automatic reclaim across hosts or when identity cannot be verified. Reread and compare the exact instance id immediately before every intent, card, and session write; losing ownership disables mutation routes and returns `session_writer_lost`. Cleanup rereads the claim and removes only its own instance. Process-identity and host seams are injected for deterministic tests.

Under the lock, every mutation route recovers pending work before admission, reloads the disk session, then checks tombstone, existing request id and semantic hash, budget, revision, and entry in that order. A transition first atomically persists complete before/after card images plus intent, revalidates ownership, saves the exact post image with a fresh `updatedAt`, revalidates again, then performs one atomic session write that applies event, ledger, summary, and plan changes while clearing `pendingTransition`. Recovery follows the same finalization path. Exact before applies the stored post image; exact after finalizes. Any other image uses one atomic session write to clear the pending transition and store `transition_diverged` for that request without touching the Card, event list, or plan. Admission then continues from authoritative state; End and budget termination remain reachable. Undo also creates a fresh post-card `updatedAt`, never restores the historical value.

Focused retries and Review revisits record evidence and advance plan state without `gradeCard` or `due`. Each selected card gets at most two evidence revisits. Scheduled and evidence records carry explicit result class and request identity. Undo removes the live scheduled event, restores eligibility, and leaves a permanent request tombstone in the ledger. Tombstone lookup returns `request_undone` plus current authoritative state instead of replaying the stored pre-undo success. At request capacity, persist a terminal exhausted state and summary before returning 409.

Events remain authoritative for completion and attempt evidence. Abandonment never fabricates an event even if the unknowable original Card write landed, so Card scheduling may lead events by at most one abandoned transition. Before a fresh request for the unchanged entry, reload the Card and revalidate Set/card identity, active status, and entry admission; a removed or invalidated Card becomes an explicit unresolved result rather than a loop.

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
