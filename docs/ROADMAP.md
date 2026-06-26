# MergeLearn Tutor Roadmap

## Active next-phase plan

Read this first for the current development direction:

`docs/plans/2026-06-26-platform-next-phase-plan.md`

Current goal:

Build a fully tested local-first code tutoring platform that helps AI-heavy developers understand what they just shipped, correct the tutor when it is wrong, and return weekly because the review session is short and useful.

Recommended next implementation slice:

1. Add duplicate/noisy card detection.
2. Use persisted manual ratings to influence prompt/card ranking locally.
3. Continue packaging/beta readiness only after human decisions for name, license, and distribution.

Manual rating persistence is now part of the local quality loop; packaging readiness lives in `docs/BETA_READINESS.md`.

Completed platform foundations now include evaluation, corrections, AST extraction, improved cards, local review session, repo lexicon, privacy preview, fake/local no-network enrichment, beta packaging readiness, and manual rating persistence.

Do not start with a polished dashboard, IDE extension, cloud sync, or LLM grading. The current local-only critical path is improving quality signals and noisy-card detection without weakening the local-first/no-telemetry posture.
