---
type: review
reviewer: "Opus 5 via Kiro, source-grounded by Hermes"
review_cycles: 1
title: "Iteration 08: Card Filter Consistency Review"
description: "Evidence-driven post-delivery audit and narrow API filter correction."
resource: docs/iterations/iteration-08-card-filter-consistency/REVIEW.md
tags: [iteration, cards, filtering, review]
timestamp: 2026-08-06
---

# Iteration 08 Implementation Review

## Reviewed revision

Implementation commit: `80db027681fd2b87caf476f2796490ab490786e3`

The final review covered the exact two-file implementation tree later committed as this revision. The frozen diff contained 56 lines and 3,357 bytes.

## Observed defect

`GET /api/cards?state=` coerced the blank value through `Number('')` to state `0`. A request representing All states therefore returned only New cards. The server-rendered Cards route already accepted a state only when the raw value matched `/^[0-3]$/`.

## TDD evidence

- A public HTTP regression forced one card into Review state.
- Before the fix, unfiltered Cards returned the card while blank `state=` returned zero cards.
- The test failed at the intended public boundary.
- The implementation reused the validated single-digit parser from the server-rendered route.
- After the fix, blank state and absent state returned the same card IDs, while `state=0` remained a real filter.

## Verification evidence

- Final repository gate: 393 tests passed across 42 files.
- TypeScript check, build, packaged smoke, and diff validation passed.
- Packaged smoke checked 155 files.
- Fresh built-artifact Brave QA used a disposable mixed-state library at 375 pixels.
- Populated Home rendered both In progress and Needs attention without horizontal overflow.
- Home View card and lesson actions measured at least 44 pixels high.
- Enhanced Cards moved from 5 of 5 for All states to 2 of 2 for New, then returned to 5 of 5 for All states.
- GET Cards search landed focus on `#card-status` with the result count.
- A folder scope advertised Review 3 now, and the started session contained exactly three planned cards.
- All disposable browser and server ports were closed after QA.

## Opus review

Verdict: `NOT BLOCKED`

Opus confirmed that the raw-string parser fixes the observed blank-value defect while preserving canonical states `0` through `3`. The public HTTP test was judged discriminating and the scope appropriately narrow.

Non-blocking observations were bounded without further mutation:

- Noncanonical numeric spellings such as `01` or `1.0` now degrade to All states. First-party callers emit only canonical values, and this matches the server-rendered route.
- Invalid values continue to degrade to All states. This is preserved behavior, not a regression.
- The test proves `state=0` remains selective but does not include a positive New-card control. Existing search tests and the mixed-state browser journey cover positive New filtering.
- A missing seeded card would produce a less descriptive test failure. This is test ergonomics only.

## Implementation verdict

`NOT BLOCKED`

Iteration 08 is complete at implementation revision `80db027681fd2b87caf476f2796490ab490786e3`. No unresolved finding blocks delivery.
