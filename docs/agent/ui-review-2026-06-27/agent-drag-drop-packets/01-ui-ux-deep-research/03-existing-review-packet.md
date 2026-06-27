# Frontend/UI review packet

Date: 2026-06-27
Scope: current MergeLearn Tutor browser UI on local demo `http://127.0.0.1:4197`
Primary evidence: `contact-sheet.png` and the exact screenshot files listed in `screenshot-index.tsv`

## Read this first

The platform has strong product substance now: active recall, confidence calibration, delayed recall probes, study controls, progress tracking, and evidence provenance. The UI shows those capabilities, but it still feels like a collection of admin pages rather than one intuitive learning product.

My recommendation is to reorganize the frontend around a single “Learning Workbench” command center with contextual modes. Workbench should be the default home, Review should become a focused session surface, Graph/Timeline/History should become evidence and audit modes, and Courses/Questions/Preferences should become setup flows rather than equal top-level destinations.

The biggest design risk is adding more visual components without reducing navigation burden. The next UI wave should not add another page. It should consolidate, visualize, and guide.

## Evidence captured

- Contact sheet: `contact-sheet.png`
- Page notes: `page-functionality.md`
- Screenshot index: `screenshot-index.tsv`
- Full-page screenshots directory: `screenshots/` with exact filenames listed in `screenshot-index.tsv`

## Overall judgment

The current UI is functional, coherent, and visually consistent. It has a credible dark developer-tool aesthetic. However, it is not yet intuitive enough for a user who does not already understand the product internals.

Current feel:
- local-first developer learning dashboard;
- many useful pieces;
- visually consistent;
- somewhat dense and same-looking;
- too many top-level pages;
- page names reflect implementation areas more than user intent.

## Major findings

### 1. Navigation is too flat

Every page is currently promoted equally in the top nav:

- Workbench
- Review
- Plan Builder
- Courses
- Questions
- Timeline
- Graph
- Study
- History
- Progress
- Preferences

That makes the product feel complex before the user starts. Most users need a smaller mental model:

1. What should I do now?
2. What am I learning?
3. Why was this generated?
4. How am I doing?
5. How do I configure it?

Recommended nav groups:

- Workbench: default command center.
- Practice: Review, delayed probes, study assignments.
- Map: concepts, graph, provenance, progress.
- Audit: history, raw evidence, generated questions.
- Setup: courses, preferences, source settings.

### 2. The app shell consumes too much vertical attention

The shared shell is useful, but each page repeats a large title, nav, snapshot cards, hero, stats, and panel stack. On dense pages like Review and History, the actual task starts too far down.

Recommendation:

- Keep top nav compact and sticky only if it does not obscure content.
- Collapse the plan snapshot into a slimmer status strip.
- On task pages, put the primary action above all secondary context.

### 3. The visual language is consistent but too uniform

Most pages use the same dark cards, rounded panels, blue pills, and metric cards. This creates cohesion, but it also makes pages hard to distinguish.

Recommendation:

- Give each mode a distinct layout pattern:
  - Review: focused card/session layout.
  - Workbench: dashboard + visual map.
  - Map: graph/lane canvas.
  - Audit: event timeline.
  - Setup: wizard/checklist.
- Use color for state, not decoration.

### 4. The Workbench is the right direction, but its map should become more semantic

Workbench is the best current candidate for the platform home. It already combines next action, due probes, weak concepts, study state, and a visual node area.

But the map is currently a grid of cards. It should evolve into a hybrid visualization:

- top: next-action command strip;
- middle: interactive learning map;
- bottom/right: detail drawer;
- filters: semantic states, not raw page concepts.

Confirmed current issue:

- Clicking `Due probes`, `Weak concepts`, or `Evidence links` in the seeded demo hides all nodes.
- Only `Study controls` leaves a visible node.
- This happens because filter labels describe semantic states, but nodes are typed as `concept`, `card`, `event`, and `study`.

This should be fixed before building more on the Workbench filter model.

### 5. Existing visualizations should be unified

Timeline, Graph, Progress, Workbench, Study, and History all visualize parts of the same learning system. They should not feel like separate products.

Recommended unified model:

```text
Evidence source -> Concept -> Card/Question -> Review event -> Probe/Progress
```

Use this as the shared visual grammar:

- node = source, concept, card, event, probe, study assignment;
- edge = generated from, teaches, answered, scheduled, completed;
- color = status or risk;
- size = importance or due pressure;
- click = open detail drawer.

### 6. Review needs a stronger session flow

Review is the product’s core action, but it currently competes with metadata panels. The best interface should feel like a short, guided practice session.

Recommended Review flow:

1. Question and source snippet.
2. User answer.
3. Confidence selector.
4. Reveal explanation.
5. Self-grade.
6. Immediate “what happens next” feedback: calibration updated, delayed probes scheduled, weak concept changed.

Hide secondary panels until after the answer, or put them in an expandable side drawer.

## Recommended information architecture

### Primary navigation

Use 5 top-level areas instead of 11 equal pages:

1. Workbench
   - next action
   - status overview
   - interactive map
2. Practice
   - Review cards
   - Due delayed probes
   - Study assignments
3. Map
   - Concept graph
   - Evidence provenance
   - Progress map
4. Audit
   - History
   - Question/card generation audit
   - Raw evidence links
5. Setup
   - Courses
   - Preferences
   - source/repo configuration

### Daily user path

The daily loop should be:

```text
Open Workbench -> Do next action -> Review focused session -> See outcome -> Return to Workbench
```

The user should not need to decide between Review, Study, History, Progress, Timeline, and Graph before doing useful work.

## High-quality UI components to add

### 1. Interactive learning map

Inspired by Obsidian local graph, but scoped to the current learning task.

Features:
- Focus on one concept/card.
- Depth selector: 1-hop / 2-hop.
- Node type toggles.
- Detail drawer on click.
- Highlight due probes and weak concepts.

Use it in:
- Workbench
- Map
- Card detail drawer

### 2. Provenance lane

Inspired by GitLens/Git graph.

Layout:

```text
Commit/File -> Concept -> Question -> Card -> Answer/Event -> Delayed Probe
```

Use it to answer:
- Why am I seeing this card?
- What code/docs does this come from?
- What changed after I answered?

### 3. Retention and calibration panel

Inspired by Anki stats, but honest about learning quality.

Show:
- due probe forecast;
- delayed probe completion;
- accuracy by confidence bucket;
- overconfidence gap;
- weak concepts.

Avoid:
- gamified streaks that reward volume over retention.

### 4. Session cockpit

A compact component that says exactly what the user should do next:

- “Answer 1 card.”
- “Complete 1 delayed probe.”
- “Finish 1 passive-control assignment.”
- “Create a course goal.”

This should replace many generic stat panels.

### 5. Detail drawer

A right-side drawer should appear when a user clicks any node/card/event.

Contents:
- title and type;
- source path;
- status;
- related cards/events;
- quality/correction history;
- direct action button.

This prevents every page from expanding vertically with repeated metadata.

### 6. Setup wizard

Courses, Questions, and Preferences should be reorganized into setup/edit flows:

- Create learning goal.
- Pick source material.
- Generate questions.
- Accept/reject questions.
- Generate review cards.

## Dependency-safe implementation order

1. Fix Workbench filter semantics.
   - Add semantic tags to nodes: `due`, `weak`, `study`, `evidence`.
   - Update tests so filters never hide all matching-count items.

2. Add Workbench detail drawer.
   - Use existing node data.
   - No new persistent state.

3. Convert Workbench map from card grid to lane-based visualization.
   - Start with SVG lanes, not a force graph.
   - Lanes are easier to understand and test.

4. Simplify primary nav.
   - Group secondary pages under Practice, Map, Audit, Setup.
   - Keep routes available, but reduce first-impression complexity.

5. Refactor Review into a guided session flow.
   - One obvious primary action per step.
   - Secondary evidence in collapsible drawer.

6. Promote Progress into a concept heatmap/skill map.
   - Group by concept kind.
   - Color by status/mastery.
   - Click opens detail drawer.

## What not to do

- Do not add another top-level page for every new concept.
- Do not make a decorative force graph before the data model supports meaningful focus and filtering.
- Do not hide provenance; it is one of the product’s differentiators.
- Do not over-gamify learning metrics. Calibration and delayed recall should stay honest.
- Do not expose raw JSON links as primary user actions except in debug/audit contexts.

## Visual quality bar for the next UI wave

A successful next UI wave should make the product feel like:

- a local-first learning cockpit;
- an evidence-aware study tool;
- a repo graph tutor;
- not an admin dashboard.

Acceptance criteria:

- The default page tells the user exactly what to do next.
- A new user can understand the five core concepts without reading docs: card, concept, evidence, probe, progress.
- Visualizations are clickable and explain why a card exists.
- Review session has one primary action at a time.
- Top-level navigation has fewer choices.
- Important states use distinct, meaningful visual treatments.

## Priority findings

High:
- Workbench semantic filters currently mismatch node types.
- Navigation has too many equally weighted destinations.
- Review flow is visually dense for the primary learning action.

Medium:
- Graph/Timeline/History/Progress are separate views over one shared system and should be unified visually.
- Courses/Questions/Preferences feel like admin setup rather than guided onboarding.
- Current components are cohesive but repetitive.

Low:
- Some screenshot pages are very tall and would benefit from sticky local subnavigation or collapsible sections.
- JSON links are useful for debugging but should not be visually prominent for normal users.

## Suggested first ticket

Title: Fix Workbench semantic filters and add node detail drawer

Scope:
- Add semantic tags to Workbench nodes.
- Make `Due`, `Weak`, `Study`, and `Evidence` filters show expected nodes.
- Add a detail drawer populated by node click.
- Keep `/api/workbench` as the source of truth.
- Add tests for filterable node tags.

Why first:
- It fixes a real confirmed UX bug.
- It improves the new homepage without changing routing.
- It creates the component foundation for later graph and progress improvements.
