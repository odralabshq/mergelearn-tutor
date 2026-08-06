---
type: test-design
title: "Iteration 02: Scalable Manage Library Testing"
description: "Behavioral proof for complete paged Manage results."
resource: docs/iterations/iteration-02-scalable-manage-library/TESTING.md
tags: [iteration, manage, testing]
timestamp: 2026-08-04
---

# Iteration 02 Testing: Scalable Manage Library

## Existing coverage and layout

Tests are flat beneath `tests/`, not mirrored from `src/`. Extend `tests/core/library/searchCards.test.ts` for the search and page contract, and `tests/session/server.test.ts` for the served endpoint and Manage markup. `tests/cli/listCardsCompleteness.test.ts` already establishes the machine-readable `cards`, `total`, `returned`, and `truncated` contract; it is a regression control, not the browser API test. `tests/session/practiceAccessibility.test.ts` is not the right location for Manage-specific assertions, so proposed new `tests/session/manageAccessibility.test.ts` holds those checks.

## Behavioral priorities

1. A complete filtered match set has a deterministic order and combines adjacent pages without a duplicate or a gap.
2. Every API response states completeness truthfully, including empty and terminal pages.
3. A changed filter cannot append a late response from the prior filter generation.
4. Manage grouping, filtering, editing, and archive inclusion remain understandable and keyboard-operable.

## Test matrix

| Behavior | Verified path | Required proof |
| --- | --- | --- |
| Paged search | `tests/core/library/searchCards.test.ts` | Seed 0, 1, 100, and 101 cards; combine pages; assert exact ids once, stable ties, exact metadata, and terminal/out-of-range behavior. |
| Combined filters | `tests/core/library/searchCards.test.ts` | Single Set, tag OR, one stored FSRS state, dimension AND, text, and archived controls yield exact ids; malformed state matches no selected state. |
| Snapshot consistency | `tests/core/library/searchCards.test.ts` | A card update, archive, state change, insertion, or removal alters the digest; unchanged results retain it. |
| Stable ordering | `tests/core/library/searchCards.test.ts` | Mixed case, accents, equal prompts, Set ids, and card ids produce one code-unit order independent of locale. |
| HTTP envelope | `tests/session/server.test.ts` | Assert defaults, malformed bounds, beyond-total offset, snapshot match, and exact mismatch 409 body while preserving the existing unpaged control. |
| Manage rendering | `tests/session/server.test.ts` | Served `/manage` contains flat Set-labelled rows, filters, `N of M`, Load more, in-flight and expected-offset guards, and handler markers. |
| Accessibility | proposed new `tests/session/manageAccessibility.test.ts` | Native labels, keyboard-operable controls, live result status, reload prompt, and Load more focus semantics. |
| Mutation reset | `tests/session/server.test.ts` plus browser QA | Edit, archive, and restore preserve filters while the next request starts at zero. |

## Built artifact and browser gate

After `npm run build`, use `dist/libCli.js` with a fresh `mktemp -d /tmp/mlt-...` library. Import a 101-card fixture through supported local APIs, serve it, fetch `/manage` and `/api/cards`, parse every extracted script with `node --check`, and assert the emitted Manage script contains each new handler.

Use a real Chromium-family browser against only that disposable library. Verify the flat Set-labelled list, Load more at 101 cards, filters, archive inclusion, snapshot-change reload prompt, edit retention, keyboard focus, live result status, and existing 28 px actions. Record a known-good unfiltered 101-card control before interpreting a filter failure.
