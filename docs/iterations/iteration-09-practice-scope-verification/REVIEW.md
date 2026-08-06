---
type: review
reviewer: "Opus 5 via Kiro, source-grounded by Hermes"
review_cycles: 1
title: "Iteration 09: Practice Scope Verification"
description: "Evidence-only verification of compound Practice scope and launch precedence."
resource: docs/iterations/iteration-09-practice-scope-verification/REVIEW.md
tags: [iteration, practice, scope, verification, review]
timestamp: 2026-08-06
---

# Iteration 09 Verification Review

## Reviewed revision

Product revision: `44327a8ba3377c22ec1a3da1746a16d2ea9cc4ee`

Iteration 09 made no product or test changes. It audited the already pushed product revision through fresh built-artifact browser journeys and repository verification.

## Audit goal

Verify three boundaries without manufacturing implementation work:

- compound Practice scope membership for union and intersection
- isolation of explicit Set and Lesson launches from stored browser scope
- precedence of an unfinished session over a conflicting launch intent

## Browser evidence

A disposable library contained two Sets in separate folders with separate tags.

- A union of folder `examples/interview-patterns` and tag `scope-beta-tag` advertised `Review 7 now`. The persisted session had `plannedCount: 7` and combinator `union`.
- The same disjoint folder and tag under intersection advertised zero due, offered no Review action, and rendered scoped caught-up copy.
- A positive intersection of folder `qa/scope-beta` and tag `scope-beta-tag` advertised `Review 2 now`. The persisted session had two planned cards and the expected folder, tag, and `intersection` combinator.
- With beta scope stored, an explicit Set launch selected exactly the five cards from `interview-pattern-example`. Its filter contained only the explicit Set.
- With beta scope stored, an explicit Lesson launch selected exactly the five authored activities from `interview-pattern-example`. Its filter contained only the explicit Set.
- An unfinished beta-scoped Review session survived a conflicting Lesson launch. The same session ID and scope were preserved, the heading and title rendered Review, and the page announced that the unfinished session was resumed and the requested practice was not started.
- The journey exercised the generated browser client against `dist` through public HTTP and session boundaries.
- Disposable server and Brave processes were stopped, and their ports were verified closed.

## Repository evidence

- 393 tests passed across 42 files.
- TypeScript check passed.
- Build passed.
- Packaged smoke passed over 155 files.
- `git diff --check` passed.
- The worktree was clean.
- Local and tracking refs both matched `44327a8ba3377c22ec1a3da1746a16d2ea9cc4ee`.

## Opus review

Verdict: `NOT BLOCKED`

Evidence quality: `PASS`

No-code closure: `JUSTIFIED`

Required before closure: None.

Opus found no reachable product defect. Three non-blocking observations were coverage granularity only:

- Union membership was proven by persisted scope, combinator, and matching preview and plan counts, but per-side counts were not recorded.
- Session precedence was exercised from unfinished Review to conflicting Lesson, not every reverse direction.
- The deferred launch after the resumed session ends was not exercised. The user-facing notice already states that the requested launch was not started.

These observations do not justify changing a verified product revision without a reproduced defect.

## Implementation verdict

`NOT BLOCKED`

Iteration 09 closes as a verification-only audit. No implementation commit was needed.