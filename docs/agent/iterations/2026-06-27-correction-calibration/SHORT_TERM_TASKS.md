# Short-term batch: correction and quality calibration

Batch folder: `docs/agent/iterations/2026-06-27-correction-calibration/`

## Goal

Make user feedback change future card generation and make quality scores calibratable against real dogfood ratings.

## Why this batch now

The quality gate now makes cards measurable, but it is still static. The next highest-leverage improvement is closing the loop: when a user marks a bad card, wrong evidence, duplicate concept, or low usefulness rating, the planner should avoid repeating that failure.

## Task C1: correction-aware generation

Files to inspect first:

- `src/core/events.ts`
- `src/core/planner.ts`
- `src/core/types.ts`
- `tests/core/events.test.ts`
- `tests/core/planner.test.ts`

Acceptance:

- `marked_bad_card` and `marked_wrong_evidence` events influence future card selection or quality warnings.
- Existing `better_label`, `not_relevant`, `too_broad`, and `duplicate` corrections are respected during generation.
- Tests prove corrected/suppressed concepts do not keep resurfacing as normal ready cards.

## Task C2: rating-aware quality calibration

Files to inspect first:

- `src/core/ratings.ts`
- `src/eval/runner.ts`
- `src/eval/report.ts`
- `tests/core/ratings.test.ts`
- `tests/eval/evaluationHarness.test.ts`

Acceptance:

- Evaluation reports can show manual rating summaries next to deterministic quality summaries.
- Low manual answerability/usefulness is surfaced as calibration evidence.
- Docs explain that deterministic quality is a guardrail, while manual usefulness remains the product target.

## Task C3: quality feedback UX tightening

Files to inspect first:

- `src/session/server.ts`
- `tests/session/server.test.ts`
- latest screenshots in the quality-foundation folder

Acceptance:

- Review quality panels expose the next corrective action when warnings exist.
- Question cards remain readable despite quality panels; consider collapsed details or more compact score chips.
- Screenshot evidence proves the page is not more cluttered than the current quality-foundation version.

## Task C4: post-batch assessment

Acceptance:

- Update `docs/agent/LONG_TERM_TASKS.md` statuses.
- Update this worklog and changelog.
- Create the next short-term batch from the reassessed long-term queue.

## Verification scope

Focused checks:

```bash
npm test -- --run tests/core/events.test.ts tests/core/planner.test.ts tests/core/ratings.test.ts tests/eval/evaluationHarness.test.ts tests/session/server.test.ts
npm run check
npm run build
```

Batch-end checks:

```bash
npm run check
npm test
npm run build
npm run smoke:package
git diff --check
```

## Batch completion status

- C1 correction-aware generation: complete.
- C2 rating-aware quality calibration: complete.
- C3 quality feedback UX tightening: complete.
- C4 post-batch assessment: complete with next batch created at `../2026-06-27-evidence-extraction-hardening/SHORT_TERM_TASKS.md`.
