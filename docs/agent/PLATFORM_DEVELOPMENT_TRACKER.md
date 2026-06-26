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
10. Batch 9: packaging/public beta readiness. Next.

## Active slice

Batch 8 optional fake/local enrichment experiment is implemented and ready for final verification/commit. Next slice after commit: Batch 9 packaging/beta readiness docs and clean-clone verification.

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

Batch 8 added the optional fake/local enrichment experiment:

- `mergelearn-tutor enrich` compares deterministic cards with enriched wording, worked examples, and follow-up questions
- `src/core/enrichment.ts` keeps deterministic cards as the truth source and labels allowed changes as wording/worked-example/follow-up only
- fake and local providers are supported; remote provider is rejected in the local-only experiment
- no network requests are made; enrichment uses the redacted outbound preview payload
- `npm run eval:repos -- --with-enrichment fake` records enriched card count, no-network status, and provenance checks
- `docs/ENRICHMENT.md`, README, and roadmap coverage were added
- dogfood on `/home/adam/mergeLearn` produced two useful A/B enriched card previews and an enriched eval report, then scratch `.skilltrace` cleanup was verified

Next planned slice: Batch 9 packaging/beta readiness docs and clean-clone verification.
