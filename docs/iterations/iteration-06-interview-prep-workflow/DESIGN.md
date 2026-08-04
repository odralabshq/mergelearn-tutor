---
type: design
title: "Iteration 06: Interview Preparation Workflow"
description: "Target design for an explainable interview-preparation composition view."
resource: docs/iterations/iteration-06-interview-prep-workflow/DESIGN.md
tags: [iteration, interview-prep, workflow, design]
timestamp: 2026-08-05
---

# Iteration 06 Design: Interview Preparation Workflow

## Status and grounding

Home already presents lessons and due Review, Manage presents broad library progress and search, and `weakCards.ts` exposes evidence-backed retrieval weakness. Iterations 03 through 05 add exact focused sessions, honest completion, and portable problem references. There is no trustworthy transfer-failure marker, implementation record, or readiness measure.

## Decisions

- D1: Iteration 06 lands only after Iterations 04 and 05. Add one read-only `/prepare` page and a Prepare navigation tab. It composes existing weak-card evidence and problem refs. It creates no workflow, recommendation, catalog, learner-status, or implementation entity.
- D2: Show only the two capabilities not already available on Home or Manage: Strengthen evidence-backed weak cards and Practice externally through problem refs. A compact introduction links to Home for Learn and due Review. Never duplicate those lists or collapse the page into a score, sequence, or readiness queue.
- D3: Every row states one factual reason produced by the same projection that decides membership, such as `2 of 3 recent attempts were retrieval failures`. Do not infer failed transfer, likely interview questions, mastery, readiness, or implementation completion.
- D4: Strengthen preserves the current `loadWeakReport` order. External rows with an attribution date sort first by newest list attribution date, then by source name, source id, Set id, and Card id using code-unit comparison. Undated rows follow and use the same source/id/Set/Card tie-break chain. Labels say `List attribution date`, never recent, trending, hot, or relevance.
- D5: URL query state supports repeated `set`, `tag`, `source`, `list`, and `company` values. Values within one dimension are OR; populated applicable dimensions combine with AND. Set and tag subset both lanes while preserving their relative order. Source, list, and company constrain External only; Strengthen remains byte-for-byte identical to the same set/tag result without those filters, and a note states they do not apply to retrieval evidence. Missing metadata never matches an applicable dimension. Unknown values yield truthful lane-specific empty results.
- D6: Company copy remains `Reported by <source>, as of <date>`. List/company metadata filters and orders only External and never changes Strengthen order or becomes a probability claim.
- D7: Actions preserve shown scope without grading. One shared fragment helper produces both the Set-detail element id and Strengthen href fragment, with browser round-trip behavior defined for spaces, `#`, and non-ASCII card ids. Strengthen uses `Review this evidence`; it does not start a queue, record an attempt, or mutate FSRS. External practice opens exactly the render-time-validated HTTPS ref with no credentials and safe link attributes.
- D8: The page says `Practice externally` and `No implementation result is recorded`. No timer, check box, notes field, status, reminder, or ledger is added.
- D9: The original Iteration 05 example appears as normal filtered data after explicit import. Empty-state onboarding links to the documented import command; it does not add a second installer or auto-install content.
- D10: Build one pure `prepareWorkflow.ts` projection and keep HTML rendering in `server.ts`. Reuse the current pre-Iteration-03 `loadWeakReport`, tag data, and Iteration 05 problem-ref normalization and render helpers. External empty copy distinguishes `No problem references are available` from `No problem references match these filters`. Do not duplicate existing algorithms, load completion/due data, or search problem text.

## Acceptance criteria

1. Each displayed reason is reproducible from persisted source data and each action preserves its exact card or external-ref scope without grading.
2. Filters, ignored-dimension notes, ordering, empty states, and URLs are deterministic, shareable, and require no browser storage.
3. No external statement, title-derived pattern, transfer outcome, implementation result, readiness score, or remote data is invented.
4. Existing Home remains the only Learn and due-Review list; Manage, Practice, backup/export, accessibility, and local-only behavior remain intact.
