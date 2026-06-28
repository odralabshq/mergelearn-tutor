---
name: mergelearn-tutor
description: >-
  Operates MergeLearn Tutor for local-first repo learning: assess progress via
  localhost /api/* and .skilltrace/ state, run CLI ingest/cards/session flows,
  create courses, draft/accept questions, generate cards, record answers and
  feedback, tune preferences and lexicon. Use when the user mentions
  MergeLearn, skilltrace, learning cards, review session, knowledge debt,
  question bank, or wants an agent to drive daily code-learning workflows.
---

# MergeLearn Tutor Agent

Local-first code learning platform. State lives in the **target repo** under `.skilltrace/`. Control plane: **CLI** + **localhost session server** (`127.0.0.1` only). No built-in MCP — integrate via HTTP JSON and file reads.

## Prerequisites

Before any workflow:

1. **Target repo path** — all state is per-repo (`--repo /path/to/target`).
2. **MergeLearn built** — from the MergeLearn Tutor install:
   ```bash
   cd /path/to/mergelearn-tutor && npm install && npm run build
   ```
3. **CLI invocation** — prefer `node /path/to/mergelearn-tutor/dist/cli.js` or `npm run cli --` from that repo.
4. **Session running** (for HTTP API) — discover base URL from CLI output:
   ```bash
   node dist/cli.js session --repo /path/to/target --port 0
   # → MergeLearn Tutor session: http://127.0.0.1:<port>
   ```
   Bind is `127.0.0.1` only; agents on the same machine use `curl` or `fetch`.

If `.skilltrace/state.json` is missing, run `init` first. If no concepts/cards, run `ingest` then `cards generate`.

## Integration surfaces

| Surface | Use for |
|---------|---------|
| `GET/POST/PUT /api/*` | Structured read/write while session is up |
| `POST /answer`, `/feedback`, `/correct` | Review events (same server) |
| `.skilltrace/*.json` | Direct inspection when session is down |
| CLI | Ingest, lexicon, privacy preview, offline batch ops |

**Read state files directly** when session is not running:

```text
.skilltrace/state.json       # full TutorState
.skilltrace/preferences.json # question planes, snippet settings
.skilltrace/lexicon.json     # custom concepts, aliases, ignores
.skilltrace/privacy.json     # network consent (offline by default)
```

## Safety

- **Local-only default** — session binds `127.0.0.1`; no cloud sync or telemetry.
- **No remote LLM without explicit opt-in** — enable `privacy.json` (`network.enabled`, `consentToSend`) and set `OPENAI_API_KEY` before `provider: remote`. Run `privacy preview` first; preview sends nothing.
- **Privacy preview before any future remote** — run `privacy preview` (CLI) to inspect outbound payloads; preview sends nothing.
- **Never commit secrets** — do not commit `.env`, tokens, or raw `.skilltrace/` from repos with sensitive snippets unless the user asks.
- **Card-quality vs learner failure** — `marked_bad_card`, `marked_wrong_evidence`, `marked_duplicate` are quality flags, not mastery misses.
- **Do not run target repo code** — MergeLearn reads git history and files only.

## Decision trees

### Broad vs course-scoped cards

```
Need cards from latest repo work broadly?
  → POST /api/cards/generate { "count": 5, "mode": "more" }
  → omit courseId

Need cards aligned to a learning track?
  → Create course (POST /api/courses or CLI course create)
  → Draft + accept questions for that course
  → POST /api/cards/generate { "courseId": "<id>", "count": 5, "mode": "more" }

Queue feels stale or low quality?
  → mode: "regenerate" (archives active queue; history preserved)
```

### Question planes

Six planes in `preferences.review.enabledPlanes`:

| Plane | Focus |
|-------|-------|
| `language_mechanics` | Syntax, types, runtime |
| `local_behavior` | What a snippet does |
| `file_role` | Why code lives in this file |
| `architecture_flow` | Cross-file flow |
| `risk_and_tests` | Bugs, security, tests |
| `repo_domain` | Project vocabulary |

Presets (see `docs/USER_MANUAL.md`): daily comprehension → `local_behavior,file_role,risk_and_tests`; onboarding → add `repo_domain`, enable explanations.

Apply via `PUT /api/preferences` or CLI `preferences set`.

### Learning path

After ingest and concept linking, open `/learning-path` to see prerequisite edges and recommended study order. Scope with `?course=<id>` or `GET /api/learning-path?course=<id>`. Cycles are flagged in JSON (`cycleDetected`, `cycleNodes`) and in the page copy.

### Ingest scope

```
Empty or stale concepts?
  → CLI only: ingest --since 7d|30d --limit 80
  → Re-run after lexicon changes (concept add/ignore/promote-corrections)

No git history in target repo?
  → Ingest cannot help; add manual concepts via lexicon or course docs paths
```

Ingest is **CLI-only** (no `/api/ingest`). PR-level ingest is **out of scope**.

## Read operations (assess learning)

Use session base URL as `$BASE` (e.g. `http://127.0.0.1:39587`).

| Goal | Endpoint / CLI |
|------|----------------|
| Full state | `GET $BASE/api/state` or read `.skilltrace/state.json` |
| Next action + weak areas | `GET $BASE/api/workbench` |
| Concept mastery | `GET $BASE/api/progress` or `progress --repo` |
| Confidence calibration | `GET $BASE/api/calibration` |
| Card/batch audit | `GET $BASE/api/cards/history` |
| Courses summary | `GET $BASE/api/courses` |
| Question bank | `GET $BASE/api/questions` |
| Provenance graph | `GET $BASE/api/evidence-timeline?includeEvents=false&course=<id>` |
| Learning path DAG | `GET $BASE/api/learning-path` or `/learning-path?course=<id>` |
| Practice queue | `GET $BASE/api/practice/queue` or `/practice?index=N` |
| History activity | `GET $BASE/api/history/activity?type=answered&limit=20` |
| Draft candidates | `GET $BASE/api/questions/candidates` |
| Preferences | `GET $BASE/api/preferences` |
| Due delayed probes | `GET $BASE/api/delayed-probes` |
| Study assignments | `GET $BASE/api/study` |
| Weak concepts (text) | `debt --repo` |
| Today's queue (text) | `today --repo` |

**Workbench** returns `nextAction`, `metrics`, filterable `nodes` (tags: `due`, `weak`, `study`, `evidence`). Start here for "what should the learner do next?"

## Write operations

### Courses

```bash
curl -s -X POST "$BASE/api/courses" -H 'content-type: application/json' \
  -d '{"id":"learn-auth","title":"Learn auth","goal":"Understand auth flow","materialPaths":["src/**"],"docPaths":["docs/**"],"enabledPlanes":["local_behavior","risk_and_tests"]}'
```

CLI: `course create --id ... --title ... --goal ... --materials ... --docs ...`

### Questions (draft → judge → accept → cards)

```bash
# Privacy preview before remote (sends nothing)
node dist/cli.js privacy preview --repo /path/to/target

# Draft locally (no network)
curl -s -X POST "$BASE/api/questions/draft" -H 'content-type: application/json' \
  -d '{"courseId":"learn-auth","provider":"fake","count":6}'

# Remote draft when privacy + OPENAI_API_KEY are configured
curl -s -X POST "$BASE/api/questions/draft" -H 'content-type: application/json' \
  -d '{"courseId":"learn-auth","provider":"remote","count":6}'

# List draft candidates for rubric review
curl -s "$BASE/api/questions/candidates"

# Accept or reject one
curl -s -X POST "$BASE/api/questions/status" -H 'content-type: application/json' \
  -d '{"id":"<question-id>","status":"accepted"}'

# Bulk promote after judging
curl -s -X POST "$BASE/api/questions/bulk-status" -H 'content-type: application/json' \
  -d '{"ids":["<id1>","<id2>"],"status":"accepted"}'
```

Judge rubric (agent): evidence cites real paths, prompt is answerable from snippet, `shortAnswer` is concise, `deepExplanation` adds repo context. Reject vague or duplicate prompts.

Generate cards from accepted questions:

```bash
curl -s -X POST "$BASE/api/cards/generate" -H 'content-type: application/json' \
  -d '{"count":5,"mode":"more","courseId":"learn-auth"}'
```

Practice queue navigation:

```bash
curl -s "$BASE/api/practice/queue?index=0"
# Human UI: /practice?index=N — auto-advances after grade
```

### Generate cards

```bash
curl -s -X POST "$BASE/api/cards/generate" -H 'content-type: application/json' \
  -d '{"count":5,"mode":"more","courseId":"learn-auth","reason":"daily practice"}'
```

`mode`: `"more"` (append) or `"regenerate"` (archive active queue).

### Preferences

```bash
curl -s -X PUT "$BASE/api/preferences" -H 'content-type: application/json' \
  -d '{"review":{"enabledPlanes":["local_behavior","risk_and_tests"],"snippetLineCount":12,"showExplanationsByDefault":false}}'
```

Partial body is normalized fail-closed to safe defaults.

### Answers and feedback

```bash
# Explain-back answer
curl -s -X POST "$BASE/answer" -H 'content-type: application/json' \
  -d '{"itemId":"<card-id>","answer":"...","correct":true}'

# Self-grade / quality (eventType required)
curl -s -X POST "$BASE/feedback" -H 'content-type: application/json' \
  -d '{"itemId":"<card-id>","eventType":"marked_correct","confidenceBeforeReveal":4}'

# Concept correction
curl -s -X POST "$BASE/correct" -H 'content-type: application/json' \
  -d '{"conceptId":"<concept-id>","correctionType":"better_label","replacementLabel":"session auth"}'
```

Valid `eventType` values: `shown`, `revealed`, `skipped`, `marked_unsure`, `marked_wrong`, `marked_correct`, `marked_useful`, `marked_bad_card`, `marked_wrong_evidence`, `marked_duplicate`, `deferred`. `revealed` requires `confidenceBeforeReveal` 1–5.

`correctionType`: `wrong_concept`, `wrong_evidence`, `duplicate`, `better_label`, `not_useful`, `pin_important`.

### Delayed probes and study (optional)

```bash
curl -s -X POST "$BASE/api/delayed-probes/complete" -H 'content-type: application/json' \
  -d '{"probeId":"<id>","answer":"...","correct":true}'

curl -s -X POST "$BASE/api/study/assign" -H 'content-type: application/json' \
  -d '{"seed":"agent-pilot","count":6}'
```

### Lexicon (CLI only)

```bash
node dist/cli.js concept add --repo . --id repo.billing --label "Billing flow" --path "src/billing/**"
node dist/cli.js concept alias --repo . --concept <id> --label "Better name"
node dist/cli.js concept ignore --repo . --term noisy-term
node dist/cli.js concept promote-corrections --repo .
# Then re-ingest
```

## Workflows

### Onboarding empty repo

```
- [ ] init --repo <target> --goals "understand this repo"
- [ ] ingest --repo <target> --since 30d
- [ ] preferences set (or PUT /api/preferences) — pick plane mix
- [ ] course create — scope materials + docs
- [ ] questions draft --course <id> --provider fake
- [ ] questions accept (review drafts in GET /api/questions)
- [ ] cards generate --count 5 --mode more
- [ ] session --repo <target> → open /plan or /workbench
```

Verify: `GET /api/state` shows `concepts > 0`, `learningItems` with `status: "active"`.

### Daily practice loop

```bash
ingest --repo . --since 7d
cards generate --repo . --count 5 --mode more
session --repo .   # note URL
```

Agent loop on `$BASE`:

1. `GET /api/workbench` — follow `nextAction`
2. `GET /api/state` — pick active card (`status !== "archived"`)
3. Present snippet + prompt to user; collect answer
4. `POST /feedback` with `revealed` + confidence, then `marked_correct` / `marked_wrong` / `marked_unsure`
5. Or `POST /answer` for explain-back text
6. `GET /api/calibration` weekly for confidence vs correctness

Human UI: `/practice` (one card) or `/` (full queue).

### Course creation

1. `GET /api/state` — inspect existing `concepts` for `conceptIds`
2. `POST /api/courses` with `materialPaths`, `docPaths`, `enabledPlanes`
3. `POST /api/questions/draft` with `courseId`
4. Review `GET /api/questions`; accept good drafts
5. `POST /api/cards/generate` with `courseId`

### Weak-concept remediation

1. `GET /api/workbench` or `GET /api/progress` — nodes with `status: "needs_review"`
2. `debt --repo` for human-readable weak list
3. Add lexicon concept or `POST /correct` with `pin_important`
4. `ingest` to refresh exposure
5. `cards generate` with planes emphasizing `risk_and_tests` or `repo_domain`
6. Target cards via course scoped to weak `conceptIds`

### Audit / quality review

1. `GET /api/cards/history` — batches, per-card events, `courseId` / `questionId` provenance
2. `GET /api/evidence-timeline` — commit → concept → question → card chain
3. `ratings --repo` and `GET /api/calibration`
4. Flag bad cards: `POST /feedback` `marked_bad_card` / `marked_wrong_evidence`
5. `questions reject` for weak drafts before they become cards

## Example agent prompts

**Assess learner state**

> Start MergeLearn session for repo X. Read `/api/workbench` and `/api/progress`. Summarize active cards, weak concepts, due probes, and recommended next action.

**Setup learning track**

> For repo X, create a course on authentication, draft 6 fake questions, list drafts, accept the three strongest by evidence quality, generate 5 course-scoped cards.

**Run review on behalf of user**

> With session at $BASE, fetch the first active card from `/api/state`, ask me the prompt, record my confidence 1–5 on reveal, then POST feedback with my self-grade.

**Tune question mix**

> Read `/api/preferences`, switch to risk-and-test focus planes, PUT preferences, regenerate 5 cards with reason "risk review before refactor".

## Out of scope

Do **not** attempt these via this skill:

- **PR / GitHub ingest** — only `git log` ingest via CLI
- **Remote LLM** without user opt-in and privacy preview
- **Graph aggregation API** — `/api/evidence-graph` returns raw timeline projection; no separate graph query language
- **Cloud sync, telemetry, IDE extension, PR blocking**
- **Running or testing target repo code**
- **Modifying MergeLearn Tutor source** unless the user asks to change the platform itself

## State shape (essentials)

`TutorState` in `.skilltrace/state.json` (see `src/core/types.ts`):

- `artifacts` — commit evidence from ingest
- `concepts` + `conceptStates` — extracted topics + mastery
- `learningItems` — cards (`status`: `active` | `archived`)
- `cardBatches` — generation history
- `courses`, `questionBank`, `questionDraftBatches`
- `learningEvents` — review audit trail
- `delayedProbes`, `studyAssignments`, `corrections`, `manualRatings`

Active cards: `learningItems.filter(i => i.status !== 'archived')`.

## Additional resources

- Full API table and payloads: [reference.md](reference.md)
- Human docs: `docs/USER_MANUAL.md`, `docs/REVIEW_SESSION.md`, `docs/CUSTOMIZATION.md`, `docs/PRIVACY.md`

## Limitations

- Session port is ephemeral unless `--port` is fixed; agent must parse CLI output or probe `127.0.0.1`.
- `ingest`, lexicon, privacy, `dashboard`, `enrich` — CLI only, no REST mirror.
- Docs may lag server; verify handlers in `src/session/server.ts` if unsure.
- One repo = one `.skilltrace/`; no cross-repo workspace API.
