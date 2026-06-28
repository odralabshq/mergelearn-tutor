# Platform Evolution Tasks — 2026-06-28

Checkbox task list per phase. Update after each phase completes.

## Infrastructure

- [x] Worklog: docs/agent/worklog/2026-06-28-platform-evolution.md
- [x] Task list: this file
- [x] Design doc: docs/agent/design/2026-06-28-platform-evolution.md
- [x] Subagent: .cursor/agents/mergelearn-tutor-implementer.md

## Phase 0 — Practice queue (P0)

- [x] src/core/practiceQueue.ts — sort + index resolution
- [x] GET /api/practice/queue API
- [x] /practice prev/next footer, position, progress bar
- [x] Auto-advance after /answer or grade /feedback
- [x] Tests: queue API, practice HTML prev/next, advance behavior
- [x] Verify: npm run check && npm test && npm run build
- [x] Commit: fix: practice queue with prev/next and auto-advance (bf875cf)

**Test criteria:** vitest passes (97 tests); practice page shows position and navigation; grading advances index.

## Phase 1 — Map without events; History activity list

- [x] buildEvidenceTimeline(state, { includeEvents: false }) default for map
- [x] Map course filter ?course=<id>
- [x] Text wrap CSS for graph nodes
- [x] History: paginated learningEvents activity list with type filter
- [x] Events excluded from map SVG/lanes
- [x] Tests: timeline flag, history rows, map course filter
- [x] Commit: feat: scoped map without events and history activity list (fc4d41f)

**Test criteria:** timeline with includeEvents: false has no event nodes; history shows filterable event rows; map respects course param.

## Phase 2 — LLM question generation

- [x] src/core/llmClient.ts — OpenAI-compatible fetch wrapper
- [x] Remote path in draftQuestionsForCourse with privacy gates
- [x] shortAnswer, deepExplanation on QuestionBankEntry
- [x] CLI + POST /api/questions/draft support provider: remote
- [x] Tests: mock client, consent gates, plane validation
- [x] Commit: feat: remote LLM question drafting with privacy gates (fa18cf3)

**Test criteria:** remote blocked without consent; works with mocked client + consent; plane validated.

## Phase 3 — Agent skill update

- [x] Update SKILL.md and reference.md — LLM draft → judge → bulk accept → cards
- [x] Document new API endpoints
- [x] Commit: docs: extend mergelearn-tutor skill for LLM judge-and-promote (b425b8e)

## Phase 4 — Rich cards from accepted questions

- [x] buildLearningItems() uses shortAnswer + deepExplanation
- [x] Practice/Review UI: short answer + expandable Learn more
- [x] cardQuality.ts checks deep explanation for LLM questions
- [x] Tests: card generation inherits fields; UI learn-more section
- [x] Commit: feat: split short answer and deep explanation on practice cards (5a0d991)

**Test criteria:** cards inherit question fields; practice HTML contains learn-more; cardQuality warns on empty deep explanation.

## Completion

- [x] All phases P0–P4 complete on main
- [x] Full suite: 97 tests passed (vitest)
