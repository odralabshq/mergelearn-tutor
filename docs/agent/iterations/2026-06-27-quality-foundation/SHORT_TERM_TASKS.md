# Short-term batch: quality foundation

Batch folder: `docs/agent/iterations/2026-06-27-quality-foundation/`

## Goal

Make generated learning cards measurable and gateable before more UI expansion.

## Why this batch now

The deep research report says visual polish is unsafe without content-quality evidence. The next work should prove whether cards are grounded, answerable, specific, non-duplicative, and useful enough for review.

## Task S1: card-quality module

Files:

- `src/core/cardQuality.ts`
- `src/core/types.ts`
- `tests/core/cardQuality.test.ts`

Acceptance:

- Every card can be scored deterministically.
- Scores cover evidence, answerability, specificity, duplicate risk, and source diversity.
- Tests include clearly good and clearly bad cards.

## Task S2: evaluation integration

Files:

- `src/eval/types.ts`
- `src/eval/runner.ts`
- `src/eval/report.ts`
- `tests/eval/evaluationHarness.test.ts`

Acceptance:

- Eval reports quality-ready, needs-review, blocked rates.
- Aggregate report includes bad-card and duplicate-risk metrics.
- Fixture evaluation remains reproducible.

## Task S3: planner gate

Files:

- `src/core/planner.ts`
- `tests/core/planner.test.ts`

Acceptance:

- Blocked cards do not enter active review by default.
- Needs-review cards can enter with visible warnings.
- Batch metadata remains consistent when cards are filtered.

## Task S4: browser visibility

Files:

- `src/session/server.ts`
- `tests/session/server.test.ts`

Acceptance:

- Review and Questions show quality badges/warnings.
- Screenshot captures prove current visual state.
- Browser console remains clean.

## Verification scope

Run after each task when relevant:

```bash
npm run check
npm test -- --run <focused-test>
npm run build
```

Run at batch end:

```bash
npm run check && npm test && npm run build && npm run smoke:package
```

## Batch result

Status: completed locally on `autonomous-platform-polish`.

Completed:

- S1 card-quality module.
- S2 evaluation integration.
- S3 planner gate.
- S4 browser visibility and screenshots.

Recommended next short-term batch:

1. Correction loop: make `marked_bad_card`, `marked_wrong_evidence`, suppressions, and manual ratings affect future generation.
2. Quality calibration: compare quality scores against manual ratings from real dogfood sessions.
3. Today mode: reduce Review density into a 3-card focused session.
