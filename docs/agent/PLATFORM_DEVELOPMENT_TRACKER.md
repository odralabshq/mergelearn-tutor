# MergeLearn Tutor Platform Development Tracker

## Current objective

Build MergeLearn Tutor into a fully tested, working local-first code tutoring platform with the best possible user experience.

## Authorization boundary

The user asked the agent to work long-term in iterations, create an upcoming task list, finish tasks, refresh the list, and continue until the platform is fully tested with no valuable followups.

Allowed autonomously:

- local file edits
- local tests/builds/evals
- local commits
- dependency-safe implementation slices
- local dogfood on `/home/adam/mergeLearn` as long as scratch state is cleaned or ignored

Escalate via Telegram if needed:

- product/name/license decision required before public release
- remote push/PR/merge/publish/deploy
- paid/cost-incurring services
- secrets/credentials
- production-impacting actions
- optional remote LLM mode approval

## Dependency-ordered queue

1. Baseline plan and tracker. Done.
2. Batch 1: multi-repo evaluation harness and rating rubric. Implemented.
3. Batch 2: correction and learner-event model. Implemented.
4. Batch 3: AST-backed TypeScript extraction with evidence ranking. Implemented initial AST analyzer.
5. Batch 4: improved card generation. Implemented.
6. Batch 5: interactive local review session. Implemented initial local server.
7. Batch 6: repo lexicon/concept packs. Implemented.
8. Batch 7: privacy boundary and outbound preview. Implemented.
9. Batch 8: optional LLM enrichment experiment, fake/local only with no network. Implemented.
10. Batch 9: packaging/public beta readiness. Implemented locally; public release blocked on human name/license/distribution decisions.
11. Batch 10: manual rating persistence and quality feedback loop. Implemented.
12. Batch 11: snippet-first learning UX, preferences onboarding, and progress map. Implemented.
13. Batch 12: flashcard generation lifecycle, diff snippets, and website polish. Implemented.
14. Batch 13: active recall flow, card history, unified page design, and richer diff context. Implemented.
15. Batch 14: courses/tracks, question bank, fake/local LLM question drafts, evidence timeline, and graph pages. Implemented pending final verification.

## Active slice

Batch 14 is in final verification. The full demo now includes courses/tracks, goals/materials, fake/local LLM-style question drafting, accepted question-bank entries, course-generated cards, evidence timeline/document lens, graph representation, and a summary-first history page.

## Verification baseline

Last verified before starting Batch 1:

```bash
npm run check
npm test
npm run build
npm run eval
npm run smoke
```

All passed.

## Latest completed local batch

Batch 14 extends the product surface beyond review cards:

- courses persist goals, material paths, doc paths, question planes, and concept focus
- question bank persists fake/local LLM-style drafts with accepted/rejected statuses and no network use
- accepted questions can drive course card generation
- evidence timeline and graph APIs/pages connect commits, files, docs, concepts, courses, questions, card batches, cards, and events
- `/history` is now summary-first with details progressively disclosed

Next planned slice after Batch 14: stronger interactive graph layout and optional remote LLM opt-in/privacy-preview policy. Public beta/publish still requires human decisions first.
