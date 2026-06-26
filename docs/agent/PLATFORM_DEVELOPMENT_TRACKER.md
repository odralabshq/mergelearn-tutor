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
8. Batch 7: privacy boundary and outbound preview. Next.
9. Batch 8: optional LLM enrichment experiment, only after privacy boundary.
10. Batch 9: packaging/public beta readiness.

## Active slice

Batch 6 repo lexicon/concept packs is implemented and ready for final verification/commit. Next slice after commit: Batch 7 privacy boundary and outbound preview.

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

Batch 6 added repo lexicon/concept packs:

- local `.skilltrace/lexicon.json` parser/validator
- custom repo-specific concepts matched from changed paths and terms
- local aliases for extracted concept labels
- local ignore rules for noisy concepts/evidence
- correction promotion into lexicon aliases/ignores/concepts
- CLI commands under `mergelearn-tutor concept ...`
- dogfood on `/home/adam/mergeLearn` with `repo.pr_understanding_guard`, then scratch `.skilltrace` cleanup

Next planned slice: Batch 7 privacy boundary and outbound preview.
