# Page functionality notes

These notes support the screenshots in `screenshots/` and the design review in `frontend-review-packet.md`.

## 1. Workbench

Route: `/workbench`
Screenshot: `screenshots/workbench.png`

Functionality:
- Command-center landing page.
- Shows next action, active card count, due probes, weak concepts, and study assignments.
- Provides filter chips and clickable visual nodes for concept, card, event, and study state.

Current visual/UX notes:
- Best current candidate for a true homepage.
- Strong headline and next-action CTA.
- The visual map is useful but still card-grid based rather than graph/lane based.
- Filter labels do not all map to node categories. Confirmed behavior: `Due`, `Weak`, and `Evidence` filters hide all nodes in the seeded demo.

## 2. Review

Route: `/`
Screenshot: `screenshots/review.png`

Functionality:
- Main active-recall card page.
- Supports confidence-before-reveal, answer capture, reveal, and self-grade feedback.
- Shows card quality and source snippet context.

Current visual/UX notes:
- Functionally central but visually dense.
- The review action is buried below global shell, stats, and multiple card panels.
- Confidence/reveal/answer/self-grade flow needs stronger step framing.

## 3. Plan Builder

Route: `/plan`
Screenshot: `screenshots/plan.png`

Functionality:
- Connects setup state to daily review readiness.
- Shows course goal, evidence, questions, review cards, and missing setup steps.

Current visual/UX notes:
- Useful operational checklist, but it overlaps conceptually with Workbench.
- Should become a guided setup/onboarding panel or drawer rather than a peer top-level page forever.
- Good candidate for a “setup incomplete” state inside Workbench.

## 4. Courses

Route: `/courses`
Screenshot: `screenshots/courses.png`

Functionality:
- Creates and reviews course goals, material paths, and learning tracks.
- Connects documents and concept IDs to a course.

Current visual/UX notes:
- Form-heavy and technical.
- Better as a “Learning goal setup” wizard or modal from Workbench.
- Needs clearer preview of what creating a course will unlock.

## 5. Questions

Route: `/questions`
Screenshot: `screenshots/questions.png`

Functionality:
- Drafts local/fake LLM-style questions from course/evidence context.
- Lets the user accept, reject, and inspect draft questions.

Current visual/UX notes:
- Useful but reads like an admin tool.
- Should be reorganized around a question pipeline: draft -> review -> accepted -> card-ready.
- Needs visual status lanes rather than stacked panels.

## 6. Timeline

Route: `/timeline`
Screenshot: `screenshots/timeline.png`

Functionality:
- Shows GitLens-style provenance: commits, changed files, concepts, and generated learning artifacts.
- Supports source/evidence audit.

Current visual/UX notes:
- Strong concept, but the visual is still mostly tabular/list-like.
- Should become a left-to-right evidence lane: commit/file -> concept -> question -> card -> event.
- Could be merged into Workbench as an evidence/provenance mode.

## 7. Graph

Route: `/graph`
Screenshot: `screenshots/graph.png`

Functionality:
- Shows evidence graph nodes and edges.
- Provides explainability for how source files connect to concepts, questions, cards, and events.

Current visual/UX notes:
- Good foundation, but the graph currently feels like a static diagram/list hybrid.
- Needs interactive local focus, depth, node details, and type filters similar to Obsidian Graph View.
- Should not be the main homepage, but should be a first-class detail mode from Workbench.

## 8. Study

Route: `/study`
Screenshot: `screenshots/study.png`

Functionality:
- Manages active-control/passive-review assignments.
- Supports local experiment setup before making learning-effectiveness claims.

Current visual/UX notes:
- Conceptually important, but terminology is research-heavy.
- Should be framed for users as “Compare learning methods” or “Study mode”, with research details in an expandable section.
- Needs clearer visual comparison between active recall and passive review.

## 9. History

Route: `/history`
Screenshot: `screenshots/history.png`

Functionality:
- Audits all cards, recent activity, calibration, delayed probes, and review history.

Current visual/UX notes:
- Valuable audit page, but dense and visually similar to Progress/Study.
- Should become a timeline-style activity log with filters and expandable event cards.
- Could share visual components with the evidence lane.

## 10. Progress

Route: `/progress`
Screenshot: `screenshots/progress.png`

Functionality:
- Shows concept mastery, confidence, exposure count, active recall count, and status.

Current visual/UX notes:
- Data is useful but does not yet feel like a learning map.
- Needs heatmap/tree/skill-map visualization, grouped by concept kind and status.
- Should distinguish honest learning quality from mere activity volume.

## 11. Preferences

Route: `/preferences`
Screenshot: `screenshots/preferences.png`

Functionality:
- Configures question planes, snippet length, and recommended setup presets.

Current visual/UX notes:
- Too much user-facing configuration for a primary nav page.
- Should move most settings into contextual setup/edit flows.
- Keep advanced preferences accessible, but not central to the daily loop.

## Cross-page observation

The product already has the right raw ingredients: active recall, delayed probes, calibration, evidence provenance, graph, progress, and study controls. The main UX problem is that these ingredients are distributed across many equally weighted pages, all using similar dark cards and pill buttons. Users must know the system model before they know where to click.
