# Platform Evolution Worklog — 2026-06-28

Running log for P0–P4 platform evolution. Update after each phase.

## Infrastructure

- Created worklog, TASKS_PLATFORM_EVOLUTION.md, design doc, and mergelearn-tutor-implementer subagent.
- Branch: main

## Phase 0 — Practice queue (P0)

**Status:** complete

**Decisions:**
- src/core/practiceQueue.ts owns sort (unreviewed first, batch order) and index resolution.
- GET /api/practice/queue exposes queue JSON; /practice?index=N selects card.
- Client uses sessionStorage for reviewedInSession; auto-advance navigates to index+1 after grade.

**Commits:** bf875cf — fix: practice queue with prev/next and auto-advance

**Tests:** vitest — 97 tests passed (full suite)

## Phase 1 — Map without events; History activity list

**Status:** complete

**Commits:** fc4d41f — feat: scoped map without events and history activity list

**Tests:** vitest — 97 tests passed (full suite)

## Phase 2 — LLM question generation

**Status:** complete

**Commits:** fa18cf3 — feat: remote LLM question drafting with privacy gates

**Tests:** vitest — 97 tests passed (full suite)

## Phase 3 — Agent skill update

**Status:** complete

**Commits:** b425b8e — docs: extend mergelearn-tutor skill for LLM judge-and-promote

**Tests:** vitest — 97 tests passed (full suite)

## Phase 4 — Rich cards from accepted questions

**Status:** complete

**Commits:** 5a0d991 — feat: split short answer and deep explanation on practice cards

**Tests:** vitest — 97 tests passed (full suite)

## Summary

- Tracking commit: 0371f9b — chore: add platform evolution tracking and implementer subagent
- All phases P0–P4 shipped on main; npm test — 97 tests passed.

## Practice fixes — learn-more + queue advance (2026-06-28)

**Status:** complete

**Root cause (same cards):** After grading, `sortPracticeQueue` moves the card to the end of the queue (globally reviewed). Auto-advance used `index + 1`, so the next page often landed on the card just reviewed (e.g. queue `[B, A]` at index 1 shows `A` again). Cards were distinct in state; repetition was a navigation bug, not duplicate generation. Many cards from the same concept still share similar titles/snippets by design.

**Fixes:**
- `advancePracticeQueue` navigates with `?reviewed=` only (no index); server resolves next unreviewed via `resolvePracticeIndex`.
- `resolvePracticeIndex` skips session-reviewed cards even when an explicit index is requested.
- Learn more: lightweight `renderMarkdownHtml` (no new dep), styled panel, Copy button for raw markdown.
- Practice header shows card id, concept id, and queue position.

**Tests:** vitest — practiceQueue, markdownHtml, server learn-more/advance coverage

## Blockers

None.
