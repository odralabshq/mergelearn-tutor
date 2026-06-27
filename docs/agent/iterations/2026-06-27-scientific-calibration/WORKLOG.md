# Scientific calibration worklog

## Start

Inputs:

- `docs/research/deep-research-report (1).md`
- `docs/research/deep-research-report(2).md`
- `docs/research/deep-research-report (3).md`
- `docs/agent/RESEARCH_SYNTHESIS_2026_06_27.md`

Decision: start with confidence-before-reveal because both substantive reports identify calibration as a high-value, low-dependency foundation.

Implementation result so far:

- Added local `revealed` review events with required 1-5 `confidenceBeforeReveal`.
- Added calibration summary pairing pre-reveal confidence with later answer correctness.
- Added `/api/calibration`, History summary, browser confidence selector, and CLI `feedback --confidence` support.
- Kept fields optional for legacy events; no state migration needed.

Focused verification passed:

```bash
npm test -- --run tests/core/events.test.ts tests/core/calibration.test.ts tests/session/server.test.ts
npm run check
```

## Independent review gate

Three scout reviews completed after Batch A was committed.

Accepted corrections:

- Report 1 reviewer confirmed answer-first, spacing, transfer tasks, and calibration as the strongest product mechanisms.
- Report 2 reviewer confirmed current eval is content QA, not learning-outcome evaluation, and that delayed probes plus active-control mode are required before public efficacy claims.
- Report 3 reviewer confirmed report 3 is only a dependency/blocker note and should not be used as substantive roadmap evidence.

Effect on next work: keep the roadmap order unchanged, but make Batch B explicit first-class delayed probe state rather than relying on `nextReviewAt` alone.

## Delayed probe implementation result so far

- Added first-class delayed probe state scheduled at 2 and 7 days after answered cards.
- Added due-probe selection and delayed completion helpers.
- Added `/api/delayed-probes`, History delayed-probe summary, and CLI `delayed list` / `delayed complete`.
- Kept `delayedProbes` optional in `TutorState` and normalized missing legacy state to an empty array.

Focused verification passed:

```bash
npm test -- --run tests/core/delayedProbes.test.ts tests/core/events.test.ts tests/session/server.test.ts tests/cli/cli.test.ts
npm run check
```

Built-server smoke passed:

```bash
npm run build
# start Review server against a temp one-card repo
# POST /answer -> schedules two delayed probes
# GET /api/delayed-probes -> scheduled=2 completed=0
# POST /api/delayed-probes/complete -> completed=1
```

Observed output:

```json
{"scheduled":2,"completed":1}
```
