---
type: plan
title: "MergeLearn Iterations"
description: "Six sequential, independently releasable platform improvements."
resource: docs/iterations/README.md
tags: [iterations, delivery, scope]
timestamp: 2026-08-04
---

# MergeLearn Iterations

These are approved delivery boundaries, not implementation specifications. Every iteration receives grounded design, testing, and review documents before its code begins.

## Delivery rules

- Complete iterations in sequence and keep each independently useful and revertible.
- Prefer existing Set, Card, Tag, and ReviewSession concepts over new entities.
- Use vertical TDD slices, then run full tests, typecheck, build, packaged smoke, and affected browser flows.
- Verify only against disposable libraries, never `~/.mergelearn`.
- Use Opus 5 at design, code-review, and final-integration gates; adjudicate every numbered point against source.
- Commit and push each approved design package and each completed implementation separately.
- Do not merge to `main` without explicit user approval.

## Sequence

1. [Local server reliability](iteration-01-local-server-reliability/README.md)
2. [Manage at scale](iteration-02-scalable-manage-library/README.md)
3. [Session integrity](iteration-03-session-integrity/README.md)
4. [Completion and spacing quality](iteration-04-completion-spacing/README.md)
5. [Problem references and authoring guidance](iteration-05-problem-references-authoring/README.md)
6. [Interview preparation workflow](iteration-06-interview-prep-workflow/README.md)

## Deferred until evidence justifies them

- Pattern/prerequisite graph and automatic progression.
- Separate problem-catalog storage subsystem.
- External implementation-attempt ledger.
- Aggregate mastery, readiness, or confidence scores.

See [Roadmap Review](ROADMAP_REVIEW.md), [Orchestration](ORCHESTRATION.md), [Worker Contract](WORKER.md), and [Program Status](STATUS.md).
