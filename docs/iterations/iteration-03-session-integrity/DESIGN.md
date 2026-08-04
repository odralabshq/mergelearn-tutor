---
type: design
title: "Iteration 03: Session Integrity"
description: "Target design for focused, restart-safe, idempotent practice sessions."
resource: docs/iterations/iteration-03-session-integrity/DESIGN.md
tags: [iteration, session, design]
timestamp: 2026-08-05
---

# Iteration 03 Design: Session Integrity

## Status and grounding

This is the target design. `src/core/library/review/session.ts:20-123` creates, grades, persists, and ends sessions. `src/session/server.ts:325-432` persists after start and grade, reloads a session after restart, but has no queue contract or replay protection. `practiceScript()` at lines 1084-1334 independently fetches cards, advances its own cursor, and schedules Again revisits locally.

## Decisions

- D1: Extend `ReviewSession`; do not add a global queue, database, or learner entity. New planned sessions persist a versioned plan with stable entry ids, ordered card references, a strictly monotonic revision, current entry id, first-pass state, bounded retry state, unresolved references, and a fixed grade-request budget.
- D2: Session start owns selection. `Review due` uses the current due-selection and interleaving path once. `Study once` and `Retry missed` use the chosen active-card scope in authored order. The response returns the persisted plan and current entry, so Practice never fetches an independent queue.
- D3: First-pass grading schedules each distinct card at most once. `Study once` stops after that pass. `Retry missed` adds only cards graded Again to bounded retry rounds; retry outcomes are session evidence and never call FSRS. Review due keeps the existing bounded Again revisit policy, but a revisited card is evidence-only because its first accepted grade already supplied the session's one scheduling result.
- D4: Each grade request carries `requestId`, `revision`, and `entryId`. Semantic identity is the canonical tuple `{ setId, cardId, rating, revision, entryId }`; confidence and attempt evidence are stored with the first request but cannot change on replay. Under lock, processing order is tombstone, existing request id and semantic hash, request budget, then revision and entry admission. Exact replay returns the stored response with `replayed: true`; differing reuse returns 409 `request_id_conflict`.
- D5: A session-local async lock serializes transitions, and a dedicated writer claim created with exclusive file creation prevents two server processes from mutating sessions for one library. The claim contains pid and instance id. A claim is stale only when its recorded pid is no longer alive, never merely because a health probe times out. Immediately before every intent, card, or session write, the server rereads the claim and requires its exact instance id; mismatch returns `session_writer_lost`, disables mutation routes for that server, and writes nothing. Owner-only cleanup cannot remove a replacement claim.
- D6: Add optional `sessionTransitionId` to Card. Session grade and undo assign a fresh transition id to their post-card image. A pending session transition records before and after ids, exact card versions, event, response, and plan states. Recovery classifies by transition id, with `updatedAt` guarding the before image against an unrelated edit: before id plus expected version applies the stored post image then finalizes; after id finalizes; any other state is 409 `transition_diverged`. Every non-session card write changes `updatedAt`; no write path may preserve it. FSRS is never recomputed during recovery.
- D7: Undo of the latest live scheduled grade uses the same lock and transition protocol. It restores card, event, summary, plan, and that card's scheduling eligibility, advances revision, and permanently tombstones the original request id. Bounds are evaluated over live entries after undo, so reverted retry entries do not falsely exhaust the card bound. A corrected grade uses a new request id and slot and can schedule the restored current entry once. Tombstoned replay returns 409 `request_undone`.
- D8: The grade ledger has a fixed 512-request budget and initial selection is capped at 128 distinct cards, reserving at least 384 slots for corrected grades. Only first-seen grade requests consume slots. At capacity, new grades fail with 409 `request_budget_exhausted`; replay, automatic unresolved skip, undo, and End remain available. No user Skip action is added. Each card has at most two live evidence-only revisits, so a plan has at most three live entries per selected card.
- D9: Scheduled and evidence-only responses are distinct. A scheduled result includes `due`; evidence-only results omit it. Summary reports `scheduledResults`, `evidenceAttempts`, `firstPass`, `retried`, and `unresolved` separately, so session completion never implies mastery.
- D10: Legacy sessions without a plan are readable and endable but not gradable or resumable into planned mode. `GET /api/session/:id` returns mode, revision, current entry, summary, unresolved count, and ended state. The session id is sufficient authorization for this local single-user server.
- D11: The client retains one request id and the complete original body until confirmed. Unknown transport outcome offers only verbatim replay, including the original revision and entry id; it never rebuilds the request from resynchronized state. Conflict responses resynchronize instead. Reload resumes only an explicitly stored unfinished session id, and End remains available.

## Acceptance criteria

1. Each distinct card receives at most one FSRS mutation in a planned session; focused retries and Review revisits are evidence-only.
2. Lost-response replay, two tabs, process restart at every write boundary, and undo cannot duplicate or resurrect a scheduling mutation.
3. Planned sessions never admit an unplanned or stale entry and never exceed fixed first-pass, retry, revisit, event, or request bounds.
4. Reload, archive, malformed legacy session, empty scope, and unavailable-card paths report truthful authoritative state.
5. No adaptive mode, unbounded grinding, multi-device sync, Perfect/Mastered label, aggregate score, global queue, or dependency is added.
