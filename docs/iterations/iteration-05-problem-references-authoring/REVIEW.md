---
type: review
reviewer: "Opus 5 via Kiro, source-grounded by Hermes"
review_cycles: 3
title: "Iteration 05: Problem References and Authoring Guidance Review"
description: "Independent implementation review and source-grounded adjudication."
resource: docs/iterations/iteration-05-problem-references-authoring/REVIEW.md
tags: [iteration, provenance, authoring, review]
timestamp: 2026-08-05
---

# Iteration 05 Implementation Review

## Reviewed revision

Implementation commit: `1b0a9e3f2a13dfab7e1b3f4f4e642bacdd3a7aa7`

The final review covered the exact tracked and untracked implementation tree later committed as this revision. The cycle 3 bundle contained 1,171 lines and 67,092 bytes. It included the new example and shared problem-reference normalizer.

## Verification evidence

- Final affected matrix: 115 tests passed.
- Final repository gate: 385 tests passed across 41 files.
- TypeScript check, build, packaged smoke, and diff validation passed.
- Packaged smoke checked 152 files.
- Fresh built-artifact Brave CDP QA passed before and after commitment.
- Pre-commit DOM contained no problem title, attribution, or hostname.
- Post-commit DOM proved Card-wins deduplication, one safe link, unsafe-link plain text, source-qualified company wording, quote-safe accessible naming, and omission of malformed stored optional metadata.

## Opus cycle 1

Verdict: `BLOCKED`

- C1-F1 adopted: invalid calendar components could throw. The date parser now rejects invalid dates without calling `toISOString()` on an invalid value.
- C1-F2 adopted: the normalizer result became a discriminated success or error union.
- C1-F3 rejected as a contract change: bundle imports intentionally use the injected UTC date and the normal validated import path.
- C1-F4 adopted: one NFC-normalized identity helper now drives validation, authoring context, and Practice rendering.
- C1-F5 adopted: malformed stored identities are skipped instead of crashing `/api/due`.
- C1-F6 adopted: the revealed section uses `aria-labelledby`, and external links have descriptive accessible names.

## Opus cycle 2

Verdict: `NOT BLOCKED`

- C2-F1 adopted: hand-edited optional titles, attribution labels, and dates now pass through bounded render-time sanitizers.
- C2-F2 adopted: a quoted source identity is exercised through the live DOM, proving attribute escaping.
- C2-F3 modified: bundle clock behavior remains the D5 contract and is now pinned in both rejection and success directions.
- C2-F4 deferred: `validatedProblemRefs` contains an invariant throw, but validation and persistence call the same deterministic normalizer with the same instant. No reachable divergence was found.
- C2-F5 adopted: sparse in-process top-level arrays reject atomically.
- C2-F6 adopted: documentation and tests use the canonical `mergelearn apply --file <path> --open` command.
- C2-F7 rejected: `--border-soft` is defined in the existing Practice token block.

## Opus cycle 3

Verdict: `NOT BLOCKED`

- C3-F1 deferred: sparse nested attribution arrays are possible only for direct in-process callers. JSON cannot represent holes, rendering skips holes, and bundle revalidation rejects serialized nulls.
- C3-F2 deferred: a hand-edited future date can render, but normal imports and bundles reject it. This is bounded local-file provenance integrity, not an import or injection bypass.
- C3-F3 rejected as non-defect: Practice is explicitly Card-wins. Authoring context is identifier-only and Set-first casing does not change duplicate detection.

## Implementation verdict

`NOT BLOCKED`

Iteration 05 is complete at implementation revision `1b0a9e3f2a13dfab7e1b3f4f4e642bacdd3a7aa7`. No unresolved finding blocks delivery. Deferred observations are bounded above and add no runtime machinery.
