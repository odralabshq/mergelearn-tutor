# Wave 3: focused Practice evaluation

Date: 2026-06-27
Source: `docs/agent/REPORT4_ITERATIVE_UI_BACKLOG_2026_06_27.md`

## Implemented

- Added `/practice` as the focused one-card learning loop.
- Changed primary Practice navigation to `/practice` while preserving legacy Review at `/`.
- Kept confidence-before-reveal, reveal, and self-grade controls intact.
- Moved card quality/evidence details behind a reveal-time details block.
- Added keyboard shortcuts:
  - `1`-`5`: choose confidence
  - `Enter`: reveal
  - `Y`: mark knew it
  - `N`: mark missed it
- Added an immediate local outcome message after grading.

## Why this wave matters

Report 4 identified the legacy Review page as too dense for the core retrieval-practice loop. `/practice` gives the learner one card, one answer, and one grade while keeping the queue page available for generation and advanced review.

## Verification target

The server test asserts:

- `/practice` renders Focused Practice.
- The page contains exactly one recall card.
- Confidence-before-reveal and self-grade controls are present.
- The local outcome panel and keyboard shortcut instructions are present.

## Browser dogfood

Verified on `http://127.0.0.1:4197/practice`:

- Page loaded with one focused recall card.
- `itemId=item_auth`.
- Typed answer.
- Selected confidence 4 (High).
- `POST /feedback` reveal succeeded (`ok: true`).
- `POST /answer` correct grade persisted (`ok: true`).
- Card marked `.completed`.
- Card state text became `knew it`.
- All five grade buttons disabled.
- Outcome panel populated:
  Outcome saved locally: confidence can be paired with correctness, delayed probes are scheduled after answered cards, and weak-concept estimates update from this grade.

## Screenshot evidence

- `screenshots/wave3-focused-practice.png`

## Next wave

Wave 4: Setup as Learning Plan wizard.
