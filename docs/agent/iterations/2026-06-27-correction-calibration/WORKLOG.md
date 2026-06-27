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
