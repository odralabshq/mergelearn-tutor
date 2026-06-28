# Platform evolution worklog — 2026-06-28

## Learning Path DAG (`feature/learning-path-dag`)

**Goal:** Visualize concept prerequisite/parent relationships as a DAG with recommended study order and mastery-colored nodes.

**Delivered:**

- `src/core/learningPath.ts` — filters `buildProgressGraph` to DAG edges, course scope, topological sort with cycle detection
- `GET /learning-path`, `GET /path`, `GET /api/learning-path`
- Cytoscape + dagre CDN page with accessibility ordered list fallback
- Map subnav link "Learning path"
- Tests in `tests/core/learningPath.test.ts` and extended `tests/session/server.test.ts`

**Design:** `docs/agent/design/2026-06-28-learning-path-dag.md`

**Demo:** `node dist/cli.js session --repo /tmp/mergelearn-main-demo --port 4198` → http://127.0.0.1:4198/learning-path
## Merged to main (2026-06-28)

- Fast-forward merge `feature/learning-path-dag` → `main` at `61e5c07`.
- `npm run check`, `npm test` (106 tests), `npm run build` green.
- Refreshed all `docs/assets/screenshots/*.png` via `scripts/refresh-docs-screenshots.sh` (demo seed `/tmp/mergelearn-main-demo`, session port 4197).
