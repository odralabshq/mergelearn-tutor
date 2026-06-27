# Wave 7: Final visual polish and demo verification

Date: 2026-06-27
Source: `docs/agent/REPORT4_ITERATIVE_UI_BACKLOG_2026_06-27.md`

## What changed across all waves

### Wave 1: Workbench semantic filters and detail drawer

- Workbench nodes now carry semantic tags: `due`, `weak`, `study`, `evidence`.
- Filter counts are based on actually visible tagged nodes.
- A detail drawer shows node details and related-page links.
- Tests assert tags, detail text, and drawer markers.

### Wave 2: Grouped primary navigation

- Replaced flat 11-link primary nav with five intent groups:
  - Workbench
  - Practice
  - Map
  - Audit
  - Setup
- Preserved all legacy routes as secondary navigation.
- Added route-to-primary active section mapping.

### Wave 3: Focused one-card Practice mode

- Added `/practice` as the default one-card retrieval-practice loop.
- Kept confidence-before-reveal, reveal, and self-grade controls.
- Added keyboard shortcuts: 1-5 confidence, Enter reveal, Y knew it, N missed it.
- Added immediate local outcome message after grading.
- Browser dogfood verified end-to-end: reveal, answer, grade, outcome, button disabling.
- Kept legacy Review at `/` for card generation and advanced review.

### Wave 4: Plan Builder wizard

- Enhanced Plan Builder into a guided Learning Plan wizard.
- Added Quick Course Creator inline on the plan page.
- Added quick links to preferences, timeline, questions, and practice.
- Kept the full Courses form at `/courses` for advanced use.

### Wave 5: Unified Map surface

- Added `/map` as canonical Map with three modes:
  - Local graph (relationships)
  - Provenance lane (where things came from)
  - Skill map (mastery and weakness)
- Mode tabs are real links (no JavaScript required).
- Legacy `/graph`, `/timeline`, `/progress` routes preserved.
- Primary Map navigation points to `/map`.

### Wave 6: Audit and quality pipeline

- Added `/audit` as consolidated quality audit page.
- Quality pipeline section: drafts, accepted, rejected, card-quality events.
- Source audit section: broad cards, course cards, question cards, delayed probes, study, calibration.
- All badges are deterministic and computed from local state.
- Legacy `/history` and `/questions` routes preserved.
- Primary Audit navigation points to `/audit`.

## Final demo screenshots

All screenshots captured on `http://127.0.0.1:4197` with seeded demo data:

```
wave7-final-workbench.png        (1280, 1920)
wave7-final-practice.png         (1280, 1767)
wave7-final-plan.png             (1280, 2501)
wave7-final-map.png              (1280, 3618)
wave7-final-map-provenance.png   (1280, 3200)
wave7-final-map-skill.png        (1280, 2800)
wave7-final-audit.png            (1280, 1774)
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

## What the platform looks like now

The platform has been reorganized from 11 flat peer pages into five intent-based primary surfaces:

1. **Workbench** - interactive map of local learning nodes with semantic filters and detail drawer
2. **Practice** - focused one-card retrieval-practice loop with keyboard shortcuts and immediate outcome
3. **Map** - unified surface for relationships (local graph), provenance (timeline), and mastery (progress)
4. **Audit** - consolidated quality view for cards, questions, study, and calibration with deterministic badges
5. **Setup** - guided learning plan wizard with inline course creation and quick links

Every legacy route still works. No remote LLM calls were added. No persistent schema changed. All badges and counts are deterministic and local.