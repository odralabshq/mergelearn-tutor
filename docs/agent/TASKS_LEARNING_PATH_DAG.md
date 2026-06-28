# Learning Path DAG — Task List

Status: **merged to `main`** (2026-06-28)

## Design & docs

- [x] Create `docs/agent/design/2026-06-28-learning-path-dag.md`
- [x] Create this task list
- [x] Append worklog entry
- [x] Design review section in design doc

**Verify:** Design doc covers routes, API, data source, UI, out of scope, acceptance criteria.

## Core module

- [x] `src/core/learningPath.ts` — `buildLearningPathGraph`, `topologicalOrder`, course filter, cycle handling

**Verify:** `npm test -- tests/core/learningPath.test.ts`

## Server wiring

- [x] `GET /api/learning-path` in `src/session/server.ts`
- [x] `GET /learning-path` and `GET /path` HTML routes
- [x] `renderLearningPathHtml` with Cytoscape CDN, legend, course selector, ordered list
- [x] Nav: "Learning path" in Map subnav
- [x] CSS for graph container and legend in `style()`

**Verify:** `npm test -- tests/session/server.test.ts` includes learning-path assertions

## Tests

- [x] `tests/core/learningPath.test.ts` — topo sort, cycle, course filter, API shape
- [x] `tests/session/server.test.ts` — HTML has cytoscape, API returns JSON

**Verify:** `npm test`

## Quality

- [x] Empty state (0 concepts) — no crash, helpful copy
- [x] Mastery colors match skill-map semantics
- [x] Mobile: scrollable container min-height 480px

**Verify:** Manual demo on port 4198

## Agent skill

- [x] Update `.cursor/skills/mergelearn-tutor/reference.md`

## Final verification

```bash
wsl bash -lic 'cd /home/adam/mergelearn-tutor && npm run check && npm test && npm run build'
```

- [x] All commands exit 0
- [x] Demo documented in design doc DEMO section

## Post-merge

- [x] Merge `feature/learning-path-dag` into `main`
- [x] Refresh `docs/assets/screenshots/` including `learning-path.png`
- [x] Update README, USER_MANUAL, REVIEW_SESSION, agent skill
