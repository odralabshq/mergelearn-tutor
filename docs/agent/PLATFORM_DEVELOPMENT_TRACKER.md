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

## Active slice

Batch 12 flashcard generation and website polish is implemented and locally dogfooded. Public release remains blocked on human decisions for product name, license, distribution channel, and any remote enrichment approval.

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

Batch 12 made the website and card lifecycle more product-ready:

- card batches are persisted in state with active/archived lifecycle metadata
- `mergelearn-tutor cards generate --mode more|regenerate` creates fresh cards without deleting history
- `/api/cards/generate` and website buttons expose Generate 5 more / Regenerate 5
- session and dashboard snippets now render as diff-like blocks with line numbers and add/delete coloring
- the review website was redesigned with hero, queue toolbar, stats, polished cards, and responsive layout
- screenshot iteration removed a duplicate heading and verified the final layout had no browser console errors
- dogfood on `/tmp/mergelearn-live-demo` verified CLI generation, API generation, archive counts, pages, and dashboard output

Next planned slice: optional card-history browsing, keyboard shortcuts, or richer graph interactivity. Public beta/publish still requires human decisions first.
