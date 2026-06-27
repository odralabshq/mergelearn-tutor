# Design system scaffold for MergeLearn Tutor

This scaffold describes a professional UI direction for future implementation. It is intentionally framework-neutral because the current app is server-rendered HTML from `src/session/server.ts`.

## Product personality

MergeLearn Tutor should feel like:

- a developer tool, not a classroom LMS;
- a personal learning workspace, not a generic flashcard app;
- evidence-grounded and transparent;
- calm, focused, and high-trust.

Avoid:

- gamified cartoon visuals;
- overly academic courseware styling;
- raw debug surfaces as the first thing users see;
- adding more top-level navigation before consolidating flows.

## Recommended UI architecture

### App shell

Move from repeated top nav pills toward a stable shell:

```text
┌─────────────────────────────────────────────┐
│ Top bar: repo, plan, sync/status, commands  │
├───────────────┬─────────────────────────────┤
│ Sidebar       │ Page content                 │
│ Today         │                             │
│ Plan          │                             │
│ Questions     │                             │
│ Evidence      │                             │
│ Progress      │                             │
│ Settings      │                             │
└───────────────┴─────────────────────────────┘
```

Suggested navigation consolidation:

- `Today` = current Review page / one-card mode.
- `Plan` = Courses + Preferences + source setup.
- `Questions` = question bank and quality pipeline.
- `Evidence` = Timeline + Graph + History trace filters.
- `Progress` = mastery and next review plan.
- `Settings` = privacy, repo state, global preferences.

### Component inventory

Implement reusable styles/components before more pages:

- `AppShell`
- `PageHero`
- `MetricCard`
- `GuidePanel`
- `GuideStep`
- `PrimaryActionBar`
- `SourceScopePicker`
- `QuestionPlanePicker`
- `EvidenceSnippet`
- `QualityBadge`
- `ProvenanceTrace`
- `EmptyState`
- `DetailDrawer`
- `FilterBar`
- `OneCardReview`

Current server-rendered implementation can start as helper functions in `src/session/server.ts`, then move to a renderer module later.

## Visual direction

### Color tokens

Current dark theme works. Consolidate it into tokens:

```css
:root {
  --bg-page: #07111f;
  --bg-panel: #0f172a;
  --bg-panel-strong: #111827;
  --bg-control: #182337;
  --border-subtle: #263854;
  --border-strong: #334155;
  --text-primary: #e2e8f0;
  --text-secondary: #a8b3c7;
  --text-muted: #7f8da3;
  --accent-cyan: #38bdf8;
  --accent-green: #22c55e;
  --accent-blue: #3b82f6;
  --danger: #f43f5e;
  --warning: #f59e0b;
  --radius-sm: 12px;
  --radius-md: 18px;
  --radius-lg: 24px;
  --shadow-panel: 0 16px 50px rgb(0 0 0 / 35%);
}
```

### Typography

- Use a strong display heading only once per page.
- Use smaller section headings for cards/panels.
- Use monospace only for code, commands, ids, and paths.
- Avoid long all-caps tags when many badges appear together.

### Density rules

- Daily review mode: low density, one primary action.
- Setup/Plan mode: guided density, progressive disclosure.
- Evidence/audit mode: high density allowed, but must have filters/search.

### Interaction rules

- Every page should have one obvious primary action.
- Secondary debugging links should be collapsed.
- Empty states should say what to do next and show the exact command or button.
- Dense data pages should start with filters, not raw lists.

## Plan Builder target mock structure

```text
Page: Build a learning plan

Step 1: Choose repo
- current repo
- recent ingest status
- command if not initialized

Step 2: Name the goal
- title
- outcome
- optional deadline/cadence

Step 3: Scope sources
- paths
- docs
- languages/frameworks
- recency window

Step 4: Choose question mix
- language mechanics
- local behavior
- architecture flow
- risk/tests
- repo vocabulary

Step 5: Preview
- expected concepts
- source count
- draft question count
- duplicate warnings
- likely first cards

Primary action: Save plan and draft questions
```

## One-card review target mock structure

```text
Page: Today

Top:
- Plan selector
- 1/5 cards
- due reason

Card:
- source path
- short snippet
- question
- answer input

Actions:
- Reveal explanation
- I knew it
- Partly
- Missed it
- Bad card

After reveal:
- expected answer
- why this card appeared
- evidence links
```

Keyboard shortcuts:

- `r` reveal
- `1` knew it
- `2` partly
- `3` missed it
- `b` bad card
- `j/k` next/previous if queue navigation exists

## Quality badge system

Suggested badges:

- `Evidence strong`
- `Needs evidence`
- `Specific`
- `Too broad`
- `Duplicate risk`
- `Accepted question`
- `Course scoped`
- `Low mastery`
- `Due now`

Quality scores should be explainable. Avoid opaque numeric ratings unless the user can inspect what caused them.

## Graph/evidence design direction

Do not make graph visuals the main value. Make them a way to answer questions:

- Why did this card appear?
- Which source path produced this question?
- Which concepts are overrepresented?
- Which accepted questions have no cards?
- Which docs are being ignored?
- Which cards got bad-card/wrong-evidence feedback?

Recommended UI:

- filter bar at top;
- graph or trace map in middle;
- detail drawer on the right;
- raw JSON collapsed in advanced/debug.

## Implementation guidance

Short-term, keep server-rendered HTML but extract helpers:

- `src/session/components.ts`
- `src/session/styles.ts`
- `src/session/pages/*.ts` later if file grows too large

Do not introduce React/Vite unless there is a clear reason. The current local server can support a professional UI with disciplined components first.

## Verification checklist for future UI work

For every visual slice:

```bash
npm run check
npm test -- --run tests/session/server.test.ts
npm run build
```

Then capture screenshots:

```bash
npx --yes playwright@1.57.0 screenshot --browser chromium --full-page --viewport-size=1440,1000 \
  http://127.0.0.1:4197/ \
  .autoloop/screenshots/<timestamp>/review.png
```

Also inspect browser console after navigation. A UI slice is not complete until it has screenshot evidence and no obvious console errors.
