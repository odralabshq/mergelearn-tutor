---
type: plan
title: "MergeLearn Iterations"
description: "Sequential delivery scopes for reliability, focused study, scalable management, and interview preparation."
resource: docs/iterations/README.md
tags: [iterations, delivery, scope]
timestamp: 2026-08-04
---

# MergeLearn Iterations

This folder defines proposed delivery slices, not detailed designs. Each iteration must leave a usable, tested product increment. Detailed architecture, data migrations, UI states, exact test cases, and implementation tasks will be added only after this scope is approved.

## Delivery rules

- Complete iterations in sequence unless a later design proves a dependency can be removed.
- Each iteration includes implementation, automated tests, browser verification, accessibility checks where relevant, documentation, regression fixes, and final refinement.
- Use disposable libraries for verification. Never test against `~/.mergelearn`.
- Preserve local-first and model-free operation.
- Do not claim external writes, durable learning, or interview readiness without corresponding evidence.
- Every iteration ends with full project gates: tests, typecheck, build, package smoke, and affected browser flows.

## Sequence

1. [Reliable local server and draft recovery](iteration-01-local-server-reliability/README.md)
2. [Complete and scalable Manage library](iteration-02-scalable-manage-library/README.md)
3. [Focused practice modes](iteration-03-focused-practice/README.md)
4. [Session continuity and mutation safety](iteration-04-session-continuity/README.md)
5. [Honest learning progress and review integrity](iteration-05-learning-evidence/README.md)
6. [Local interview problem catalog](iteration-06-problem-catalog/README.md)
7. [Pattern curriculum and problem relationships](iteration-07-pattern-curriculum/README.md)
8. [Faded guidance and transfer practice](iteration-08-guidance-and-transfer/README.md)
9. [External implementation checkpoints](iteration-09-implementation-checkpoints/README.md)
10. [Integrated interview preparation workflow](iteration-10-interview-prep-workflow/README.md)

## Baseline

The existing uncommitted Manage action-layout and confidence-as-submit refinements predate this sequence. They should be reviewed and resolved separately before Iteration 1, not silently absorbed into a later iteration.
