---
type: review
reviewer: "Opus 5 via Kiro, source-grounded by Hermes"
review_cycles: 3
title: "Iteration 06: Interview Preparation Workflow Review"
description: "Independent implementation review and source-grounded adjudication."
resource: docs/iterations/iteration-06-interview-prep-workflow/REVIEW.md
tags: [iteration, interview-prep, workflow, review]
timestamp: 2026-08-06
---

# Iteration 06 Implementation Review

## Reviewed revision

Implementation commit: `b9080c26e7b061c70b5338d9221d6e4b5f37fba1`

The final review covered the exact tracked and untracked implementation tree later committed as this revision. The cycle 3 bundle contained 517 lines and 29,534 bytes and included the new projection and its persisted-boundary tests.

## Verification evidence

- Final affected matrix: 69 tests passed across projection, accessibility, and the full server suite.
- Final repository gate: 390 tests passed across 42 files.
- TypeScript check, build, packaged smoke, and diff validation passed.
- Packaged smoke checked 155 files.
- Fresh built-artifact Brave CDP QA passed at desktop and 375 pixel widths.
- URL filters survived refresh, the exact legacy target `card-legacy snow 雪 %?#` resolved through `:target`, external links were not activated, and Prepare emitted zero mutation requests.
- The current implementation bundle matched the final reviewed bundle byte for byte before commit.

## Opus cycle 1

Verdict: `BLOCKED`

- C1-F1 adopted: true no-reference empty states now show the exact opt-in example import command.
- C1-F2 adopted: README now documents Prepare, both factual lanes, repeated URL filters, source-filter isolation, and read-only behavior.
- C1-F3 adopted: Strengthen distinguishes unfiltered absence from Set or Tag filter exclusion.
- C1-F4 bounded: imported canonical URLs intentionally reject fragments and credentials. The render guard remains fail-safe and returns the exact stored validated URL.
- C1-F5 adopted: stored attribution dates pass through the shared sanitizer before display and ordering.
- C1-F6 bounded: authored IDs remain filename-safe; the decoded legacy compatibility target was retained and later proved in Brave.
- C1-F7 deferred: repeated values round-trip when present, but the page adds no client-side control builder.
- C1 test gaps closed: empty onboarding, malformed dates, repeated inputs, and reserved or Unicode browser fragments gained direct coverage.
- C1 scope findings adopted: duplicate empty wording and unused title or Set-title projection fields were removed.

## Opus cycle 2

Verdict: `BLOCKED`

- C2-F1 adopted: the visible label `Practice externally` is now the prefix of every external action accessible name, satisfying Label in Name.
- C2-F2 accepted as intentional: Set references fan out per active Card owner because each row has a distinct exact action target.
- C2-F3 deferred: the opt-in example remains truthful onboarding whenever no supplied references exist.
- C2-F4 bounded by the tested legacy compatibility contract.
- C2-F5 adopted: repeated filter controls now have distinct numbered visible labels.
- C2 test gap 1 closed: a populated unsafe stored URL now proves the disabled `Link unavailable` fallback and absence of a raw unsafe href.
- C2 test gap 2 closed: the route test proves an archived source Card contributes no Prepare handoff.
- C2 test gap 3 closed: attribution ordering now proves selection of the newest valid date while ignoring a malformed date.

## Opus cycle 3

Verdict: `NOT BLOCKED`

- C3-F1 deferred: fragment-bearing stored URLs fail closed. Normal imports reject fragments, and no unsafe handoff is emitted.
- C3-F2 deferred: the local render guard is intentionally stricter than the import contract. Drift would fail closed rather than expose an unsafe URL.
- C3-F3 deferred: example onboarding remains factual when a library has retrieval evidence but no supplied references.
- C3-F4 accepted: Set reference fan-out is per Card owner and exact action target, as pinned by projection tests.
- C3-F5 bounded: legacy whitespace and Unicode IDs are compatibility-only and resolve in the real browser without selector use.
- C3-F6 deferred: `StrengthenRow.tagIds` is harmless projection duplication and does not create a second algorithm or persistence surface.
- Remaining test gaps are non-blocking: direct Prepare coverage does not enumerate every fail-closed URL variant, and the filtered Strengthen empty-copy branch is not separately asserted.

## Implementation verdict

`NOT BLOCKED`

Iteration 06 is complete at implementation revision `b9080c26e7b061c70b5338d9221d6e4b5f37fba1`. No unresolved finding blocks delivery. Deferred observations are bounded above and add no runtime machinery.
