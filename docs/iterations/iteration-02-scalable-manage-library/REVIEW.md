---
type: review
reviewer: "Opus 5 via Kiro, source-grounded by Hermes"
review_cycles: 2
title: "Iteration 02: Scalable Manage Library Review"
description: "Independent review record and source-grounded adjudication."
resource: docs/iterations/iteration-02-scalable-manage-library/REVIEW.md
tags: [iteration, manage, review]
timestamp: 2026-08-04
---

# Iteration 02 Design Review

## Review boundary

This package is design-only. It covers truthful Manage completeness, deterministic pagination, filtering, grouping, and accessibility. It must not implement a database, an in-memory index, virtualization, infinite scrolling, saved searches, a query language, new learner entities, or any deferred graph, catalog, ledger, or readiness feature.

## Independent review request

The required Opus 5 review receives a bounded, tool-free numbered brief based on this package. Every numbered recommendation is recorded below as adopted, modified, deferred, or rejected with a source-grounded reason. At most three review cycles are permitted.

## Initial source checks

- `searchCards.ts:25-54` scans all sets and cards, filters tags as OR, defaults to a 100-card cap, and sorts only by visible strings.
- `server.ts:240-247` clamps `/api/cards` to 1 through 500 and emits no completeness metadata.
- `server.ts:725-837` renders Manage with search and archive inclusion but no selector, paged state, grouping, or Manage filters.
- `cardLifecycle.ts:60-82` preserves FSRS during an edit, while lines 26-45 archive and restore reversibly with `updatedAt` checks.
- `libCli.ts:259-289` already proves why a bare card array cannot signal completeness.

## Review criteria

The reviewer must challenge pagination correctness under equal visible sort keys and filter changes, metadata semantics at boundaries, archive and FSRS-state interactions, client stale-response handling, UI accessibility, and whether the design accidentally duplicates the CLI or adds premature infrastructure.

## Adjudication ledger: Opus cycle 1

The first review is `/tmp/mergelearn-iteration-02-opus-review-cycle-1.md`. It returned BLOCKED on underspecified contracts, not architecture. The revised package resolves the blockers as follows.

- R1 adopted: learning state is exactly stored `Card.fsrs.state` values 0 through 3; new cards are state 0.
- R2 adopted: due and overdue are excluded, so state filtering is not time-relative.
- R3 adopted: `nextOffset` is `offset + returned` only while `hasMore`; terminal responses omit it.
- R4 adopted: browser defaults and malformed, negative, zero, non-integer, and beyond-total pagination behavior are specified exactly.
- R5 adopted: a stable digest over every ordered match detects changed cards, additions, removals, archives, and FSRS-state changes between pages. Snapshot mismatch returns 409 and never appends.
- R6 modified: the existing complete-list function and new paged function share collection and ordering but remain deliberate interfaces. The CLI contract does not migrate to browser pagination.
- R7 adopted by pruning: Set grouping is removed, so no partial group count can mislead.
- R8 adopted: one in-flight guard plus generation, expected-offset, and snapshot checks prevent duplicate or stale appends.
- R9 adopted: Set grouping is deferred.
- R10 adopted: removable chips are deferred.
- R11 modified: the redundant 250-card boundary is removed, but built-script parsing remains required because the inline Manage client is opaque to TypeScript.
- R12 adopted: tags remain multi-select; learning state is one selector, reducing the combination surface.
- R13 adopted through R1 and R2.
- R14 adopted through the exact D2 and D3 envelope contract.
- R15 adopted through the D4 snapshot contract.
- R16 adopted through the D7 append guards.
- R17 adopted: grouping and chips are cut.
- R18 adopted: existing array callers, CLI `limit: 0`, and CLI metadata remain unchanged.

## Adjudication ledger: Opus cycle 2

The focused review is `/tmp/mergelearn-iteration-02-opus-review-cycle-2.md`. It returned NOT BLOCKED. Its seven findings are accounted for below.

- R19 adopted: malformed missing or out-of-range FSRS state remains visible without a state filter but matches no selected state. Imported cards continue requiring valid FSRS.
- R20 adopted: snapshot mismatch has exact HTTP 409 body `{ ok: false, code: "snapshot_mismatch", snapshot, total }`.
- R21 adopted: ordering uses deterministic Unicode code-unit comparison rather than locale-dependent collation.
- R22 adopted: Set is single-select defaulting to All, state defaults to All, archive inclusion defaults off and is a boolean visibility option.
- R23 adopted: snapshot composition is sufficient; total is included in the digest as cheap explicit coverage.
- R24 adopted: real browser QA remains the final gate after deterministic tests, not a prerequisite for landing each TDD slice.
- R25 confirmed: all cycle 1 blockers are resolved.

## Final verdict

Opus 5 returned NOT BLOCKED after two cycles. The design is ready for implementation after all six iteration packages and the cross-design review pass.

## Implementation review

The implementation review inspected the approved package, the uncommitted source and tests, and the built browser behavior. The repository-inspection session exhausted its turns before returning a verdict, but identified one concrete regression: successful Manage mutations had lost their accessible success announcement. That finding was accepted. The implementation now reports `Saved. N of M` or `Card updated. N of M` after the required offset-zero reset.

The final bounded Opus 5 adjudication used the post-fix contract, implementation summary, and real verification evidence. Its verdict was `NOT BLOCKED`, with no correctness findings and no unnecessary scope.

### Final adjudication

- I1 accepted: restore mutation success announcements while retaining truthful count metadata. A built Brave run observed `Card updated. 25 of 25` after archive and cursor reset.
- I2 accepted: add an explicit nonnumeric offset and limit endpoint assertion. Negative, zero, noninteger, and beyond-total cases were already covered.
- I3 confirmed by source: edit success calls `discardManageDraft(row)` only for the mutated row. Archive and restore do not delete drafts, and namespaced keys protect unrelated rows.
- I4 confirmed by source: `finally` always clears `inFlight`, re-enables Load more, and drains one queued reload even after rejection or an early stale-response return.
- I5 rejected as a defect: a snapshot mismatch deliberately replaces the stale count with `Library changed. Reload results before continuing.` and focuses the visible recovery action. The 409 body carries the new total, but the client does not present a fresh count until it reloads the matching rows.
- I6 rejected as stated: disabling an activated Load more button does not move focus to the document body. The same button is re-enabled in `finally`; successful append moves focus to the first new row, and mismatch moves focus to Reload results.
- I7 confirmed complete: the post-fix release gate passed 272 tests across 40 files, typecheck, build, and packaged smoke over 145 files.

### Browser evidence

The final fresh-profile Brave CDP run used a supported 101-card disposable library. It verified 100 then 101 exact paging, one request for a double Load more activation, first-appended-row focus, a real external-edit snapshot 409 with no shifted append and Reload focus, Set and repeated-tag filtering, browser-local draft restoration across filter resets, mutation cursor reset with filters preserved, and accessible mutation success feedback.

## Implementation verdict

`NOT BLOCKED`. Iteration 02 is ready to commit and push.
