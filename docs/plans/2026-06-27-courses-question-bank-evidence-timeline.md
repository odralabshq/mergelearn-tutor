# Courses, Question Bank, Evidence Timeline, and Graph Demo Plan

## Read this first

The previous demo proved the review-card loop but did not implement the larger product shape. This batch adds the missing demo surfaces:

- Learning courses/tracks with goals, selected material, and focus categories.
- A question bank with deterministic and fake/local LLM-style question drafts.
- Evidence timeline for commits, changed files, markdown docs, courses, questions, cards, and events.
- Graph page showing relationships between courses, docs, concepts, questions, and cards.
- A cleaner history page that summarizes first and hides dense card details behind grouped sections.

The implementation remains local-first. Remote LLM calls are not enabled in this batch; the `fake` provider demonstrates the workflow and persists provider/model/provenance fields so a future remote provider can be gated by privacy preview and explicit approval.

## Design constraints

1. The demo must answer: what am I learning, from which repo evidence, and why does this card exist?
2. History must be scannable, not a wall of cards.
3. Timeline/graph must reuse stable JSON projections so a future graph library can replace the simple SVG/HTML renderer.
4. LLM questions must be evidence-bound drafts, not untrusted truth.
5. The current CLI/local server architecture should remain dependency-light.

## Acceptance checklist

### Courses

- User can create/list courses from CLI.
- Course has id, title, goal, enabled question planes, material path globs, doc paths, concept focus, createdAt.
- Web `/courses` shows course cards with goals, materials, linked question/card counts, and actions/links.
- API `/api/courses` returns the persisted courses.

### Question bank and LLM-style drafts

- User can draft questions for a course with a fake/local provider.
- Drafts cite concept id, evidence path, commit, snippet, provider, model, prompt version, status.
- User can accept/reject drafts from CLI and web/API.
- Accepted question bank entries can be shown separately from active review cards.
- Remote provider is rejected until explicitly implemented with privacy preview.

### Evidence timeline / docs lens

- Timeline includes commits, files, markdown docs, courses, question entries, cards, batches, and review events.
- `/timeline` shows a chronological evidence lens, emphasizing markdown docs and which cards/questions came from them.
- `/api/evidence-timeline` returns stable nodes/edges.

### Graph

- `/graph` renders a simple dependency graph using HTML/SVG-style grouped cards, without adding a heavy frontend library yet.
- Graph shows course -> docs/concepts -> questions -> cards.
- `/api/evidence-graph` returns nodes/edges compatible with a future graph library.

### Cleaner history

- `/history` starts with summary, then compact grouped sections.
- Dense card details are behind `<details>` sections and grouped by active/archived/batch/course.
- The page makes it clear that regenerate preserves history.

## Verification

- Unit/core tests for courses, question drafts, timeline graph projection.
- Session server test for new pages/APIs.
- CLI test coverage for course/question commands where practical.
- Demo dogfood with a temp git repo containing source, tests, markdown docs, generated cards, course, fake LLM drafts, accepted questions.
- Browser visual check for `/courses`, `/questions`, `/timeline`, `/graph`, `/history` and console errors.
- Final: `npm run check && npm test && npm run build`.
