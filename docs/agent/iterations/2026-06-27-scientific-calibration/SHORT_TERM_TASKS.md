# Short-term batch: scientific calibration foundation

Batch folder: `docs/agent/iterations/2026-06-27-scientific-calibration/`

## Goal

Turn the research reports into the first measurable product improvement: confidence-before-reveal and local calibration summaries.

## Why this batch now

Reports 1 and 2 agree that confidence calibration is central to the AI-era knowledge-debt claim. This slice is smaller and more foundational than delayed probes, active-control experiments, or transfer/debugging cards.

## Dependency-aware tasks

1. Define optional event fields for pre-reveal confidence.
2. Add a `revealed` review event that does not affect mastery.
3. Compute calibration summaries by pairing reveal-confidence events with later answer outcomes.
4. Require confidence before reveal in the browser review flow.
5. Expose the summary through API/history UI and docs.

## Acceptance

- Existing state remains compatible.
- A reveal without confidence is rejected by the event layer.
- Browser review contains explicit confidence options before reveal.
- API exposes count, average confidence, accuracy, and Brier score.
- Tests cover event metadata, calibration pairing, and session HTML/API behavior.

## Verification

```bash
npm test -- --run tests/core/events.test.ts tests/core/calibration.test.ts tests/session/server.test.ts
npm run check
npm test
npm run build
npm run smoke:package
git diff --check
```
