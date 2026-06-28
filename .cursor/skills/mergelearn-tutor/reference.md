# MergeLearn Tutor API Reference

Session server: `127.0.0.1` only. Base URL from `mergelearn-tutor session` output.

All JSON responses use `content-type: application/json`. Write endpoints persist to `.skilltrace/state.json` or `preferences.json`.

## HTML pages (human UI)

| GET path | Purpose |
|----------|---------|
| `/` | Review queue |
| `/practice` | One-card practice |
| `/workbench` | Command center |
| `/map` | Unified map |
| `/audit` | Quality audit |
| `/plan` | Plan builder / onboarding |
| `/courses` | Course management |
| `/questions` | Question bank |
| `/timeline` | Provenance |
| `/graph` | Evidence graph |
| `/history` | Card history |
| `/progress` | Mastery inspection |
| `/study` | Active-control pilot |
| `/preferences` | Question plane wizard |
| `/state.json` | Raw state (alias of `/api/state`) |

## GET `/api/*` (read)

| Endpoint | Returns |
|----------|---------|
| `/api/state` | Full `TutorState` |
| `/api/workbench` | `WorkbenchSummary`: `nextAction`, `metrics`, `filters`, `nodes`, `links` |
| `/api/progress` | Progress graph nodes/edges grouped by concept kind |
| `/api/calibration` | Confidence vs correctness pairing stats |
| `/api/delayed-probes` | `{ summary, due, upcoming, completed }` |
| `/api/study` | `{ summary, assignments }` |
| `/api/cards/history` | `{ summary, batches, cards[] }` with per-card `events` |
| `/api/courses` | `{ courses: CourseSummary[] }` |
| `/api/questions` | `{ summary, batches, questions }` |
| `/api/evidence-timeline` | `{ nodes, edges }` provenance graph; optional `?limit=N` caps nodes (display-only truncation; full graph without param) |
| `/api/evidence-graph` | Same as evidence-timeline |
| `/api/preferences` | `UserPreferences` |

## POST/PUT write endpoints

### `POST /api/cards/generate`

```json
{
  "count": 5,
  "mode": "more",
  "courseId": "optional-course-id",
  "reason": "optional note"
}
```

- `mode`: `"more"` | `"regenerate"` (default `"more"`)
- Response: `{ "ok": true, "batch": CardBatch, "state": summarizeState }`

### `POST /api/courses`

```json
{
  "id": "optional-stable-id",
  "title": "required",
  "goal": "required",
  "enabledPlanes": ["local_behavior"],
  "materialPaths": ["src/**"],
  "docPaths": ["docs/**"],
  "conceptIds": ["concept-id"]
}
```

- Response: `{ "ok": true, "courses": [...] }`
- 400 if `title` or `goal` missing

### `POST /api/questions/draft`

```json
{
  "courseId": "optional",
  "provider": "fake",
  "model": "optional-label",
  "count": 6
}
```

- `provider`: `fake` | `local` | `deterministic` (no network)
- Response: `{ "ok": true, "questions": questionBankData }`

### `POST /api/questions/status`

```json
{
  "id": "question-entry-id",
  "status": "accepted"
}
```

- `status`: `"accepted"` | `"rejected"`
- Response: `{ "ok": true, "questions": questionBankData }`

### `PUT /api/preferences`

Partial `UserPreferences` body; normalized fail-closed.

```json
{
  "review": {
    "enabledPlanes": ["local_behavior", "risk_and_tests"],
    "defaultPlane": "local_behavior",
    "snippetLineCount": 14,
    "showExplanationsByDefault": false,
    "preferSourceOverDocs": true,
    "mode": "snippet_first"
  }
}
```

- Response: `{ "ok": true, "preferences": UserPreferences }`

### `POST /answer`

```json
{
  "itemId": "card-id",
  "answer": "plain-English explain-back",
  "correct": true
}
```

- Response: `{ "ok": true, "state": summarizeState }`

### `POST /feedback`

```json
{
  "itemId": "card-id",
  "eventType": "marked_correct",
  "confidenceBeforeReveal": 4,
  "note": "optional"
}
```

- `revealed` requires `confidenceBeforeReveal` 1–5
- Response: `{ "ok": true, "state": summarizeState }`

### `POST /correct`

```json
{
  "conceptId": "concept-id",
  "correctionType": "better_label",
  "replacementLabel": "new label",
  "note": "optional"
}
```

- Response: `{ "ok": true, "state": summarizeState }`

### `POST /api/delayed-probes/complete`

```json
{
  "probeId": "probe-id",
  "answer": "delayed recall answer",
  "correct": true
}
```

### `POST /api/study/assign`

```json
{
  "seed": "local-pilot",
  "count": 6
}
```

### `POST /api/study/passive-review/complete`

```json
{
  "assignmentId": "assignment-id",
  "durationMs": 120000,
  "note": "optional"
}
```

## CLI commands (no HTTP equivalent)

| Command | Purpose |
|---------|---------|
| `init` | Create `.skilltrace/state.json` |
| `ingest --since 30d --limit 80` | Git history → concepts |
| `today`, `review`, `profile`, `debt`, `map`, `progress` | Text reports |
| `cards generate` | Same as POST `/api/cards/generate` |
| `course list|create` | Course management |
| `questions list|draft|accept|reject` | Question bank |
| `timeline` | Evidence timeline JSON to stdout |
| `preferences show|set` | Preferences file |
| `answer`, `feedback`, `correct` | Same as POST endpoints |
| `delayed list|complete` | Spaced recall |
| `study list|assign|passive-complete` | Pilot controls |
| `rate`, `ratings` | Manual quality scores |
| `concept list|add|alias|ignore|promote-corrections` | Lexicon |
| `privacy init|preview` | Offline config + outbound preview |
| `enrich` | Local-only enrichment comparison |
| `dashboard` | Static HTML to `.skilltrace/dashboard.html` |
| `session` | Start localhost server |

Global option: `-r, --repo <path>` (default: cwd).

## `summarizeState` response fields

Returned on several write endpoints:

```json
{
  "concepts": 0,
  "cards": 0,
  "activeCards": 0,
  "archivedCards": 0,
  "batches": 0,
  "events": 0,
  "delayedProbes": 0,
  "studyAssignments": 0,
  "corrections": 0
}
```

## File layout

```text
.skilltrace/
  state.json
  preferences.json
  privacy.json
  lexicon.json
  dashboard.html
```
