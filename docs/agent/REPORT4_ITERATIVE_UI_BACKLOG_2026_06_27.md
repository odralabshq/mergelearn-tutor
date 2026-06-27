# Report 4 implementation backlog

Date: 2026-06-27
Source report: `docs/research/deep-research-report (4).md`
Branch: `autonomous-platform-polish`

## Read this first

Report 4 confirms the same direction as the screenshot review packet: MergeLearn Tutor should stop feeling like 11 equally weighted admin pages and converge into a local-first learning workbench.

The recommended user loop is:

```text
Open Workbench -> follow next action -> complete focused practice -> inspect why it mattered -> leave
```

The first implementation dependency is not visual polish. It is semantic trust: Workbench filters must show the nodes they claim to show, and node clicks must open a reusable detail drawer. After that, navigation can be grouped, Review can become one-card Practice, and Map/Audit/Setup can be consolidated.

## Claims guardrail

Allowed claims:
- research-backed design direction;
- local instrumentation for calibration, delayed recall, and study comparison;
- improved interface clarity after verified UI changes.

Avoid claims:
- scientifically proven learning improvement;
- measured retention gains;
- production efficacy without completed evaluation data.

## Report-backed diagnosis

1. Navigation burden is the top UX cost: Workbench, Review, Plan Builder, Courses, Questions, Timeline, Graph, Study, History, Progress, and Preferences are peers.
2. Review is too dense for the primary retrieval-practice action.
3. Workbench is the right homepage, but its semantic filters currently mismatch node types.
4. Graph, Timeline, Progress, and History are projections of one shared evidence-to-learning model.
5. Courses should become user-facing Learning Plans.
6. Study should stay for evaluation honesty but be framed less like a research console.
7. Visualizations should answer user questions, not become decorative graph theater.

## Dependency-ordered implementation waves

### Wave 1: Workbench semantics and reusable detail drawer

Status: implemented in this iteration. Verification and dogfood evidence are in `docs/agent/report4-ui-iteration-2026-06-27/README.md`.

Tasks:
1. Add semantic tags to Workbench nodes: `due`, `weak`, `study`, `evidence`.
2. Ensure every filter with a non-zero count has visible matching nodes.
3. Add richer node detail fields: title, kind, status, description, href, tags.
4. Replace the single-line detail strip with a reusable drawer-like detail panel.
5. Add focused core tests for semantic tags and counts.
6. Add server/DOM tests for data attributes and drawer markers.
7. Browser dogfood filters and node clicks on the demo.

Acceptance:
- Due, Weak, Study, and Evidence filters show expected nodes.
- Clicking a node populates a detail panel with useful text and a navigation action.
- No remote calls, telemetry, or new persistent schema.

### Wave 2: Grouped shell and information architecture

Status: implemented in this iteration. Verification and screenshot evidence are in `docs/agent/report4-ui-iteration-2026-06-27/wave2-grouped-shell.md`.

Tasks:
1. Replace flat nav with primary groups: Workbench, Practice, Map, Audit, Setup.
2. Keep all old routes working.
3. Add route labels/subnav so users understand where old pages moved.
4. Compact the global shell and reduce repeated hero/chrome.
5. Screenshot every page and compare navigation density before/after.

Acceptance:
- New user sees five primary choices instead of eleven.
- Legacy URLs still work.
- Top nav communicates user intent, not implementation modules.

### Wave 3: One-card Practice mode

Status: implemented in this iteration. Verification and screenshot evidence are in `docs/agent/report4-ui-iteration-2026-06-27/wave3-focused-practice.md`.

Tasks:
1. Create a focused Practice route or make Review use a focused mode by default.
2. Keep confidence-before-reveal and self-grade flow intact.
3. Collapse evidence/quality details before reveal.
4. Add keyboard shortcuts for confidence/reveal/grade.
5. Show immediate post-answer outcome: calibration, probe scheduled, weak concept changed.

Acceptance:
- One primary action is visible at a time.
- Practice is faster to start than the old review page.
- Retrieval-practice instrumentation remains intact.

### Wave 4: Setup as Learning Plan wizard

Tasks:
1. Rename user-facing Courses to Learning Plans.
2. Merge Plan Builder, Courses, and most Preferences into Setup.
3. Add flow: goal -> source scope -> question mix -> draft questions -> first session.
4. Keep advanced settings accessible but secondary.

Acceptance:
- First useful session can be configured in one guided flow.
- Backend schema can remain course-based until a later migration is justified.

### Wave 5: Unified Map surface

Tasks:
1. Merge Graph, Timeline, and Progress into Map modes.
2. Add shared filters and selected-node state.
3. Add Local Graph, Provenance Lane, and Skill Map modes.
4. Move raw graph/timeline JSON into Audit/debug affordances.

Acceptance:
- User can answer: why this card, where from, what is related, what is weak.
- Visualizations share one ontology and detail drawer.

### Wave 6: Audit and quality pipeline

Tasks:
1. Turn History into filterable Audit.
2. Recast Questions as a quality pipeline: draft -> review -> accepted -> card-ready.
3. Add deterministic badges for evidence specificity, duplicate risk, answerability, broad prompt, and missing expected answer.
4. Keep raw JSON/debug links available but visually secondary.

Acceptance:
- Trust/debug surfaces stay available without polluting daily learning.

### Wave 7: Design polish and optional component adoption

Tasks:
1. Extract shared design tokens and layout grammars per mode.
2. Add honest retention/calibration panels.
3. Consider free/open components only where they reduce custom code.
4. Re-capture screenshots and compare against the packet baseline.

Acceptance:
- UI feels professional and distinct per mode.
- No fake progress, decorative metrics, or privacy drift.

## Periodic evaluation loop

After each wave:

1. Re-read this backlog and mark completed items.
2. Run focused tests for changed logic.
3. Run full verification: `git diff --check`, `npm run check`, `npm test`, `npm run build`, `npm run smoke:package`.
4. Start or refresh the local demo.
5. Browser dogfood the affected pages and check console errors.
6. Capture at least one screenshot if visual layout changed.
7. Update the backlog with findings and the next wave.
8. Commit only after verification passes.

## Component research notes

Current repo is framework-free TypeScript plus server-rendered HTML/CSS, with only `commander` as a runtime dependency. Prefer native HTML/CSS/SVG first.

Potential future free/open options:
- Shoelace/Web Awesome-style web components for framework-agnostic polished controls.
- Spectrum Web Components or Lion for design-system-grade custom elements, if dependency size is acceptable.
- Cytoscape.js, Sigma.js/Graphology, vis-network, D3, or Dagre-D3 for later Map work, but only after the local-focus model is stable.
- Ninja Keys or similar MIT command-palette components for keyboard-driven navigation, if command palette becomes a real need.

Default decision for now:
- Do not add a UI dependency in Wave 1.
- Use semantic HTML, CSS, and lightweight inline JS until component value clearly exceeds dependency cost.

