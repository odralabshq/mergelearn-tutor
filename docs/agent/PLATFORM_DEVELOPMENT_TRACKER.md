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

## Active slice

Batch 9 packaging/beta readiness is implemented and locally verified. Public release remains blocked on human decisions for product name, license, distribution channel, and any remote enrichment approval.

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

Batch 9 prepared local packaging and beta-readiness without publishing:

- `package.json` now points package consumers at built artifacts (`dist/index.js`, `dist/index.d.ts`, `dist/cli.js`) and keeps release blocked with `private: true` and `UNLICENSED`
- TypeScript declaration output is generated for the package surface
- `npm run smoke:package` builds, packs to `/tmp`, verifies tarball contents, extracts the package, and runs packaged CLI help
- package contents are constrained to `dist/`, README, package metadata, and public top-level docs; source, agent state, research reports, `.autoloop`, `.skilltrace`, and eval outputs are excluded
- `docs/BETA_READINESS.md` documents local verification, clean-clone verification, dogfood, and public release blockers
- README and roadmap now point users to packaging/beta readiness and local `npm link` usage
- dogfood on `/home/adam/mergeLearn` produced five useful review cards, two fake enriched previews, and an enriched eval report with 48 concepts/12 cards/5 enriched cards; scratch `.skilltrace` cleanup was verified

Next planned slice: stop for human decisions before public beta/publish, or continue with non-release local quality work such as human-rating rubric improvements and manual UX checklist automation.
