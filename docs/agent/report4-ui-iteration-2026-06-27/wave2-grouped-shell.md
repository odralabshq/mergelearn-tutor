# Wave 2: grouped shell evaluation

Date: 2026-06-27
Source: `docs/agent/REPORT4_ITERATIVE_UI_BACKLOG_2026_06_27.md`

## Implemented

- Replaced the flat 11-link primary navigation with five primary choices:
  - Workbench
  - Practice
  - Map
  - Audit
  - Setup
- Preserved all legacy routes as secondary navigation links:
  - Review cards
  - Study controls
  - Graph
  - Timeline
  - Progress
  - History
  - Questions
  - Plan Builder
  - Courses
  - Preferences
- Added active primary-section mapping so legacy routes highlight the right top-level group.
- Added secondary navigation active-state styling.

## Why this wave matters

Report 4 and the screenshot packet both identified navigation burden as the biggest UX cost after Workbench semantics. This wave reduces the main decision set from eleven peer pages to five intent-based groups without removing any route.

## Verification target

The server test asserts:

- primary navigation contains Workbench, Practice, Map, Audit, Setup;
- primary navigation does not contain Plan Builder or Courses;
- secondary navigation still exposes Plan Builder, Courses, and Questions;
- legacy route pages continue to render.

## Screenshot evidence

- `screenshots/wave2-grouped-shell-workbench.png`

Visual inspection:
- The primary nav now clearly reads as five choices.
- Secondary navigation remains understandable and preserves legacy routes.
- Remaining issue for later polish: there is still substantial vertical chrome before the actual Workbench content, though it is now better organized.

## Next wave

Wave 3: focused one-card Practice mode.
