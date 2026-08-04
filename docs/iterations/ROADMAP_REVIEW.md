---
type: decision
title: "Iteration Roadmap Review"
description: "Opus 5 review and source-grounded adjudication of the delivery sequence."
resource: docs/iterations/ROADMAP_REVIEW.md
tags: [iterations, review, decisions]
timestamp: 2026-08-04
---

# Iteration Roadmap Review

## Result

Opus 5 reviewed the original ten scopes. The approved program has six releases.

## Adopted

- Keep server reliability and Manage scaling as separate correctness fixes.
- Merge focused practice with session continuity because both protect one scheduling invariant.
- Trim completion work to graded recall and sibling-card spacing.
- Merge problem metadata and transfer authoring into typed references and conventions.
- Build interview preparation last as a view over existing primitives.
- Defer the pattern graph, catalog subsystem, and implementation ledger.

## Modified after source inspection

- `gradeCard` is already the shared scheduling write path for browser grading. Iteration 3 will extend this path with idempotency instead of adding a parallel scheduler service.
- JSON writes already use same-directory temporary files and atomic rename in `src/core/library/io.ts`.
- A global write queue, store revision, and in-memory Manage index remain hypotheses. Add them only if a failing multi-tab or performance test proves they are needed.
- Self-response remains valuable qualitative evidence but cannot independently establish deterministic completion.

## Explicitly rejected

- New Problem, Pattern, prerequisite, and evidence entities before demonstrated need.
- Any aggregate mastery, readiness, or confidence score.
- Automatic unlocking, confidence-driven scheduling, rich editor, model-based duplicate detection, or file-based sync.

## Review accounting

Every numbered Opus recommendation is represented above as adopted, modified, deferred, or rejected. The full review artifact was generated at `/tmp/mergelearn-iteration-roadmap-opus-review.md` and is intentionally not a repository dependency.
