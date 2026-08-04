---
type: implementation-design
title: "Iteration 06: Interview Preparation Workflow Implementation"
description: "Verified-path implementation contract for the preparation composition view."
resource: docs/iterations/iteration-06-interview-prep-workflow/IMPLEMENTATION.md
tags: [iteration, interview-prep, workflow, implementation]
timestamp: 2026-08-05
---

# Iteration 06 Implementation Design

## Change surfaces

After Iterations 04 and 05 land, create `src/core/library/prepareWorkflow.ts` and `tests/core/library/prepareWorkflow.test.ts`. Modify `src/session/server.ts`, `tests/session/server.test.ts`, `tests/session/practiceAccessibility.test.ts`, and concise user documentation. Reuse existing weak-card evidence plus Iteration 05 problem-ref helpers. No Iteration 03 dependency, persistence root, dependency, runtime model, catalog, or mutation endpoint is added.

## Projection contract

`loadPrepareWorkflow(root, filters, now)` loads Set summaries and active cards once, then joins the current `loadWeakReport`, tags, and normalized Set/Card problem refs. Pure helpers parse repeated query values, apply OR within and AND across applicable dimensions, deduplicate external refs by owner plus normalized source/id, and sort each lane with explicit code-unit tie-breaks. Set/tag subset Strengthen without reordering it. Source/list/company do not enter its projection; the result carries a flag for the visible ignored-filter note.

Return typed lane rows with ids, labels, counts, reason fields, attribution-date fields, action parameters, and enough pre-filter counts to distinguish no refs from no matching refs. Dated External rows use date plus source/id/Set/Card keys; undated rows use the same key chain after all dated rows. Do not recompute FSRS, weak scores, completion classes, or attribution validity. A malformed stored ref, including HTTPS with userinfo, remains plain-text metadata and never becomes an external href.

## Server and action contract

Route `GET /prepare` through `pageShell` and add a Prepare tab. Render server-side forms with repeated query parameters so URLs are copyable and refresh-safe. Provide compact links back to Home for Learn and due Review, then render Strengthen and External independently with no total score or implied sequence.

Add one shared `cardFragmentId(cardId)` helper and use it for both Set-detail element ids and encoded Strengthen href fragments. Browser fragment decoding must select the same element for reserved and Unicode ids. This is an exact read-only handoff, not a queue or attempt. External links use the Iteration 05 render-time validator, reject credentials again, and apply safe attributes. Page rendering performs no network request and writes no state.

## Implementation sequence

1. Add failing pure two-lane, absence, ordering, ignored-dimension, and filter-algebra tests, then implement the projection.
2. Add failing exact-anchor and external-action server tests, then add `/prepare`, navigation, Set-detail anchors, and server-rendered filters.
3. Add accessibility, unsafe-link, refresh, narrow-layout, empty-reason, and no-localStorage assertions.
4. Run the explicit-import end-to-end journey and full regression, package, backup, bundle, and inline-client gates.

No failed-transfer inference, implementation ledger, timer, code runner, status check box, global recommendation score, probability claim, account, sync, or runtime AI belongs here.
