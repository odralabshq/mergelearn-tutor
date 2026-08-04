---
type: test-design
title: "Iteration 04: Completion and Spacing Quality Testing"
description: "Behavioral proof for honest completion and stable sibling spacing."
resource: docs/iterations/iteration-04-completion-spacing/TESTING.md
tags: [iteration, completion, spacing, testing]
timestamp: 2026-08-05
---

# Iteration 04 Testing: Completion and Spacing Quality

## Existing coverage and layout

Extend `tests/core/library/sessionHistory.test.ts`, `interleave.test.ts`, `importAgentSet.test.ts`, and `tests/session/server.test.ts`. Existing weak-card tests remain regression controls because they already distinguish deterministic failure from absent qualitative correctness. No new test directory or browser framework is required.

## Test matrix

| Behavior | Verified path | Required proof |
| --- | --- | --- |
| Event classification | `sessionHistory.test.ts` | `correct: true` plus non-Again or missing rating is deterministic; false plus Easy still fails; true plus Again fails; absent correctness plus rating 2 through 4 is self-assessed; absent correctness plus missing rating fails. |
| Legacy and re-import | `sessionHistory.test.ts` | Rating-only history remains self-assessed even when the current card is deterministic; current interaction never rewrites old evidence. |
| Mixed lesson | `sessionHistory.test.ts` | Lesson-only events expose exact disjoint passed, deterministic, self-assessed, total, state, and resume target; one card with both pass classes counts once at deterministic; Review queue events do not count. |
| Current denominator | `sessionHistory.test.ts` | Removed, ghost, and archived ids do not inflate counts or block completion; empty lesson is not started. |
| Sibling import | `importAgentSet.test.ts` and validation tests | Trimmed optional group round-trips; absent re-import removes it; explicit empty, whitespace-only, and over-100-code-unit values reject; case and Set boundaries stay distinct. |
| Group-count spacing | `interleave.test.ts` | `A B B` becomes `B A B`; feasible multi-group inputs have no adjacency; impossible all-sibling input is stable; no ids are lost or duplicated. |
| Policy preservation | `dueQueue.test.ts`, `interleave.test.ts`, server tests | Selection cap and membership remain unchanged; tests explicitly allow within-selection priority displacement. |
| UI language | `server.test.ts` | Home, Set, and lesson responses use complete and evidence labels without Mastered, Ready, or percentage claims. |

## Browser and regression gate

Build first, then serve only a disposable library containing deterministic, self-response, and sibling-group cards. In a real Chromium-family browser, verify an incorrect choice remains incomplete, a later correct attempt advances progress, self-response progress is labelled self-assessed, and Review avoids adjacent siblings when another card exists. Confirm authored Learn order is unchanged.

Run targeted tests, full `npm test`, `npm run check`, `npm run build`, and packaged smoke. Parse emitted inline scripts with `node --check` if any UI script changes.
