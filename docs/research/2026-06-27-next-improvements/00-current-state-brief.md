# 00 Current state brief

## Repository and branch

- Repo path: `/home/adam/mergelearn-tutor`
- Branch: `autonomous-platform-polish`
- Remote main exists at `https://github.com/odralabshq/mergelearn-tutor.git`
- Work policy: continue research and implementation on `autonomous-platform-polish`; do not push or merge to `main` without user approval.

## Product summary

MergeLearn Tutor is a local-first developer learning tool. It turns git history, changed files, docs, concepts, and accepted local question drafts into active-recall review cards. The product is currently both a CLI and a local browser app.

Core promise:

> Learn the code you ship by reviewing evidence-bound flashcards generated from your own repositories.

Current privacy stance:

- No telemetry.
- No target repo code execution.
- No required remote LLM calls.
- Fake/local providers are deterministic and no-network.
- State lives inside each target repo under `.skilltrace/`.

## Primary user flow today

1. Initialize a target repo.
2. Ingest recent git history.
3. Create a course/track around a learning goal.
4. Draft fake/local questions.
5. Accept useful questions and reject bad ones.
6. Generate review cards from all evidence or from a selected course.
7. Answer cards from memory, reveal explanations, and self-grade.
8. Inspect provenance through Timeline, Graph, History, and Progress.

## Browser pages and current role

| Page | Current role | Screenshot |
|---|---|---|
| Review | Daily active-recall queue, start-here checklist, source selector, answer/reveal/self-grade flow. | `screenshots/01-review.png` |
| Courses | Learning goal and evidence scope definition. | `screenshots/02-courses.png` |
| Questions | Local question staging area: draft, accept, reject, inspect evidence. | `screenshots/03-questions.png` |
| Timeline | Provenance list from commits/files/docs to concepts/questions/cards/events. | `screenshots/04-timeline.png` |
| Graph | Visual evidence graph plus grouped node panels and raw JSON. | `screenshots/05-graph.png` |
| History | Audit of batches, active/archived cards, source types, and feedback events. | `screenshots/06-history.png` |
| Progress | Concept mastery/status inspection plus guide for what changes progress. | `screenshots/07-progress.png` |
| Preferences | Question plane selection and review display settings. | `screenshots/08-preferences.png` |

## Current demo data observed

From local app screenshots/API:

- 1 course.
- 3 active cards.
- 9 archived cards.
- 2 draft questions.
- 3 accepted questions.
- 0 rejected questions.
- 35 evidence graph nodes.
- 97 evidence graph edges.
- Network used: no.

## Recent autonomous improvements already present

The branch includes recent local commits beyond `main`:

- Visual evidence graph map.
- Review-page `Start here` checklist.
- Guided Courses and Questions setup panels.
- Review source selector for course-specific card generation.
- Progress and History audit guides.

These reduce some first-use confusion, but the product still needs stronger information architecture, better card-quality controls, clearer multi-repo/source configuration, and a more professional app shell.

## Current UI strengths

- Clear dark visual identity.
- Strong evidence-first concept: cards show real snippets/diffs.
- Good local-first trust posture.
- Review flow follows answer-first active recall instead of passive reading.
- Courses/questions/history/graph provide transparency into why cards exist.
- There is now a guided path from empty repo to review queue.

## Current UI weaknesses

- App still feels like a prototype stitched from panels rather than a coherent learning workspace.
- Navigation is horizontal pills on every page; this does not scale as pages/features grow.
- The concept of “Courses” may imply large formal classes, while actual use may be narrower: goals, tracks, focus areas, or study plans.
- Question quality is still mostly manual accept/reject; there is no explicit rubric or preview of the resulting card quality.
- Cards repeat similar snippets/questions in the demo, suggesting the planner needs diversity and duplicate detection improvements.
- Graph is useful but can become a hairball. It lacks filters, click-through node details, edge-type toggles, and focus mode.
- Progress is inspectable, but not yet a plan: it does not tell the user what to review next or why.
- Multi-repo usage is not obvious. State is per repo, but there is no workspace/repo picker or cross-repo learning mode.

## Current technical constraints

- UI is server-rendered HTML/CSS/JS from `src/session/server.ts`.
- No frontend framework yet.
- No remote LLM flow enabled.
- No bundled third-party graph library yet.
- Browser automation works through Playwright CLI Chromium screenshots. MCP Playwright browser still expects Google Chrome under `/opt/google/chrome/chrome` and is blocked by sudo/password installation.

## Verification snapshot during packet creation

- Browser navigation to `/` succeeded.
- Console errors on `/`: none.
- All primary pages responded over HTTP:
  - `/`
  - `/courses`
  - `/questions`
  - `/timeline`
  - `/graph`
  - `/history`
  - `/progress`
  - `/preferences`
