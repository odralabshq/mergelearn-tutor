# Wave 5: Unified Map surface

Date: 2026-06-27
Source: `docs/agent/REPORT4_ITERATIVE_UI_BACKLOG_2026_06-27.md`

## Implemented

- Added `/map` as the canonical unified Map surface with three modes:
  - `local-graph` (default): relationships between concepts, cards, and evidence
  - `provenance`: chronological evidence timeline
  - `skill-map`: mastery and progress
- Mode tabs are rendered as links so they work without JavaScript.
- Each mode reuses the existing page renderer for that content type:
  - local-graph: `renderGraphHtml`
  - provenance: `renderTimelineHtml`
  - skill-map: `renderProgressHtml`
- Updated primary Map navigation to point to `/map`.
- Updated secondary navigation to expose Map modes as direct links:
  - Local graph
  - Provenance lane
  - Skill map
  - Legacy graph/timeline/progress links preserved.
- Updated `primaryNavHref` so `/map`, `/graph`, `/timeline`, and `/progress` all highlight Map.
- Kept all legacy routes (`/graph`, `/timeline`, `/progress`) working independently.

## Why this wave matters

Report 4 identified Graph, Timeline, and Progress as three separate peer pages answering different questions with different visual grammars. The unified Map surface combines them under one primary entry point with shared mode switching, while preserving the legacy routes.

## Verification target

The server test asserts:
- `/map` renders the unified Map shell with all three mode tabs.
- `/map?mode=provenance` contains provenance/timeline content.
- `/map?mode=skill-map` contains skill/progress content.
- Primary navigation links to `/map`.

## Next wave

Wave 6: Audit and quality pipeline.