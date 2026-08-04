---
type: design
title: "Iteration 02: Scalable Manage Library"
description: "Target design for complete, paged Manage results."
resource: docs/iterations/iteration-02-scalable-manage-library/DESIGN.md
tags: [iteration, manage, design]
timestamp: 2026-08-04
---

# Iteration 02 Design: Scalable Manage Library

## Status and grounding

This is the target design. The current Manage route is `src/session/server.ts:725-837`; it fetches `/api/cards`, whose `cardsApi` at lines 240-247 defaults to the shared search cap of 100 and returns only `{ ok, cards }`. `src/core/library/searchCards.ts:25-54` scans, filters, sorts only by title and prompt, then slices. The complete CLI envelope in `src/libCli.ts:259-289` proves the metadata pattern without providing browser pagination.

## Decisions

- D1: Keep one filtering and ordering implementation in `src/core/library/searchCards.ts`. Add a paged function over that shared collector while preserving the existing array-returning `searchCards` contract for CLI and core callers. These are deliberate complete-list and paged-browser interfaces, not temporary response variants. Do not add an index, cache, database, or runtime dependency.
- D2: `/api/cards` returns `{ ok, cards, total, returned, hasMore, nextOffset, snapshot }`. `total` is the filtered count before slicing; `returned` is the slice length; `hasMore` is `offset + returned < total`; `nextOffset` is `offset + returned` only when `hasMore`, otherwise absent.
- D3: Browser pagination defaults to 100 and clamps integer limits to 1 through 100. Missing, non-integer, zero, or negative limits use 100. Missing, non-integer, or negative offsets use zero. An offset beyond `total` returns no cards, unchanged `total`, `hasMore: false`, and no `nextOffset`. Existing array callers and CLI `limit: 0` completeness behavior remain unchanged.
- D4: Search evaluates all matches before slicing and sorts by set title, prompt, set id, then card id using deterministic Unicode code-unit comparison, not locale-dependent comparison. The response `snapshot` is a stable digest of the total plus every ordered match's card identity, `updatedAt`, status, and complete FSRS state. Load-more requests send the first page's snapshot. A mismatch returns HTTP 409 with `{ ok: false, code: "snapshot_mismatch", snapshot, total }`; the client offers reload and appends nothing.
- D5: Learning state is exactly the stored `Card.fsrs.state`: `0 New`, `1 Learning`, `2 Review`, `3 Relearning`. Valid imported cards always have this required field. A malformed legacy card with a missing or out-of-range state remains visible when no state filter is active but matches no selected state; `doctor` remains the repair path. These values are not due/overdue filters and are not time-relative.
- D6: Manage uses one flat, Set-labelled list for empty and nonempty search. Add one single-select Set control defaulting to All sets, tag multi-select, one learning-state selector defaulting to All states, archive inclusion defaulting off, `N of M`, and explicit Load more. Tags are ORed; Set, selected state, and tag dimension are ANDed. Archive inclusion is a boolean visibility option, not a filter dimension. Set grouping and removable chips are deferred.
- D7: Changing a filter or completing a mutation increments a generation, clears rows, and reloads offset zero while preserving filter values. One in-flight guard prevents duplicate Load more requests; each response must match generation, expected offset, and snapshot before append.

## Acceptance criteria

1. The UI always says `N of M`, including zero, and Load more appears only when `hasMore` is true.
2. Libraries of 0, 1, 100, and 101 cards expose every unchanged matching card exactly once across combined pages.
3. Set, tags, stored FSRS state, archive inclusion, and text compose predictably; every row names its Set.
4. A changed snapshot, duplicate click, stale generation, or unexpected offset never appends a page.
5. Existing edit/archive concurrency contracts remain intact and reset only the result cursor.
6. No grouping, chips, virtualization, infinite scroll, saved search, query language, index, or aggregate score is added.
