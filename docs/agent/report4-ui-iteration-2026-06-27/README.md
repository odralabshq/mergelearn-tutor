# Report 4 UI iteration log

Date: 2026-06-27
Source report: `docs/research/deep-research-report (4).md`
Active wave: Wave 1, Workbench semantic filters and detail drawer

## What changed in this iteration

Implemented the report's highest-priority first slice:

- Workbench nodes now expose semantic tags: `due`, `weak`, `study`, `evidence`.
- Filter chip counts are derived from visible tagged nodes, not mismatched raw node types.
- `/api/workbench` now returns node detail text and tags.
- The Workbench page now renders `data-node-tags` and `data-node-detail` attributes.
- The old one-line node detail strip is now a drawer-style detail panel with a related-page link.

## Component research decision

I did online component scouting before implementing.

Findings:
- Free/open graph options include Cytoscape.js, Sigma/Graphology, vis-network, D3, Dagre-D3, and related libraries.
- Framework-agnostic component options include Shoelace/Web Awesome-style web components, Spectrum Web Components, Lion, and other Web Component libraries.
- Vanilla-compatible command palette options include Ninja Keys and smaller MIT command-palette projects.

Decision for this slice:
- Do not add a dependency yet.
- The confirmed problem was semantic behavior, not graph rendering capability.
- Native HTML/CSS/JS keeps the local-first package small and avoids visual complexity before the interaction model is correct.

## Browser/API dogfood evidence

API check at `http://127.0.0.1:4197/api/workbench` returned semantic filters with matching tagged nodes:

```json
{
  "due": 2,
  "weak": 1,
  "study": 1,
  "evidence": 3
}
```

Browser check confirmed:

- `due` filter shows card and probe nodes.
- `weak` filter shows the weak concept node.
- `study` filter shows the study assignment node.
- `evidence` filter shows evidence-tagged nodes.
- Clicking a node populates the drawer and related-page link.
- Browser console had zero messages and zero errors.

## Screenshot evidence

- `screenshots/workbench-semantic-filters.png`

Visual inspection:
- Drawer layout is visible and coherent enough for demo.
- The main remaining visual issue is report-backed: the shell/navigation area still consumes too much vertical space before the Workbench content.
- Wave 2 should address this by grouping nav and compacting repeated shell chrome.

## Next recommended wave

Wave 2: grouped app shell and reduced top-level navigation.

Before implementing Wave 2, re-read this log and `REPORT4_ITERATIVE_UI_BACKLOG_2026_06_27.md`, then decide whether to keep legacy route links visible as secondary grouped links or move them behind dropdown/section navigation.
