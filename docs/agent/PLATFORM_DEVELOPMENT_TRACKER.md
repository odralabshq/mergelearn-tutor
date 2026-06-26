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
3. Batch 2: correction and learner-event model. Next.
4. Batch 3: AST-backed TypeScript extraction with evidence ranking.
5. Batch 4: improved card generation.
6. Batch 5: interactive local review session.
7. Batch 6: repo lexicon/concept packs.
8. Batch 7: privacy boundary and outbound preview.
9. Batch 8: optional LLM enrichment experiment, only after privacy boundary.
10. Batch 9: packaging/public beta readiness.

## Active slice

Batch 1 is implemented and ready for final verification/commit. Next slice after commit: Batch 2 correction and learner-event model.

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
