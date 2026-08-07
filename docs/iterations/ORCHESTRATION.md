---
type: process
title: "Iteration Delivery Process"
description: "Durable design, implementation, review, verification, and git gates."
resource: docs/iterations/ORCHESTRATION.md
tags: [iterations, orchestration, verification]
timestamp: 2026-08-04
---

# Iteration Delivery Process

## Phase order

1. Ground all six designs against current source and tests.
2. Review every design with Opus 5 and adjudicate each numbered point.
3. Commit and push the complete reviewed design set.
4. Implement one iteration at a time using vertical TDD slices.
5. Run spec review, code-quality review, browser QA, and full gates.
6. Commit and push the completed iteration before starting the next.
7. Run cross-iteration QA and an independent final Opus 5 review.

## Gates

- Pre-flight: clean expected branch, synchronized upstream, reviewed design, and no unresolved blocker.
- Revision: design or code review failures return to the producer, at most three cycles.
- Escalation: contradictory requirements, non-converging review, migration risk, or destructive recovery pauses for the user.
- Abort: wrong worktree, unexpected branch movement, real-user data access, secret exposure, or destructive command attempt.

## Required evidence per iteration

- A regression test that fails against the pre-iteration behavior where practical.
- Focused tests plus full `npm test`, `npm run check`, `npm run build`, and `npm run smoke:package`.
- Built-artifact verification and browser checks on disposable state.
- Accessibility checks for changed UI and two-tab checks for mutation/session changes.
- Fresh `git diff --check`, clean status, commit SHA, pushed upstream SHA, and updated status file.

## Git policy

Work only on `feat/iteration-program`. Use focused commits and push after each reviewed design package and completed iteration. Never merge or push to `main` without explicit approval.
