# Report 4 UI iteration: complete overview

Date: 2026-06-27
Source report: `docs/research/deep-research-report (4).md`
Branch: `autonomous-platform-polish`

## Summary

All seven report-backed UI improvement waves have been implemented, verified, and committed. The platform was reorganized from eleven flat peer pages into five intent-based primary surfaces while preserving every legacy route.

## What the platform looks like now

The browser session is organized into five primary surfaces:

1. **Workbench** — interactive map of local learning nodes with semantic filters and detail drawer
2. **Practice** — focused one-card retrieval-practice loop with keyboard shortcuts
3. **Map** — unified surface for relationships, provenance, and mastery
4. **Audit** — consolidated quality view for cards, questions, study, and calibration
5. **Setup** — guided learning plan wizard with inline course creation

Every legacy route still works. Secondary navigation exposes all original pages: Review, Study, Graph, Timeline, Progress, History, Questions, Courses, and Preferences.

## Wave-by-wave summary

### Wave 1: Workbench semantic filters and detail drawer

Implemented:
- Workbench nodes now carry semantic tags: `due`, `weak`, `study`, `evidence`.
- Filter counts are based on actually visible tagged nodes.
- A detail drawer shows node details and related-page links.
- Browser dogfood verified all filters show matching nodes.

Evaluation: `README.md` (this file, original Wave 1 log below)
Screenshot: `screenshots/workbench-semantic-filters.png`

### Wave 2: Grouped primary navigation

Implemented:
- Replaced flat 11-link primary nav with five intent groups: Workbench, Practice, Map, Audit, Setup.
- Preserved all legacy routes as secondary navigation.
- Added route-to-primary active section mapping.

Evaluation: `wave2-grouped-shell.md`
Screenshot: `screenshots/wave2-grouped-shell-workbench.png`

### Wave 3: Focused one-card Practice mode

Implemented:
- Added `/practice` as the default one-card retrieval-practice loop.
- Kept confidence-before-reveal, reveal, and self-grade controls.
- Added keyboard shortcuts: 1-5 confidence, Enter reveal, Y knew it, N missed it.
- Added immediate local outcome message after grading.
- Browser dogfood verified end-to-end: reveal, answer, grade, outcome, button disabling.
- Kept legacy Review at `/` for card generation and advanced review.

Evaluation: `wave3-focused-practice.md`
Screenshot: `screenshots/wave3-focused-practice.png`

### Wave 4: Plan Builder wizard

Implemented:
- Enhanced Plan Builder into a guided Learning Plan wizard.
- Added Quick Course Creator inline on the plan page.
- Added quick links to preferences, timeline, questions, and practice.
- Kept the full Courses form at `/courses` for advanced use.

Evaluation: `wave4-learning-plan-setup.md`
Screenshot: `screenshots/wave7-final-plan.png`

### Wave 5: Unified Map surface

Implemented:
- Added `/map` as canonical Map with three modes: local-graph, provenance, skill-map.
- Mode tabs are real links (no JavaScript required).
- Legacy `/graph`, `/timeline`, `/progress` routes preserved.
- Primary Map navigation points to `/map`.

Evaluation: `wave5-unified-map.md`
Screenshots: `screenshots/wave7-final-map.png`, `wave7-final-map-provenance.png`, `wave7-final-map-skill-map.png`

### Wave 6: Audit and quality pipeline

Implemented:
- Added `/audit` as consolidated quality audit page.
- Quality pipeline section: drafts, accepted, rejected, card-quality events.
- Source audit section: broad cards, course cards, question cards, delayed probes, study, calibration.
- All badges are deterministic and computed from local state.
- Legacy `/history` and `/questions` routes preserved.
- Primary Audit navigation points to `/audit`.

Evaluation: `wave6-audit-quality.md`
Screenshot: `screenshots/wave7-final-audit.png`

### Wave 7: Final demo verification

Implemented:
- 7 full-page screenshots captured on the current build with seeded demo data.
- Evaluation documentation written.
- Root README updated to describe the five-surface platform with current screenshots.
- USER_MANUAL updated with Practice, Map, and Audit sections.
- Fresh screenshots copied to `docs/assets/screenshots/`.

Evaluation: `wave7-design-polish.md`
Screenshots: `screenshots/wave7-final-*.png`

## Final demo screenshots

All screenshots captured on `http://127.0.0.1:4197` with seeded demo data:

```
wave7-final-workbench.png
wave7-final-practice.png
wave7-final-plan.png
wave7-final-map.png
wave7-final-map-provenance.png
wave7-final-map-skill-map.png
wave7-final-audit.png
```

## Verification

Fresh full verification passed after all seven waves:

```
git diff --check
npm run check
npm test
npm run build
npm run smoke:package
```

Observed:

```
Test Files  24 passed (24)
Tests       81 passed (81)
Packaged smoke passed: mergelearn-tutor-1.0.0.tgz
Files checked: 136
```

## Implementation backlog

The full dependency-ordered backlog with task lists and acceptance criteria is in:

```text
docs/agent/REPORT4_ITERATIVE_UI_BACKLOG_2026_06_27.md
```

All seven waves are marked as implemented.

## Original Wave 1 log

The text below was the original Wave 1 evaluation log before all waves were completed. It is preserved for provenance.

---

Implemented the report's highest-priority first slice:

- Workbench nodes now expose semantic tags: `due`, `weak`, `study`, `evidence`.
- Filter chip counts are derived from visible tagged nodes, not mismatched raw node types.
- `/api/workbench` now returns node detail text and tags.
- The Workbench page now renders `data-node-tags` and `data-node-detail` attributes.
- The old one-line node detail strip is now a drawer-style detail panel with a related-page link.

### Component research decision

I did online component scouting before implementing.

Findings:
- Free/open graph options include Cytoscape.js, Sigma/Graphology, vis-network, D3, Dagre-D3, and related libraries.
- Framework-agnostic component options include Shoelace/Web Awesome-style web components, Spectrum Web Components, Lion, and other Web Component libraries.
- Vanilla-compatible command palette options include Ninja Keys and smaller MIT command-palette projects.

Decision for this slice:
- Do not add a dependency yet.
- The confirmed problem was semantic behavior, not graph rendering capability.
- Native HTML/CSS/JS keeps the local-first package small and avoids visual complexity before the interaction model is correct.

### Browser/API dogfood evidence

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