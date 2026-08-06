---
type: implementation-design
title: "Iteration 02: Scalable Manage Library Implementation"
description: "Verified-path implementation contract for scalable Manage."
resource: docs/iterations/iteration-02-scalable-manage-library/IMPLEMENTATION.md
tags: [iteration, manage, implementation]
timestamp: 2026-08-04
---

# Iteration 02 Implementation Design

## Change surfaces

Modify existing `src/core/library/searchCards.ts`, `src/session/server.ts`, `tests/core/library/searchCards.test.ts`, and `tests/session/server.test.ts`. Create proposed new `tests/session/manageAccessibility.test.ts`. No production source module is proposed beyond the existing search and server surfaces. `src/core/library/cardLifecycle.ts`, `src/core/library/mastery.ts`, and `src/libCli.ts` remain compatibility surfaces: preserve their behavior unless a focused regression proves a required contract adjustment.

## Search and API contract

Add typed page options and result in `searchCards.ts`. Collect and deterministically sort all filtered hits, compute a stable snapshot digest over each ordered hit's identity, `updatedAt`, status, and stored FSRS state, then slice. Return exact `total`, `returned`, `hasMore`, and terminal `nextOffset` semantics from `DESIGN.md`. Keep the existing array function and CLI `limit: 0` behavior unchanged; the new paged function is the browser contract.

Learning-state filtering maps only stored states 0 through 3 from `types.ts:99-110`; malformed missing/out-of-range values match no selected state, and due dates are excluded. Use a small code-unit comparator rather than `localeCompare`. `cardsApi` parses repeated tags, one state, one Set, archive, offset, limit, and optional snapshot. It applies browser bounds uniformly. A stale snapshot returns HTTP 409 with `{ ok: false, code: "snapshot_mismatch", snapshot, total }`, never a shifted page.

## Manage client contract

`renderManage` emits Set and tag metadata for controls. `manageScript()` owns filter state, generation, expected offset, first-page snapshot, and one in-flight flag. It renders one flat API-ordered list whose rows name their Set. Explicit Load more is disabled in flight. Responses append only when generation, offset, and snapshot match; 409 or mismatch shows a reload prompt.

Existing action delegation stays in `#card-results`. Successful actions preserve filters, bump generation, clear rows, and load offset zero. Validation failure does not refetch. Declare every new client variable, avoid literal backticks, and parse the built emitted script because `manageScript()` is opaque to TypeScript.

## Implementation sequence

1. Add one failing core page-boundary test at 101 cards, then implement the smallest stable page envelope.
2. Add one failing HTTP metadata test, then wire validated query parsing through `cardsApi`.
3. Add one failing served-Manage behavior test, then add flat Set-labelled rows, `N of M`, and Load more.
4. Add failing snapshot, duplicate-click, stale-generation, and unexpected-offset tests, then add guards and filter state.
5. Add the accessibility test, then finish native labels, live status, keyboard paths, and focus behavior.

No global write queue, revisions store, learning entity, index, cache, virtualization, or dependency belongs in this iteration.
