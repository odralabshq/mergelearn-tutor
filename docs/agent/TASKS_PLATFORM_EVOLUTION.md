# Platform Evolution Tasks — 2026-06-28

Checkbox task list per phase. Update after each phase completes.

## Infrastructure

- [x] Worklog: `docs/agent/worklog/2026-06-28-platform-evolution.md`
- [x] Task list: this file
- [x] Design doc: `docs/agent/design/2026-06-28-platform-evolution.md`
- [x] Subagent: `.cursor/agents/mergelearn-tutor-implementer.md`

## Phase 0 — Practice queue (P0)

- [ ] `src/core/practiceQueue.ts` — sort + index resolution
- [ ] `GET /api/practice/queue` API
- [ ] `/practice` prev/next footer, position, progress bar
- [ ] Auto-advance after `/answer` or grade `/feedback`
- [ ] Tests: queue API, practice HTML prev/next, advance behavior
- [ ] Verify: `npm run check && npm test && npm run build`
- [ ] Commit: `fix: practice queue with prev/next and auto-advance`

**Test criteria:** vitest passes; practice page shows position and navigation; grading advances index.

## Phase 1 — Map without events; History activity list

- [ ] `buildEvidenceTimeline(state, { includeEvents: false })` default for map
- [ ] Map course filter `?course=<id>`
- [ ] Text wrap CSS for graph nodes
- [ ] History: paginated `learningEvents` activity list with type filter
- [ ] Events excluded from map SVG/lanes
- [ ] Tests: timeline flag, history rows, map course filter
- [ ] Commit: `feat: scoped map without events and history activity list`

**Test criteria:** timeline with `includeEvents: false` has no event nodes; history shows filterable event rows; map respects course param.

## Phase 2 — LLM question generation

- [ ] `src/core/llmClient.ts` — OpenAI-compatible fetch wrapper
- [ ] Remote path in `draftQuestionsForCourse` with privacy gates
- [ ] `shortAnswer`, `deepExplanation` on `QuestionBankEntry`
- [ ] CLI + `POST /api/questions/draft` support `provider: "remote"`
- [ ] Tests: mock client, consent gates, plane validation
- [ ] Commit: `feat: remote LLM question drafting with privacy gates`

**Test criteria:** remote blocked without consent; works with mocked client + consent; plane validated.

## Phase 3 — Agent skill update

- [ ] Update `SKILL.md` and `reference.md` — LLM draft → judge → bulk accept → cards
- [ ] Document new API endpoints
- [ ] Commit: `docs: extend mergelearn-tutor skill for LLM judge-and-promote`

## Phase 4 — Rich cards from accepted questions

- [ ] `buildLearningItems()` uses `shortAnswer` + `deepExplanation`
- [ ] Practice/Review UI: short answer + expandable "Learn more"
- [ ] `cardQuality.ts` checks deep explanation for LLM questions
- [ ] Tests: card generation inherits fields; UI learn-more section
- [ ] Commit: `feat: split short answer and deep explanation on practice cards`

**Test criteria:** cards inherit question fields; practice HTML contains learn-more; cardQuality warns on empty deep explanation.
