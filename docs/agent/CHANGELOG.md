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
