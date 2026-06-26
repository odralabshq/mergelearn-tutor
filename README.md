# MergeLearn Tutor

MergeLearn Tutor is a local-first code tutoring system. It reads your git history, detects concepts you touched, builds a transparent personal skill ledger, and gives you short daily learning cards tied to real files and commits.

It is not a course generator, SaaS dashboard, PR blocker, or AI code reviewer. It is a personal knowledge-debt tool for developers using AI heavily but still wanting to understand the code they ship.

## Why this exists

AI coding makes code production faster, but it can create knowledge debt: the repo changes faster than the developer's mental model. MergeLearn Tutor repays that debt with active recall, evidence-linked cards, and spaced review.

## Current MVP

- Local CLI.
- Local transparent JSON state in `.skilltrace/state.json`.
- Deterministic git-history ingestion.
- Hybrid concept extraction with path/regex rules plus TypeScript AST analysis.
- Personal concept state and mastery evidence.
- Daily review cards.
- Explain-back answer recording.
- Static local dashboard at `.skilltrace/dashboard.html`.
- No telemetry.
- No target repo code execution.
- No required LLM calls.

## Quick start

```bash
npm install
npm run build

node dist/cli.js init --repo /path/to/repo
node dist/cli.js ingest --repo /path/to/repo --since 30d
node dist/cli.js today --repo /path/to/repo
node dist/cli.js review --repo /path/to/repo
node dist/cli.js dashboard --repo /path/to/repo
```

Open the dashboard:

```bash
xdg-open /path/to/repo/.skilltrace/dashboard.html
```

On Windows/WSL, open:

```text
\\wsl.localhost\Ubuntu\path\to\repo\.skilltrace\dashboard.html
```

## Commands

```bash
mergelearn-tutor init --repo .
mergelearn-tutor ingest --repo . --since 30d --limit 80
mergelearn-tutor today --repo .
mergelearn-tutor review --repo . --count 5
mergelearn-tutor answer --repo . --item <id> --answer "..." --correct
mergelearn-tutor feedback --repo . --item <id> --event marked_wrong --note "too generic"
mergelearn-tutor correct --repo . --concept <concept-id> --type better_label --label "session authorization"
mergelearn-tutor profile --repo .
mergelearn-tutor debt --repo .
mergelearn-tutor map --repo .
mergelearn-tutor explain-last-commit --repo .
mergelearn-tutor dashboard --repo .
npm run eval:repos -- --fixtures --repo /path/to/repo --out eval-runs/latest
```

## Product stance

The tutor intentionally starts local and personal. The primary UI is `today`, not the whole graph. The graph exists for inspection, but the habit loop is a 3-5 minute review.

## Privacy model

The CLI reads git metadata and diffs. It does not run project code, install target repo dependencies, send telemetry, or call an LLM. Optional LLM enrichment can be added later behind explicit config and preview of what leaves the machine.

## Storage note

The design calls for SQLite. This MVP uses JSON because the current verified environment is Node 20 and a dependency-free JSON store keeps setup reliable. The store module is intentionally isolated so SQLite can replace it later.

## Verification

```bash
npm run check
npm test
npm run build
npm run eval
npm run smoke
```

## Further docs

- `docs/EVALUATION.md` — evaluation harness and manual rubric.
- `docs/CORRECTIONS.md` — feedback/correction commands and learner-event behavior.
- `docs/ANALYZERS.md` — deterministic extraction and TypeScript AST analyzer details.
- `docs/CARD_QUALITY.md` — card generation quality rules and dogfood findings.
- `docs/ROADMAP.md` — current platform roadmap.
