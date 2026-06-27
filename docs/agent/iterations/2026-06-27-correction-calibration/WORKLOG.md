# Correction and quality calibration worklog

## 2026-06-27 start

Branch: `autonomous-platform-polish`

Preceding batch:

- `cdbac46 feat: add deterministic card quality gates`
- Quality gate exists, evaluation metrics exist, Review/Questions quality panels exist.

Decision:

- The next platform step should close the user-feedback loop before building more UI breadth.
- Corrections and manual ratings should affect future generation before AST extraction or Today-mode polish.

Parallel scouts launched:

1. Correction-aware planner seam scout.
2. Rating/evaluation calibration scout.
3. Quality-panel UX density scout.

Open risks:

- Over-penalizing one bad-card event could hide useful concepts too aggressively.
- Manual ratings may be sparse, so calibration should summarize evidence without pretending statistical certainty.
- Questions page is already dense; further quality UI should probably collapse rather than expand.

## C1 implementation result

Implemented correction-aware generation feedback:

- `marked_wrong_evidence` on a prior card blocks regenerated cards that reuse the same evidence path.
- `marked_bad_card` on a prior card downgrades regenerated cards for that concept to `needs_review` with a visible warning.
- `marked_duplicate` raises duplicate risk and downgrades ready cards to `needs_review`.

Focused verification passed:

```bash
npm test -- --run tests/core/planner.test.ts tests/core/events.test.ts
npm run check
```

## Plan Builder slice

A separate UI slice added `/plan` as a consolidated browser path from local evidence to courses, accepted questions, and review cards.

Verification:

```bash
npm test -- --run tests/session/server.test.ts
npm run check
npm run build
```

Browser checks:

- `/plan` health check passed.
- Browser console had no JavaScript errors.
- Screenshot captured at `screenshots/20260627T091406Z/plan-builder.png`.

Visual assessment:

- Page is readable and useful as a bridge from setup to review.
- No blocking visual issue found.

## C2 implementation result

Implemented rating-aware eval calibration:

- Eval specs can now carry `manualRatings`.
- Per-repo and aggregate eval output includes manual rating count, target coverage, and per-field averages.
- Markdown reports render a `Manual rating calibration` section before per-repo details.
- Deterministic quality remains a guardrail; manual usefulness stays the product-quality target.

Focused verification passed:

```bash
npm test -- --run tests/eval/evaluationHarness.test.ts
npm run check
```
