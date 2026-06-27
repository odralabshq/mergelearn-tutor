# Interactive UI improvement brief

Date: 2026-06-27
Branch: `autonomous-platform-polish`

## Read this first

The interface should become a visual learning workbench, not just pages of cards and JSON links. The best next UI direction is an interactive map/dashboard that connects evidence, concepts, cards, confidence, delayed recall, and study condition in one navigable surface.

Recommended first implementation slice:

1. Add a Study Dashboard page with an interactive visual overview.
2. Reuse existing local data only: `/api/evidence-graph`, `/api/progress`, `/api/calibration`, `/api/delayed-probes`, and `/api/study`.
3. Show real signals, not fake engagement numbers.
4. Make graph/provenance secondary but visible: click a concept/card/study condition to focus related evidence.
5. Keep all UI local-first. No telemetry, no remote calls, no target repo execution.

Do not start with a decorative force graph. Start with a hybrid dashboard: graph lanes + heatmap/stats + drill-down details. This is more useful and easier to test.

## Product references and what to borrow

### Obsidian Graph View

Source pattern: notes as nodes and links as edges; local graph can focus around a single note and use configurable depth.

Borrow:

- local focus around one concept/card instead of always showing the full graph;
- node colors by type;
- hover/detail panel;
- depth/filter controls.

Avoid:

- graph-first homepage;
- unreadable hairball for small learning sessions.

### GitLens / Git graph

Source pattern: interactive commit/history visualization, branch relationships, authorship and code history at a glance.

Borrow:

- left-to-right provenance lane: commit/file -> concept -> question/card -> event;
- compact history lanes;
- click-through from visual node to source card/evidence.

### Anki statistics and heatmaps

Source pattern: review counts, retention tables, pass rates, future due cards, and heatmap-style habit history.

Borrow:

- due forecast for delayed probes;
- calibration/accuracy cards;
- review heatmap later, once enough event dates exist;
- clear separation between volume and retention quality.

Avoid:

- rewarding volume as if it proves learning;
- hiding low-quality retention behind streaks.

### Linear

Source pattern: crisp navigation, filtered views, projects/cycles, triage, status-first pages.

Borrow:

- a command-center layout with one obvious next action;
- filtered views for Review, Study, Due, Weak Concepts, Evidence;
- tight status labels and progress summaries.

Avoid:

- turning learning into project management jargon.

### Duolingo

Source pattern: visible progress, short sessions, streak/progress feedback, low activation energy.

Borrow:

- 3-5 minute session clarity;
- daily “next best action” strip;
- lightweight progress momentum.

Avoid:

- manipulative streak pressure;
- gamification that conflicts with honest calibration.

## Top UI concepts

1. Learning Workbench home: one page combining next review card, due delayed probes, calibration, and study condition balance.
2. Obsidian-style local concept graph: focus one concept/card, show related evidence, cards, delayed probes, and events within depth 1-2.
3. GitLens-style evidence lane: commit/file/doc -> concept -> question/card -> answer/event.
4. Anki-style retention panel: delayed probe due forecast, completion rate, calibration, and correct/missed split.
5. Study Dashboard: active recall vs passive-review assignments, completion, and later outcome comparison.
6. Weak-concept triage queue: Linear-style list grouped by needs-review, no active recall, high importance, wrong evidence.
7. Card detail drawer: why shown, source path, quality scores, correction history, delayed probes, study condition.
8. Session cockpit: “answer this next”, “complete passive control”, “do due probe”, or “generate cards” as a single next action.

## Recommended first implementation slice

Build `src/core/workbench.ts` and `/workbench`.

Core output shape:

- next action label and URL;
- counts for active cards, due delayed probes, study assignments, weak concepts;
- concept nodes with mastery/confidence/status;
- evidence/card/event links suitable for an SVG or HTML visual map;
- no new persisted state.

Browser output:

- top command strip;
- four metric cards;
- interactive filter chips for Due, Weak, Study, Evidence;
- simple SVG lane/map generated from existing data;
- detail panel populated by clicking rendered nodes.

Why this first:

- it is immediately useful;
- it uses real data that now exists;
- it creates the visual foundation before a complex force graph;
- it is easy to test with DOM markers and JSON shape.

## Data needed

Already available:

- `buildEvidenceTimeline(state)` for provenance graph nodes/edges;
- `buildProgressGraph(state)` for concept mastery/status;
- `summarizeCalibration(state)` for confidence/accuracy/Brier;
- `delayedProbeSummary(state)` and due probes;
- `studySummary(state)` and study assignments.

Small additions likely needed:

- a `buildWorkbenchSummary(state)` adapter so the UI does not assemble unrelated APIs by hand;
- stable visual node IDs and display labels;
- a focused-node selector in browser JavaScript.

## Risks

- Graph hairball: mitigate with lanes, filters, and local focus instead of full force graph first.
- Fake progress: show calibration, delayed probes, and active-control status separately from volume.
- Navigation overload: make Workbench the command center and keep specialized pages available.
- Privacy drift: no remote calls, no telemetry, no code execution.
- Visual polish without learning value: gate every widget on a real learning action or audit question.

## Verification plan

1. Unit-test `buildWorkbenchSummary` on a synthetic state with cards, delayed probes, calibration, study assignments, and weak concepts.
2. Server-test `/workbench` and `/api/workbench` markers.
3. Browser smoke the page, check console, click filters and nodes.
4. Run full verification: `git diff --check`, `npm run check`, `npm test`, `npm run build`, `npm run smoke:package`.
5. Capture screenshot after the first visual implementation slice.

## Acceptance for r8

- This brief exists and is linked from the long-term queue.
- It names industry patterns and which parts to borrow/avoid.
- It chooses one dependency-safe first implementation slice.

## Acceptance for r9 first slice

- `/workbench` exists.
- It shows real metrics and a simple interactive visual map.
- It does not introduce remote calls or new persistent schema.
- It passes tests, build, packaged smoke, and browser console check.

