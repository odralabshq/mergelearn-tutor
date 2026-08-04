---
type: review
reviewer: "Opus 5 via Kiro, source-grounded by Hermes"
review_cycles: 3
title: "Iteration 03: Session Integrity Review"
description: "Independent review record and source-grounded adjudication."
resource: docs/iterations/iteration-03-session-integrity/REVIEW.md
tags: [iteration, session, review]
timestamp: 2026-08-05
---

# Iteration 03 Design Review

## Review boundary

This package is design-only. It covers selected-card sessions, bounded revisits, restart recovery, and idempotent grade mutations. It must not create a global write queue, store revisions, new learning entities, adaptive modes, a ledger subsystem, multi-device sync, aggregate score, or runtime dependency.

## Independent review request

The required Opus 5 review receives a bounded, tool-free numbered brief based on this package. Every numbered recommendation is recorded below as adopted, modified, deferred, or rejected with a source-grounded reason. At most three review cycles are permitted.

## Initial source checks

- `session.ts:45-79` calls `gradeCard` for every request and has no request identity or plan admission rule.
- `server.ts:347-385` persists a start and each grade, reloads a session after restart, but accepts any active card.
- `server.ts:1088-1333` owns an independent browser queue, cursor, and Again insertion after server grading.
- `requeue.ts:1-20` already defines the pure three-card gap and two-revisit bound.
- `io.ts:17-24` provides same-directory temporary write plus atomic rename.

## Review criteria

The reviewer must challenge idempotency semantics for lost responses and conflicting reuse, plan immutability under two tabs or card mutations, exact undo interaction, session-file compatibility and ledger bounds, client recovery clarity, browser accessibility, and whether the proposal wrongly duplicates current due scheduling or adds infrastructure.

## Adjudication ledger: Opus cycle 1

The first review is `/tmp/mergelearn-iteration-03-opus-review-cycle-1.md`. It returned BLOCKED on replay, fencing, and legacy-session contracts. All eleven findings are accounted for below.

- R1 adopted: array cursor is replaced as the admission fence by monotonic session revision plus stable entry id.
- R2 adopted: undo permanently tombstones the original grade request id; retry returns `request_undone` and never re-executes.
- R3 adopted with a stricter rule: semantic identity is `{ setId, cardId, rating, revision, entryId }`. Confidence and attempt evidence from the original request are persisted and cannot be replaced on replay.
- R4 adopted: the grade ledger stores the exact original response. Replay returns it with `replayed: true`; the client resynchronizes from authoritative session state.
- R5 adopted: legacy sessions without a plan are end-only. They remain readable and are never silently upgraded.
- R6 adopted: `GET /api/session/:id` is the explicit local resume contract. The session id is sufficient for the local single-user server.
- R7 adopted: the grade-request budget is independent of event count and fixed at 512.
- R8 adopted: only a first-seen grade consumes budget. Replay, automatic unresolved skip, undo, and End remain available.
- R9 adopted by pruning: no user Skip action is added. Only automatic unavailable-card traversal is persisted.
- R10 adopted: stale and conflicting responses include authoritative revision, entry, and summary for deterministic resynchronization.
- R11 modified: one atomic rename cannot cover separate card and session files. The revised design uses a session-local lock and a persisted write-ahead transition containing exact pre/post snapshots. Recovery completes or rejects the prepared transition without recomputing FSRS.

## Additional source-grounded correction

The initial draft reused Review Again as another scheduling mutation. That conflicts with this iteration's established invariant and the proven immediate-grading interval inflation. The revised design schedules each distinct card at most once. Focused retries and same-session Review revisits are bounded evidence-only attempts.

## Adjudication ledger: Opus cycle 2

The second review is `/tmp/mergelearn-iteration-03-opus-review-cycle-2.md`. It remained BLOCKED and identified seven necessary contracts.

- R12 adopted: optional card `sessionTransitionId`, not FSRS equality, classifies pending grade and undo recovery. Expected pre-`updatedAt` also prevents overwriting an unrelated edit.
- R13 adopted through the same transition identity protocol for undo.
- R14 adopted: request handling order is tombstone, existing id/hash, budget, then revision and entry admission.
- R15 adopted: undo restores live scheduling eligibility; a corrected grade needs a fresh request id and ledger slot.
- R16 adopted: each selected card receives at most two evidence-only revisits, matching the existing `MAX_REQUEUE` bound.
- R17 adopted: scheduled responses alone include `due`; summaries separate scheduling results, evidence attempts, first pass, retried cards, and unresolved cards.
- R18 adopted with existing architecture: a dedicated advisory writer claim uses exclusive creation and the established pid/instance ownership pattern. It covers direct and managed servers without introducing a database or global queue.

## Adjudication ledger: Opus cycle 3

The final iteration-specific review is `/tmp/mergelearn-iteration-03-opus-review-cycle-3.md`. It returned BLOCKED on one remaining ownership fence and identified five closure requirements.

- R19 adopted: exact writer-claim instance ownership is revalidated immediately before every intent, card, and session write. Claim mismatch disables mutations and writes nothing.
- R20 adopted: retry bounds are computed over live entries after undo.
- R21 adopted: initial selection is capped at 128 against the 512-request ledger, leaving explicit correction headroom while preserving truthful exhaustion and End behavior.
- R22 adopted: unknown requests are retried verbatim with their original revision and entry id.
- R23 adopted: all non-session card writes must change `updatedAt`; tests protect this recovery prerequisite.

No fourth iteration-specific review is run because the process caps reviews at three cycles. These exact closure changes remain subject to the later cross-design Opus review before implementation begins. Iteration 03 is therefore design-complete but not implementation-approved until that cross-review returns NOT BLOCKED.
