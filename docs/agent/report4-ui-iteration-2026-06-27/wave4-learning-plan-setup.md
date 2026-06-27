# Wave 4: Setup as Learning Plan wizard

Date: 2026-06-27
Source: `docs/agent/REPORT4_ITERATIVE_UI_BACKLOG_2026_06_27.md`

## Implemented

- Enhanced Plan Builder (`/plan`) into a guided Learning Plan wizard:
  - Added a wizard introduction explaining the full setup flow in order.
  - Kept the numbered step path (evidence, course, questions, review).
  - Added a "Skip to practice" shortcut for users who already have cards.
- Added a Quick Course Creator directly inside the plan page:
  - Users can create a course without navigating to `/courses`.
  - Same `data-action="save-course"` handler as the full form.
- Added quick links from the wizard to:
  - `/preferences` to tune question mix
  - `/timeline` to inspect evidence
  - `/questions` to review questions
  - `/practice` to start focused practice
- Kept the full Courses form at `/courses` for advanced use.
- Kept the Plan Builder's local-only guardrails and course snapshot sections.

## Why this wave matters

Report 4 identified that setup was scattered across Plan Builder, Courses, and Preferences, forcing users to navigate between pages before getting to a useful first session. The wizard brings the critical path into one page.

## Verification target

The server test asserts the Plan Builder page contains:
- `Learning plan wizard`
- `define your learning goal`
- `Quick course creator`
- `data-action="save-course"`
- `Tune question mix`

## Next wave

Wave 5: unified Map surface.