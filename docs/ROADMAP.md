# MergeLearn Tutor Roadmap

## Active next-phase plan

Read this first for the current development direction:

`docs/plans/2026-06-26-platform-next-phase-plan.md`

Current goal:

Build a fully tested local-first code tutoring platform that helps AI-heavy developers understand what they just shipped, correct the tutor when it is wrong, and return weekly because the review session is short and useful.

Recommended next implementation slice:

1. Build the multi-repo evaluation harness.
2. Add manual card/concept rating rubric.
3. Dogfood on MergeLearn.
4. Add correction and learner-event model.
5. Only then improve extraction and UI.

Do not start with a polished dashboard, IDE extension, cloud sync, or LLM grading. The current critical path is truthfulness, correction, and measurable usefulness.
