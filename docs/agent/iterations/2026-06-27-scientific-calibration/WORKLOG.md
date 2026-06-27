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

Report 3 was a refusal/placeholder, not a synthesis. It still confirms the external synthesis agent obeyed the packet instruction not to run without reports 1 and 2.
