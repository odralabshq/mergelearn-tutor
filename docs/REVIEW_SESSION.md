# Interactive Local Review Session

MergeLearn Tutor now has a local browser-based review session. It keeps the CLI as the control plane and stores all state locally in `.skilltrace/state.json`.

## Start a session

```bash
mergelearn-tutor session --repo .
```

The command prints a local URL:

```text
MergeLearn Tutor session: http://127.0.0.1:<port>
Press Ctrl+C to stop.
```

Open that URL in a browser.

## Current UI

The page shows snippet-first cards with:

- card title
- question plane and difficulty
- why the card appeared
- evidence file path
- bounded code snippet
- concrete question
- active-recall answer box
- reveal explanation button
- self-grade actions: I knew it, Partly, Missed it, Bad card, Wrong evidence
- queue controls to generate more cards or regenerate the active queue

Available actions:

- reveal explanation locally without recording mastery
- record correct/incorrect explain-back answers
- mark partly/unsure for near-term review
- mark bad card or wrong evidence as card-quality feedback, not learner failure
- inspect card/batch history on `/history`
- define learning tracks on `/courses`
- draft and accept fake/local LLM-style questions on `/questions`
- inspect GitLens-style document evidence on `/timeline`
- inspect a graph view of courses/docs/questions/cards on `/graph`

All actions POST to the local server and update `.skilltrace/state.json`.

## Local API

The server binds to `127.0.0.1` only.

Endpoints:

```text
GET  /
GET  /courses
GET  /questions
GET  /timeline
GET  /graph
GET  /history
GET  /progress
GET  /state.json
GET  /api/state
GET  /api/cards/history
GET  /api/courses
GET  /api/questions
GET  /api/evidence-timeline
GET  /api/evidence-graph
GET  /api/progress
GET  /api/preferences
PUT  /api/preferences
POST /api/cards/generate
POST /api/courses
POST /api/questions/draft
POST /api/questions/status
POST /answer
POST /feedback
POST /correct
```

Example payloads:

```json
{"itemId":"item_abc","answer":"...","correct":true}
```

```json
{"itemId":"item_abc","eventType":"marked_useful","note":"good card"}
```

```json
{"conceptId":"repo.auth","correctionType":"better_label","replacementLabel":"session auth"}
```

```json
{"review":{"enabledPlanes":["local_behavior","risk_and_tests"],"snippetLineCount":12}}
```

```json
{"count":5,"mode":"regenerate","reason":"need a fresh review queue"}
```

The `/api/*` endpoints intentionally provide a stable control surface for CLI, website, and future LLM-driven customization.

## Dogfood result

Batch 5 dogfood on `/home/adam/mergeLearn` scratch state:

```text
url http://127.0.0.1:39587
html_has_title true
html_has_cards true
answer_ok true events 1
feedback_ok true events 2
```

Scratch `.skilltrace` state was removed after dogfood.

## Remaining UX work

1. Add visual completed/skipped states without requiring page refresh.
2. Add end-of-session summary screen.
3. Add card correction controls in the UI, not only API/CLI.
4. Add keyboard shortcuts.
5. Add a Playwright visual smoke test once UI stabilizes.
