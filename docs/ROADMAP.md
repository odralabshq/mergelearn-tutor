---
type: reference
title: "Product Roadmap"
description: "Planned direction and phased priorities for the tool."
resource: docs/ROADMAP.md
tags: [roadmap, planning]
timestamp: 2026-07-02
---

# MergeLearn Tutor Roadmap

## Active direction

The current, authoritative development direction is the core redesign under
[`docs/design/`](design/CORE_PLATFORM_PLAN_2026_07_01.md). Read the
[Core Platform Plan](design/CORE_PLATFORM_PLAN_2026_07_01.md) first, then the
six-doc [design set](design/design-core-2026-07-01/00-overview-and-simplification.md)
(overview through the multi-model review).

Current goal:

Build a fully tested local-first code tutoring platform that helps AI-heavy
developers understand what they just shipped, correct the tutor when it is wrong,
and return weekly because the review session is short and useful.

The core bet: the LLM is the sole card author (guided by grep/git/AST context and
verified by provenance guardrails), scheduling uses FSRS, and knowledge is
represented as a typed concept graph. See the design set for the dependency-ordered
build sequence and the honest time budget.

Completed platform foundations include evaluation, corrections, AST extraction,
local review session, repo lexicon, privacy preview, and fake/local no-network
enrichment.

Local-first is non-negotiable: no telemetry, and any cloud LLM endpoint is explicit
opt-in. A polished dashboard, IDE extension, and cloud sync remain out of scope for
the core phase.
