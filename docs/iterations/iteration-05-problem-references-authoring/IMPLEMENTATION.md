---
type: implementation-design
title: "Iteration 05: Problem References and Authoring Guidance Implementation"
description: "Verified-path implementation contract for external problem metadata and transfer guidance."
resource: docs/iterations/iteration-05-problem-references-authoring/IMPLEMENTATION.md
tags: [iteration, provenance, authoring, implementation]
timestamp: 2026-08-05
---

# Iteration 05 Implementation Design

## Change surfaces

Modify `types.ts`, `validateSetPatch.ts`, `importAgentSet.ts`, `bundle.ts`, `authoringContext.ts`, `lessonSummary.ts`, and existing server card rendering. Add one original example JSON and documentation guidance. Extend existing tests. Do not add a production catalog module, persistence directory, network client, or runtime dependency.

## Metadata contract

Define `ProblemAttribution` and `ExternalProblemRef` in `types.ts`. Put optional `problemRefs` on `LessonMeta`, `Card`, and `AgentCardDraft`; AgentSetPatch Set inherits it through LessonMeta. One pure normalizer/validator handles drafts and bundle values, including NFC, controls, bounds, case-fold duplicate keys, HTTPS, and injected-date checks. Return field-specific errors without remote resolution.

Import builds Set and Card values from normalized refs. Absence on re-import removes author-owned refs. Add lesson bundle manifest format 2 for exports and accept formats 1 and 2 on import. Include Set refs in `BundleSet` and Card refs in `BundleCard`; copy import changes local ids but not external source ids. Plain JSON parsing is verified non-strict, but format 2 prevents older builds from silently round-tripping refs away. Profile backup already copies raw files and needs only regression proof.

## Authoring and reveal contract

Authoring context adds compact case-fold-deduplicated `{ sourceName, sourceId }` summaries to recent lessons so an agent can avoid duplicate coverage without receiving statements or URLs. No new lesson-summary heuristic is added; faded guidance, privacy, and tradeoffs remain documented authoring guidance.

`cardView` forms a Card-wins deduplicated union of Set and Card refs for a reveal-only field. Practice creates their DOM only after commitment. It revalidates HTTPS at render time, escapes text, displays the ASCII hostname, and applies safe link attributes. It never places refs in prompt HTML, context, hidden pre-reveal markup, document title, or live regions.

The original example lives under `examples/`, uses the normal AgentSetPatch schema, and is not auto-installed. Documentation shows `mergelearn import --file <path>` and explains faded guidance, near misses, unlabelled transfer, and constraint-dependent approaches.

## Implementation sequence

1. Add failing pure metadata validation tests, then define and normalize the optional types.
2. Add failing import/re-import tests, then persist Set and Card refs.
3. Add failing bundle round-trip tests, then preserve refs through format version 1.
4. Add authoring-context and advisory-summary tests, then implement concise guidance.
5. Add reveal-only server/browser tests, then render safe links after commitment.
6. Add and import-test the original example, documentation, and full regression gates.

No scraper, remote validation, proprietary content, catalog, pattern graph, implementation ledger, runtime AI, or readiness score belongs in this iteration.
