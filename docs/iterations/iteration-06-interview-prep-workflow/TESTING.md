---
type: test-design
title: "Iteration 06: Interview Preparation Workflow Testing"
description: "Behavioral proof for explainable preparation lanes and exact actions."
resource: docs/iterations/iteration-06-interview-prep-workflow/TESTING.md
tags: [iteration, interview-prep, workflow, testing]
timestamp: 2026-08-05
---

# Iteration 06 Testing: Interview Preparation Workflow

## Test layout

Create `tests/core/library/prepareWorkflow.test.ts`; extend `tests/session/server.test.ts` and `tests/session/practiceAccessibility.test.ts`. Reuse existing due, completion, weak-card, import, and problem-ref fixtures. Do not add network mocks, browser storage fixtures, or a catalog suite.

## Test matrix

| Behavior | Verified path | Required proof |
| --- | --- | --- |
| Two lanes | pure projection tests | Weak cards and external refs appear only in their factual lanes with exact reason inputs; Home remains the Learn and Review destination. |
| Honest absence | projection tests | Not-weak, watch-only, and no-ref items stay out; no transfer or implementation state is synthesized; empty reasons describe only applicable data. |
| Deterministic order | projection tests | Weak order is preserved; dated External rows precede undated rows; both blocks use source/id/Set/Card tie-breaks; enumeration order cannot change output. |
| Filter algebra | projection tests | OR within repeated values and AND across applicable dimensions; unknown values empty only the applicable lane; absent metadata does not match. |
| Ignored dimensions | projection/server tests | Source/list/company affect only External; Strengthen row identity and order are byte-identical with and without them, and the page states that boundary. |
| Truthful empty copy | projection/server tests | No stored refs and refs excluded by filters produce distinct factual messages without relevance or readiness claims. |
| Exact actions | server tests | One shared helper round-trips link fragment to element id for ordinary, space, `#`, and non-ASCII card ids; no practice route is used. |
| Safe links | server tests | External links use blank, noopener, noreferrer, no-referrer; hand-edited unsafe, credential-bearing, or non-HTTPS URLs render as text. |
| Accessible page | accessibility tests | Prepare tab/current state, lane headings, reasons, filter controls, ignored-filter note, empty states, and external warning have keyboard and screen-reader semantics. |
| No hidden state | server/browser tests | Refresh and copied URL reproduce filters; no localStorage key or mutation endpoint is introduced. |
| Example journey | browser plus CLI | Explicitly import the original sample, filter it, open one exact weak-card anchor, and verify the external handoff warning and no recorded implementation claim. |

## Regression gate

Run targeted projection and server tests, then full `npm test`, `npm run check`, `npm run build`, packaged smoke, lesson bundle format-1/2 tests, profile backup/restore, and inline-client extraction plus `node --check`. Browser-test desktop and narrow layouts in a disposable library and confirm no request leaves MergeLearn except the user-activated external link.
