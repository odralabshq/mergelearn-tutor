---
type: plan
title: "Iteration 02: Scalable Manage Library"
description: "Make all cards discoverable and manageable as the library grows."
resource: docs/iterations/iteration-02-scalable-manage-library/README.md
tags: [iteration, manage, search, pagination]
timestamp: 2026-08-04
---

# Iteration 02: Complete and Scalable Manage Library

## Outcome

Manage shows complete, understandable results for libraries with hundreds or thousands of cards without silently truncating data.

## Scope

- Add API completeness metadata: total, returned, hasMore, and nextOffset.
- Add deterministic pagination with an initial Load more interaction.
- Group the default card view by collapsed Set rows with counts.
- Add an All sets selector, full-library search, archive toggle, and active filter chips.
- Keep search results flat and label each result with its Set.
- Use tags and learning state as filters, not duplicate-producing groups.
- Show explicit `N of M` result status and preserve filters during edits.

## Prove it

- Test boundaries at 0, 1, 100, 101, and large synthetic libraries.
- Verify no duplicates or missing cards across pages and combined filters.
- Browser-test expansion, search, pagination, editing, archive state, and accessibility.
- Record render and API timings to catch regressions without inventing premature limits.

## Excluded

- Virtualization, infinite scrolling, nested decks, saved searches, or a query language.
