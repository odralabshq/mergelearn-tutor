---
type: test-design
title: "Iteration 05: Problem References and Authoring Guidance Testing"
description: "Behavioral proof for portable problem provenance and transfer authoring guidance."
resource: docs/iterations/iteration-05-problem-references-authoring/TESTING.md
tags: [iteration, provenance, authoring, testing]
timestamp: 2026-08-05
---

# Iteration 05 Testing: Problem References and Authoring Guidance

## Existing coverage and layout

Extend `validateSetPatch.test.ts`, `importAgentSet.test.ts`, `bundle.test.ts`, `lessonSummaryAdvisory.test.ts`, `authoringContextDepth.test.ts`, `server.test.ts`, and sample/example tests. Use the existing import and bundle paths. Do not add network fixtures or a catalog test suite.

## Test matrix

| Behavior | Verified path | Required proof |
| --- | --- | --- |
| Valid metadata | validation and import tests | Set and Card refs share one validator, NFC-normalize and round-trip; absent re-import removes refs while FSRS survives. |
| URL safety | validation tests | HTTPS and authored queries are preserved; HTTP, relative, credentials, fragments, malformed/overlong URLs reject; case-fold duplicate keys reject atomically. |
| Text safety | validation tests | C0/C1 and bidi controls reject; exact code-unit boundaries pass/fail predictably. |
| Date provenance | validation tests | Real leap dates pass; impossible, pre-1970, future-UTC, and non-`YYYY-MM-DD` dates reject; old valid dates display `as of`. |
| Bundle portability | `bundle.test.ts` | Format 2 export/inspect/import/dry-run/copy preserves refs; format 1 still imports; no FSRS/local path appears. |
| Authoring context | `authoringContextDepth.test.ts` | Recent lessons case-fold-deduplicate source/id pairs without exposing title, URL, or statement text. |
| Reveal union | `server.test.ts` plus browser | Card refs override duplicate Set refs; prompt/context/title/live DOM omit metadata before commit; reveal shows qualified attribution. |
| Runtime link safety | `server.test.ts` | Hand-edited unsafe stored URL renders as text; valid links have noopener, noreferrer, no-referrer, and ASCII-host display. |
| Original example | example and import tests | Patch imports cleanly, uses only reserved-domain refs and no company labels, contains no copied content, and a fresh library remains empty until explicit import. |

## Browser and regression gate

Build and import the original example into a disposable library. In a real Chromium-family browser, inspect the pre-attempt DOM to confirm problem identity and pattern labels are not rendered, submit an attempt, then verify the accessible post-reveal link and dated attribution. Confirm no network request is made by MergeLearn itself.

Run targeted tests, full `npm test`, `npm run check`, `npm run build`, packaged smoke, bundle export/import, and emitted-script parsing where the Practice client changes.
