# Wave 6: Audit and quality pipeline

Date: 2026-06-27
Source: `docs/agent/REPORT4_ITERATIVE_UI_BACKLOG_2026_06-27.md`

## Implemented

- Added `/audit` as a consolidated audit page combining History and Questions quality views.
- The Audit page has two main sections:
  - Quality pipeline: drafts, accepted, rejected, card-quality events
  - Source audit: broad repo cards, course cards, accepted-question cards, delayed probes, study assignments, calibrated answers
- All badges are deterministic and computed from local state.
- Updated primary Audit navigation to point to `/audit`.
- Updated secondary navigation to expose Audit overview, History, and Questions as peer links.
- Updated `primaryNavHref` so `/audit`, `/history`, and `/questions` all highlight Audit.
- Kept legacy `/history` and `/questions` routes working independently.

## Why this wave matters

Report 4 identified History and Questions as separate peer pages that both answered quality questions with different visual grammars. The unified Audit surface combines them under one quality-focused lens with deterministic badges.

## Verification target

The server test asserts:
- `/audit` renders the unified Audit page.
- Quality pipeline section exists.
- Source audit section exists.
- Primary navigation links to `/audit`.

## Next wave

Wave 7: final visual polish, honest retention/calibration panels, screenshots, demo verification.