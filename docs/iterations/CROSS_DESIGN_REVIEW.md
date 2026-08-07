---
type: review
reviewer: "Opus 5 via Kiro, adjudicated by Hermes"
review_cycles: 4
title: "Iteration Program Cross-Design Review"
description: "Independent implementation gate across all six iteration packages."
resource: docs/iterations/CROSS_DESIGN_REVIEW.md
tags: [iterations, review, implementation-gate]
timestamp: 2026-08-05
---

# Cross-Design Review

## Gate boundary

This review checks the six approved iteration packages as one system before implementation. It covers ownership, retry, event liveness, evidence projection, migration compatibility, feature dependencies, and unnecessary complexity. The first Opus review is `/tmp/mergelearn-cross-design-opus-review-cycle-1.md`.

## Cycle 1 verdict

BLOCKED. All eleven findings are adjudicated below.

- C1 confirmed: process connection state, pagination, session mutation ownership, projections, and author imports own distinct boundaries.
- C2 confirmed: non-session writes advance `updatedAt`; session recovery compares exact stored images including that field.
- C3 adopted: planned ReviewEvents now carry session mode, scheduled-or-evidence class, entry id, and request id. Undo removes the live event and retains only the request tombstone.
- C4 adopted: Iteration 04 counts only live scheduled lesson events. Evidence-only and non-lesson events never raise completion. Legacy lesson events remain migration-free because legacy undo removes events physically.
- C5 modified: writer claims add host id and a process-start marker. Same-host dead or recycled processes may be reclaimed. Foreign-host or unverifiable claims fail closed with recovery guidance. Health timeout never proves staleness.
- C6 adopted: request-budget exhaustion atomically ends the session with a truthful terminal reason and summary rather than stranding an unfinished plan.
- C7 adopted: Iterations 01 and 03 share one user-initiated, byte-identical pending-payload behavior. Manage draft fencing remains because it protects unsent text, while Iteration 02 snapshots protect paged reads.
- C8 confirmed after C3 and C4: spacing changes scheduling order only, while undo affects completion solely by removing the live event.
- C9 adopted: Strengthen membership remains evidence-backed, but ordering uses stored FSRS lapses and stable ids, never a composite readiness score.
- C10 partly adopted: `sessionTransitionId`, URL-query advisory, and list/company filters are removed. Manage draft fencing is retained because it is not redundant with pagination. Exact before/after transition images remain necessary for crash classification.
- C11 adopted: implementation order remains 01, 02, 03, 04, 05, 06, with independent tests, browser verification, review, commit, and push per iteration.

## Clearance requirement

## Cycle 2 verdict

The focused review is `/tmp/mergelearn-cross-design-opus-review-cycle-2.md`. It remained BLOCKED on one token-free recovery race. All eight findings are accounted for below.

- C12 confirmed: live-event and tombstone semantics prevent replay from restoring completion evidence. Tombstoned replay is clarified to return `request_undone` with current state.
- C13 adopted: every mutation resolves pending work under lock before admission. Finalization atomically applies event, ledger, summary, and plan changes while clearing the transition. Undo writes a fresh Card `updatedAt`, so it cannot recreate a prior before image.
- C14 confirmed after C13: unrelated writes diverge because exact images include fresh `updatedAt`.
- C15 confirmed: host, pid, process-start, instance, and reread rules fail closed without two-writer admission.
- C16 confirmed: terminal budget exhaustion leaves truthful replayable state.
- C17 confirmed: pending-payload fences compose with explicit idempotent replay.
- C18 confirmed: pruning leaves no orphan behavior. `weakScore` remains internal weak-membership evidence and is not a Prepare ordering or UI contract.
- C19 confirmed: remaining bounded mechanisms are proportionate to demonstrated defects.

## Clearance requirement

## Cycle 3 verdict

The review is `/tmp/mergelearn-cross-design-opus-review-cycle-3.md`. It remained BLOCKED on one recovery-liveness clause. All twelve findings are accounted for below.

- C20 through C26 confirmed: atomic finalization, lock-first recovery, exact-image protection, tombstoned replay, completion projection, and writer identity are coherent.
- C27 and C28 adopted: exact-image divergence now atomically abandons the pending transition, leaves Card/event/plan state untouched, records a durable divergent request outcome, and keeps End plus later admission reachable.
- C29 confirmed after abandonment: terminal exhaustion remains reachable.
- C30 confirmed: the ordinary cross-session edit case now fails closed without permanently wedging the original session.
- C31 confirmed: the remaining mechanisms are proportionate.
- C32 adopted: only Iteration 03 recovery and tests change.

## Clearance requirement

One final review is limited to divergence abandonment and liveness. Implementation remains blocked until it returns NOT BLOCKED.

## Cycle 4 verdict

The narrow review is `/tmp/mergelearn-cross-design-opus-review-cycle-4.md`. It returned NOT BLOCKED. All seven findings are accounted for below.

- C33 confirmed: abandonment is idempotent before and after its atomic session write.
- C34 adopted as a test invariant: fresh `updatedAt` makes divergence monotonic, so later recovery cannot drift back into an exact-image match.
- C35 adopted: events are authoritative for completion and evidence. Card scheduling may lead events by at most one unknowable abandoned write; no reconciliation event is invented.
- C36 confirmed: clearing stored images and retaining a durable divergent request outcome prevents reapplication.
- C37 adopted: fresh admission reloads and validates Card existence, Set identity, active status, and entry identity, so external deletion or invalidation fails cleanly.
- C38 confirmed: End and terminal budget handling remain reachable.
- C39 confirmed: no reconciliation queue, repair pass, quarantine state, or Card/event diff is justified.

## Final verdict

NOT BLOCKED. All six packages are approved for sequential implementation in order 01 through 06. Each iteration still requires targeted tests, full regression checks, built-artifact and browser verification, independent Opus code review, a separate commit, and remote push verification before the next begins.
