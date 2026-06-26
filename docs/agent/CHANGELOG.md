# MergeLearn Tutor Autonomous Development Changelog

## 2026-06-26

- Created next-phase platform plan from deep research report.
- Added roadmap pointer.
- Switched to long-running autonomous iteration mode per user instruction.
- Established Batch 1 as the next implementation target: multi-repo evaluation harness and rating rubric.

## 2026-06-26 Batch 1

- Added evaluation harness types, runner, fixture repos, JSON/Markdown reporting, and `npm run eval:repos`.
- Added fixture-based evaluation tests.
- Dogfooded evaluation on `/home/adam/mergeLearn`.
- Fixed two product-quality extraction issues discovered by dogfood:
  - TypeScript language concepts no longer trigger from path hints alone.
  - Repo-domain concept labels now use inferred terms instead of evidence filenames.
- Added `docs/EVALUATION.md`.

Verified during development:

```bash
npm run check
npm test -- --run tests/core/concepts.test.ts tests/eval/evaluationHarness.test.ts
npm run eval:repos -- --fixtures --repo /home/adam/mergeLearn --since 30d --limit 30 --out eval-runs/mergelearn-dogfood
npm test
npm run build
npm run eval
npm run smoke
```

## 2026-06-26 Batch 2

- Added versioned review event and correction types.
- Added pure reducer functions for feedback events and concept corrections.
- Added backward-safe state normalization for older `.skilltrace/state.json` files without corrections.
- Added CLI commands: `feedback` and `correct`.
- Updated profile/debt renderers to surface correction counts/reasons.
- Added reducer and CLI tests.
- Dogfooded correction flow on `/home/adam/mergeLearn` scratch state and removed the scratch `.skilltrace`.
- Fixed dogfood UX issue: suppressed concepts now re-sort below active concepts and are removed from future cards.

## 2026-06-26 Batch 3

- Added a TypeScript compiler API analyzer for added diff snippets.
- Detects interfaces, type aliases, unions, generics, async/await, and React hooks.
- Integrated AST findings into concept extraction while preserving regex/path fallback.
- Cached AST findings per changed file so each file is parsed once per artifact.
- Added analyzer tests and documented the analyzer architecture.
- Evaluation remained stable: fixture expected concept hit rate 100%, MergeLearn dogfood still produced 48 concepts and 12 cards for 30 recent commits.
