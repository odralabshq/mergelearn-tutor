# Platform Evolution Worklog — 2026-06-28

Running log for P0–P4 platform evolution. Update after each phase.

## Infrastructure

- Created worklog, `TASKS_PLATFORM_EVOLUTION.md`, design doc, and `mergelearn-tutor-implementer` subagent.
- Branch: `main`

## Phase 0 — Practice queue (P0)

**Status:** in progress

**Decisions:**
- `src/core/practiceQueue.ts` owns sort (unreviewed first, batch order) and index resolution.
- `GET /api/practice/queue` exposes queue JSON; `/practice?index=N` selects card.
- Client uses `sessionStorage` for `reviewedInSession`; auto-advance navigates to `index+1` after grade.

**Commits:** (pending)

**Tests:** (pending)

## Phase 1 — Map without events; History activity list

**Status:** pending

## Phase 2 — LLM question generation

**Status:** pending

## Phase 3 — Agent skill update

**Status:** pending

## Phase 4 — Rich cards from accepted questions

**Status:** pending

## Blockers

None yet.
