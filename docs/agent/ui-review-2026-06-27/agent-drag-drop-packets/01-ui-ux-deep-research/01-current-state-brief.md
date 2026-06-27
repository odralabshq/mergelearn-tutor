# Current state brief

Date: 2026-06-27
Product: MergeLearn Tutor
Scope: frontend/UI and user-facing learning workflow

## What MergeLearn Tutor is

MergeLearn Tutor is a local-first, repo-aware learning tutor. It turns source code and repository evidence into active-recall cards, tracks confidence calibration, schedules delayed recall probes, and exposes evidence/provenance for why each card exists.

## Current implementation state

The current UI has these browser pages:

- Workbench: command center and visual map.
- Review: active-recall card session.
- Plan Builder: setup/readiness checklist.
- Courses: learning goals and material paths.
- Questions: generated/drafted question review.
- Timeline: GitLens-style provenance history.
- Graph: evidence/concept/card graph.
- Study: active-control/passive-review experiment mode.
- History: review and event audit.
- Progress: concept progress map.
- Preferences: local question-generation settings.

## Current known UI problem

The product has strong capabilities but the interface feels like many equally weighted admin pages. The goal is to reorganize it into a more intuitive, visually clear, functional learning workbench.

## Claims guardrail

Do not claim MergeLearn Tutor scientifically improves learning yet. It has research-backed design directions and local instrumentation, but product efficacy requires actual evaluation data.
