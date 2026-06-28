# Learning Path DAG

**Date:** 2026-06-28  
**Branch:** `feature/learning-path-dag`  
**Status:** Implemented (v1)

## User goals

1. **DAG visualization** — See concept prerequisites and parent relationships as a directed acyclic graph (when possible), not the full progress graph with `related` edges.
2. **Learning order** — Get a recommended study sequence derived from prerequisite/parent edges (topological sort).
3. **Mastery colors** — Nodes colored by progress status: new (gray), learning (yellow), confident (green), needs_review (red), matching skill-map semantics.
4. **Course scope** — Filter the graph to one course's concepts when `?course=<id>` is set.

## Why Cytoscape.js + cytoscape-dagre

- **Vanilla JS** — No React/Vue; fits the existing server-rendered HTML in `src/session/server.ts`.
- **DAG layout** — `cytoscape-dagre` provides top-to-bottom hierarchical layout for prerequisite chains.
- **CDN delivery** — Scripts loaded from jsDelivr in `pageShell` head extras; no `package.json` dependency churn.
- **Interactive** — Pan/zoom, click handlers for navigation to practice.

Alternatives considered: D3 force layout (harder to keep DAG readable), Mermaid (static, less interactive), custom SVG (duplicate of existing graph-map work).

## Routes

| Route | Purpose |
|-------|---------|
| `GET /learning-path` | Primary HTML page with Cytoscape graph |
| `GET /path` | Alias redirect-equivalent handler (same page) |
| `GET /api/learning-path?course=<optional>` | JSON: `{ nodes, edges, recommendedOrder, summary, cycleDetected?, cycleNodes? }` |

Query param `course` scopes to a `LearningCourse.id`.

## API shape

```json
{
  "nodes": [{ "id", "label", "status", "mastery", "kind" }],
  "edges": [{ "from", "to", "type": "parent" | "prerequisite" }],
  "recommendedOrder": ["concept.a", "concept.b"],
  "summary": { "new": 0, "learning": 1, "confident": 2, "needs_review": 0 },
  "cycleDetected": false,
  "cycleNodes": [],
  "courseId": "optional"
}
```

## Data source

- `buildProgressGraph` from `src/core/progress.ts`
- Filter edges to `prerequisite` + `parent` only; exclude `related` and `group` from ordering
- Nodes: concept nodes only (exclude `group.*`)
- Course filter logic in `buildLearningPathGraph`:
  1. If `course.conceptIds` non-empty → use those
  2. Else → concepts referenced by course questions/cards
  3. Else → all progress concept nodes

## Topological sort

- Kahn's algorithm on in-degree from `prerequisite` + `parent` edges (`from` → `to` means `from` before `to`)
- On cycle: `cycleDetected: true`, `cycleNodes` lists involved nodes, `recommendedOrder` returns maximal partial order

## UI

- Cytoscape container `#learning-path-cy`, min-height 480px, scrollable on mobile
- Dagre layout `rankDir: TB`
- Mastery legend (four status chips)
- Course selector (when courses exist)
- Ordered list below graph (`<ol>`) as accessibility fallback for recommended sequence
- Node click → `/practice` if active card exists for concept, else `/map?mode=skill-map`

## CDN scripts (in page head)

- `cytoscape@3.30.2`
- `dagre@0.8.5`
- `cytoscape-dagre@2.5.0`

## Out of scope (v1)

- Editing prerequisites from the UI
- Multi-course overlay on one graph
- Spaced-repetition scheduling integration
- Export PNG/SVG
- Real-time WebSocket updates

## Design review

### Risks

| Risk | Mitigation |
|------|------------|
| Cycles in user-defined prerequisites | Detect gracefully; show warning banner; partial order + cycle node highlight |
| Large graphs (>50 nodes) | Course filter; empty-state copy; cytoscape `minZoom`/`maxZoom` |
| CDN unavailable offline | Accessibility list still works; note in demo that graph needs network for first load |
| Mobile overflow | `overflow: auto` wrapper, min-height 480px |

### Alternatives rejected

- **npm bundle** — Adds build step; CDN preferred for v1
- **Include `related` edges** — Clutters DAG; excluded from ordering per spec
- **Single `/map` mode tab only** — Dedicated route clearer for deep links and API

### Acceptance criteria

- [x] `GET /learning-path` returns HTML with cytoscape CDN scripts and `#learning-path-cy`
- [x] `GET /api/learning-path` returns valid JSON matching shape above
- [x] Topological order respects prerequisites (auth before tests in fixture)
- [x] Cycle detection returns `cycleDetected: true` for cyclic fixture
- [x] Course filter limits nodes to course scope
- [x] Zero concepts shows empty state without JS errors
- [x] Nav link "Learning path" visible under Map subnav
- [x] `npm run check && npm test && npm run build` pass

## Demo

**Repo:** `/tmp/mergelearn-main-demo` (or any ingested repo with concepts)

```bash
cd /home/adam/mergelearn-tutor
npm run build
node dist/cli.js session --repo /tmp/mergelearn-main-demo --port 4198
```

**URL:** http://127.0.0.1:4198/learning-path

**Steps:**

1. Open the URL — hero shows concept count and recommended order list.
2. Use course chips (if courses exist) to scope the graph.
3. Pan/zoom the DAG; nodes are color-coded by mastery.
4. Click a node — navigates to practice (if card exists) or skill map.
5. Open http://127.0.0.1:4198/api/learning-path for raw JSON.

**Expected:** TB-directed graph, ordered list matches topological sort, legend matches skill-map colors.
