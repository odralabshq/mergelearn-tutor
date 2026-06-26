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

## Active slice

Batch 10 manual rating persistence is implemented and locally verified. Public release remains blocked on human decisions for product name, license, distribution channel, and any remote enrichment approval.

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

Batch 10 added manual rating persistence so human usefulness checks can become durable local product-quality data:

- `.skilltrace/state.json` now stores `manualRatings` with backward-safe normalization for older states
- `mergelearn-tutor rate` records 1-5 ratings for cards or concepts across relevance, evidence correctness, answerability, usefulness, and repeatability
- `mergelearn-tutor ratings` summarizes averages and recent ratings without changing learner mastery/events
- evaluation reports now include copyable rating commands next to the manual rubric
- README and evaluation/card-quality docs now reflect the persisted rating loop
- dogfood on `/home/adam/mergeLearn` recorded two local ratings, summarized averages, and verified scratch `.skilltrace` cleanup

Next planned slice: duplicate/noisy card detection and/or use persisted manual ratings to influence prompt/card ranking locally. Public beta/publish still requires human decisions first.
