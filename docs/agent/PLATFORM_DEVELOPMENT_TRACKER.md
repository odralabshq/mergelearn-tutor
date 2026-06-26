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

## Active slice

Batch 11 snippet-first learning UX is implemented and locally dogfooded. Public release remains blocked on human decisions for product name, license, distribution channel, and any remote enrichment approval.

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

Batch 11 changed the primary UX from concept-first questions to snippet-first code reading:

- learning cards now include `questionPlane`, `snippet`, and `explanationMarkdown`
- `today` and `review` show the code snippet path before the question
- `.skilltrace/preferences.json` configures enabled question planes, snippet length, and explanation defaults
- `mergelearn-tutor preferences show/set` and `mergelearn-tutor progress` were added
- the local website now has snippet-first review cards, `/progress`, `/preferences`, and JSON endpoints for state/progress/preferences
- the dashboard now includes snippet-first cards plus a progress map with hierarchy and SVG graph
- dogfood on a fresh demo repo and `/home/adam/mergeLearn` verified snippets, progress, preferences API/page, and scratch cleanup

Next planned slice: polish onboarding persistence/ranking from user feedback, or add richer graph interactivity with a frontend graph library if the static graph proves insufficient. Public beta/publish still requires human decisions first.
