---
type: review
reviewer: "Opus 5 via Kiro, source-grounded by Hermes"
review_cycles: 1
title: "Iteration 05: Problem References and Authoring Guidance Review"
description: "Independent review record and source-grounded adjudication."
resource: docs/iterations/iteration-05-problem-references-authoring/REVIEW.md
tags: [iteration, provenance, authoring, review]
timestamp: 2026-08-05
---

# Iteration 05 Design Review

## Review boundary

This package adds optional embedded external-problem metadata, portable bundle handling, reveal-only links, advisory authoring guidance, and one original example. It must not add a catalog, scraper, external-content importer, pattern graph, implementation ledger, runtime model, or readiness score.

## Initial source checks

- `SourceRef` requires repository paths, commits, frozen text, and drift semantics, so reusing it would be misleading.
- AgentSetPatch and `importAgentSet` already separate author content from learner FSRS.
- Lesson bundle format 1 already carries optional Set and Card JSON and strips learner state.
- `authoringContext.ts` and `lessonSummary.ts` provide compact context and advisory warnings without a model.
- Practice already separates pre-attempt prompt/context from post-reveal explanation.

## Required Opus review

Challenge the metadata shape, normalization, URL/date security, bundle compatibility, re-import deletion, disclosure timing, advisory warnings, and whether the original example or any field adds unjustified complexity. Record every numbered finding as adopted, modified, deferred, or rejected. At most three cycles.

## Adjudication ledger: Opus cycle 1

The review is `/tmp/mergelearn-iteration-05-opus-review-cycle-1.md`. It returned NOT BLOCKED. All eleven findings are accounted for below.

- R1 modified: company attribution remains because it is an explicit product requirement, but rendering is always source-qualified and dated, never a verified asked-at claim.
- R2 adopted: Practice renders a Card-wins deduplicated union of Set and Card refs.
- R3 adopted: drafts, persisted values, and bundle values use one pure validator.
- R4 modified: plain JSON parsing is non-strict, but new exports move to format 2 so older builds reject instead of silently dropping refs; format 1 imports remain supported.
- R5 adopted: add URL bounds, NFC, control and bidi rejection, UTC future-date and 1970 floor checks, and case-fold duplicate keys.
- R6 adopted: URL queries remain unchanged but produce an advisory.
- R7 adopted: refs, document title, and live regions remain pre-commit clean; Practice does not render tags before commitment.
- R8 adopted: render-time HTTPS validation, plain-text fallback, no-referrer policy, and ASCII-host display protect hand-edited storage.
- R9 adopted by pruning: no prose-based tradeoff or pattern-leak warnings are added. Documentation and the original example carry that guidance.
- R10 adopted: the example uses reserved domains, no company claims, original content, explicit import, and a fresh-library-empty regression test.
- R11 adopted through the expanded validation, render, bundle, and example tests.

## Final verdict

Opus 5 returned NOT BLOCKED after one cycle. The source-grounded revisions reduce inference and strengthen portability and disclosure safety. Iteration 05 is ready for the cross-design gate.
