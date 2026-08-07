---
type: process
title: "Iteration Program Worker"
description: "State-machine contract for durable autonomous delivery."
resource: docs/iterations/WORKER.md
tags: [iterations, worker, automation]
timestamp: 2026-08-04
---

# Iteration Program Worker

## Pre-flight

- Work only in `/Users/adam/Documents/GitHub/mergelearn-refinements` on `feat/iteration-program`.
- Read `README.md`, `ORCHESTRATION.md`, `ROADMAP_REVIEW.md`, and `STATUS.md` before acting.
- Fetch the named remote branch and require local HEAD, upstream HEAD, and a clean tree to agree.
- Stop and record a blocker rather than resetting, force-pushing, touching `~/.mergelearn`, or guessing scope.

## State machine

1. During `design`, complete one iteration design package per run. Ground it in current source and tests. Include `DESIGN.md`, `TESTING.md`, and `IMPLEMENTATION.md` in that iteration folder.
2. Review each package with Opus 5 through Kiro. Account for every numbered recommendation in `REVIEW.md`; revise up to three cycles.
3. After all six packages pass, run a cross-design Opus 5 review, reconcile dependencies, commit and push, then change phase to `implementation`.
4. During `implementation`, complete one coherent vertical slice from the current iteration per run using behavior-first tests.
5. Before completing an iteration, require spec review, Opus 5 code review, built-artifact checks, browser QA on disposable state, full gates, a focused commit, push, and status update.
6. After Iteration 06, run full cross-iteration QA and final Opus 5 review, fix all important findings, and set phase to `complete`.

## Boundaries

- Prefer deleting, merging, or deferring speculative work over adding entities or infrastructure.
- No runtime AI, scraping, proprietary content, code runner, accounts, sync, readiness score, or deferred graph/ledger.
- No new runtime dependency without a documented, reviewed necessity.
- Never merge to `development` or `main`, publish npm, or perform destructive git operations.
- Use source-grounded evidence. A subagent or reviewer claim is not fact until verified.

## Completion evidence

Every pushed checkpoint records changed files, focused and full test results, browser scenarios, Opus decisions, commit SHA, upstream SHA, blockers, and the exact next action in `STATUS.md`.
