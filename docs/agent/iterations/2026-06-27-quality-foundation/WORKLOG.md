# Quality foundation worklog

## 2026-06-27 start

Branch: `autonomous-platform-polish`

Inputs:

- `docs/research/deep-research-report.md`
- `docs/research/2026-06-27-next-improvements/`
- current local app at `http://127.0.0.1:4197`

Decision:

- Prioritize evaluation and deterministic card quality before more UI breadth.
- Keep local web UI work secondary until quality metrics exist.

Parallel scouts launched:

1. Evaluation/card-quality harness scout.
2. Review/Questions UI insertion-point scout.
3. Concept extraction/correction-loop dependency scout.

Current short-term batch:

- S1 card-quality module.
- S2 evaluation integration.
- S3 planner gate.
- S4 browser visibility.

Current dependencies:

- S2 depends on S1 quality result shape.
- S3 depends on S1 scoring thresholds.
- S4 depends on S1 quality result shape and S3 integration.

Verification rule:

- Each slice needs focused tests and typecheck.
- UI slices need screenshot evidence and browser console/API checks.

Open repo hygiene note:

- User moved the canonical deep research report to `docs/research/deep-research-report.md`.
- Old tracked typo path `docs/reserach/deep-research-report (2).md` is deleted locally.
- The Windows `Zone.Identifier` sidecar was removed as non-source metadata.

## 2026-06-27 implementation results

S1 card-quality module:

- Added `src/core/cardQuality.ts`.
- Added deterministic verdicts: `ready`, `needs_review`, and `blocked`.
- Added score dimensions: evidence, answerability, specificity, duplicate risk, and source diversity.
- Added focused tests in `tests/core/cardQuality.test.ts`.

S2 evaluation integration:

- Evaluation reports now aggregate ready/needs-review/blocked rates.
- Reports include average duplicate risk and average card-quality score.
- Fixture harness tests assert the new aggregate metrics.

S3 planner gate:

- Generated cards now carry a `quality` result.
- `blocked` cards are filtered out of active review.
- Batch metadata remains valid even if filtering produces fewer cards than requested.

S4 browser visibility:

- Review cards show quality badges and score panels.
- Question-bank entries show quality badges and score panels before accept/reject decisions.
- Browser console check passed on Review and Questions.

Screenshot evidence:

- `screenshots/20260627T085149Z/review-quality-gate.png`
- `screenshots/20260627T085149Z/questions-quality-gate.png`

Visual assessment:

- Quality panels are visible and readable.
- No blocking visual issue found.
- Follow-up UI polish: Question cards are now information-dense; a later Today/Plan Builder pass should reduce default density.

Final verification passed:

```bash
npm run check
npm test
npm run build
npm run smoke:package
git diff --check
```

Observed full-suite result:

- 19 test files passed.
- 60 tests passed.
- Package smoke passed with 121 files checked.

