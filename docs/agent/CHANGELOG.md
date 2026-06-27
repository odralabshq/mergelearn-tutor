# MergeLearn Tutor Autonomous Development Changelog

## 2026-06-26

- Created next-phase platform plan from deep research report.
- Added roadmap pointer.
- Switched to long-running autonomous iteration mode per user instruction.
- Established Batch 1 as the next implementation target: multi-repo evaluation harness and rating rubric.

## 2026-06-26 Batch 1

- Added evaluation harness types, runner, fixture repos, JSON/Markdown reporting, and `npm run eval:repos`.
- Added fixture-based evaluation tests.
- Dogfooded evaluation on `/home/adam/mergeLearn`.
- Fixed two product-quality extraction issues discovered by dogfood:
  - TypeScript language concepts no longer trigger from path hints alone.
  - Repo-domain concept labels now use inferred terms instead of evidence filenames.
- Added `docs/EVALUATION.md`.

Verified during development:

```bash
npm run check
npm test -- --run tests/core/concepts.test.ts tests/eval/evaluationHarness.test.ts
npm run eval:repos -- --fixtures --repo /home/adam/mergeLearn --since 30d --limit 30 --out eval-runs/mergelearn-dogfood
npm test
npm run build
npm run eval
npm run smoke
```

## 2026-06-26 Batch 2

- Added versioned review event and correction types.
- Added pure reducer functions for feedback events and concept corrections.
- Added backward-safe state normalization for older `.skilltrace/state.json` files without corrections.
- Added CLI commands: `feedback` and `correct`.
- Updated profile/debt renderers to surface correction counts/reasons.
- Added reducer and CLI tests.
- Dogfooded correction flow on `/home/adam/mergeLearn` scratch state and removed the scratch `.skilltrace`.
- Fixed dogfood UX issue: suppressed concepts now re-sort below active concepts and are removed from future cards.

## 2026-06-26 Batch 3

- Added a TypeScript compiler API analyzer for added diff snippets.
- Detects interfaces, type aliases, unions, generics, async/await, and React hooks.
- Integrated AST findings into concept extraction while preserving regex/path fallback.
- Cached AST findings per changed file so each file is parsed once per artifact.
- Added analyzer tests and documented the analyzer architecture.
- Evaluation remained stable: fixture expected concept hit rate 100%, MergeLearn dogfood still produced 48 concepts and 12 cards for 30 recent commits.

## 2026-06-26 Batch 4

- Added `whyShown` metadata to learning items.
- Added no-evidence guard so concepts without evidence cannot generate cards.
- Improved prompt templates by concept kind.
- Ranked evidence before prompting so source/test/config files beat README/docs when available.
- Updated `today` output to explain why each card appeared.
- Added card quality tests and documented card quality rules.
- Dogfooded on `/home/adam/mergeLearn`; top prompts now point to source/test files and all cards include why-shown metadata.

## 2026-06-26 Batch 5

- Added a local `127.0.0.1` review session server.
- Added browser HTML surface for top cards with answer and feedback actions.
- Added local API endpoints: `/`, `/state.json`, `/answer`, `/feedback`, `/correct`.
- Added `mergelearn-tutor session --repo .` CLI command.
- Added HTTP integration test for session actions.
- Dogfooded session server on `/home/adam/mergeLearn` scratch state and removed scratch state afterward.

## 2026-06-26 Batch 6

- Added local repo lexicon support in `.skilltrace/lexicon.json`.
- Added custom repo concepts matched from changed paths and diff/commit terms.
- Added local aliases and ignore rules so extractor/planner output can be corrected without source edits.
- Added correction promotion into lexicon aliases, ignore rules, and pinned concepts.
- Added CLI commands: `concept list`, `concept add`, `concept alias`, `concept ignore`, and `concept promote-corrections`.
- Added lexicon tests and CLI coverage for adding/listing a repo-specific concept.
- Added `docs/LEXICON.md` and README command coverage.
- Dogfooded on `/home/adam/mergeLearn` with a custom `repo.pr_understanding_guard` concept; it generated 12 evidence refs and a learning card, then scratch `.skilltrace` state was removed.

## 2026-06-26 Batch 7

- Added offline-by-default privacy config loading/saving at `.skilltrace/privacy.json`.
- Added fail-closed outbound guard behavior requiring explicit network enablement, consent, and provider.
- Added outbound preview rendering so future enrichment payloads can be inspected without sending anything.
- Added redaction for common secrets, email addresses, custom terms, and Linux/WSL/Windows user path segments.
- Kept evidence snippets omitted by default; `privacy preview --include-snippets` is opt-in and uses redaction plus ignore path rules.
- Added CLI commands: `privacy init` and `privacy preview`.
- Added `docs/PRIVACY.md` and README coverage.
- Dogfooded on `/home/adam/mergeLearn`; preview showed `Would send: no` and `Blocked reason: network disabled by default`, then scratch `.skilltrace` state was removed.

## 2026-06-26 Batch 8

- Added local-only enrichment core with fake/local providers and explicit rejection of remote provider.
- Added `mergelearn-tutor enrich` to compare deterministic prompts with enriched wording, worked examples, and follow-up questions.
- Kept deterministic cards as the truth source and recorded enrichment provenance (`deterministic-card`, no network used).
- Reused the redacted outbound preview payload as the enrichment input so snippets stay opt-in and redacted.
- Extended `npm run eval:repos` with `--with-enrichment fake|local` and Markdown/JSON reporting of enriched card count, no-network status, and provenance checks.
- Added enrichment unit, CLI, and evaluation coverage.
- Added `docs/ENRICHMENT.md` plus README and roadmap coverage.
- Dogfooded on `/home/adam/mergeLearn`; fake enrichment produced two A/B card previews and an enriched eval report with 48 concepts/12 cards, then scratch `.skilltrace` was removed.

## 2026-06-26 Batch 9

- Added local packaging/beta readiness guardrails without publishing or changing release status.
- Updated package entrypoints to built artifacts, generated declaration files, and constrained npm tarball contents to `dist/`, README, package metadata, and public top-level docs.
- Added `npm run smoke:package`, which builds, packs to `/tmp`, checks package contents, extracts the tarball, and runs packaged CLI help.
- Added package manifest regression tests that keep `private: true` and `UNLICENSED` until human name/license/distribution approval.
- Added `docs/BETA_READINESS.md` with local verification, clean-clone verification, dogfood checklist, and public-release blockers.
- Updated README and roadmap with prerequisites, local `npm link`, packaged smoke, and beta-readiness pointers.
- Dogfooded on `/home/adam/mergeLearn`; generated five review cards, two fake enriched previews, and an enriched eval report with 48 concepts/12 cards/5 enriched cards, no network use, and provenance OK; removed scratch `.skilltrace` afterward.

Verified during development:

```bash
npm test -- --run tests/packaging/packageManifest.test.ts
npm run smoke:package
npm run check && npm test && npm run build && npm run eval && npm run smoke && npm run smoke:package && npm run eval:repos -- --fixtures --with-enrichment fake --out /tmp/mergelearn-tutor-beta-fixtures
```

## 2026-06-26 Batch 10

- Added persisted manual quality ratings to the local state model via `manualRatings`.
- Added `mergelearn-tutor rate` for concept/card 1-5 ratings across relevance, evidence correctness, answerability, usefulness, and repeatability.
- Added `mergelearn-tutor ratings` summary output with averages and recent rating notes.
- Kept ratings separate from learner mastery/events so product-quality feedback does not masquerade as active recall.
- Added backward-safe state normalization for older `.skilltrace/state.json` files without ratings.
- Updated evaluation reports, README, `docs/EVALUATION.md`, and `docs/CARD_QUALITY.md` to use the persisted rating loop.
- Dogfooded on `/home/adam/mergeLearn`; recorded a card rating and a concept rating, verified averages, and removed scratch `.skilltrace` afterward.

Verified during development:

```bash
npm test -- --run tests/core/ratings.test.ts tests/core/events.test.ts tests/cli/cli.test.ts tests/eval/evaluationHarness.test.ts
npm run check && npm test && npm run build && npm run eval && npm run smoke && npm run smoke:package && npm run eval:repos -- --fixtures --with-enrichment fake --out /tmp/mergelearn-tutor-manual-ratings-fixtures
```

## 2026-06-27 Batch 11

- Researched and planned the snippet-first learning UX in `docs/plans/2026-06-27-snippet-first-learning-ux.md`.
- Changed cards to show real code snippets before questions.
- Added question planes: `language_mechanics`, `local_behavior`, `file_role`, `architecture_flow`, `risk_and_tests`, and `repo_domain`.
- Added `questionPlane`, `snippet`, and `explanationMarkdown` to learning items with backward-safe state normalization.
- Added `.skilltrace/preferences.json` with CLI commands `preferences show` and `preferences set`.
- Added `mergelearn-tutor progress` plus derived progress graph data.
- Updated the local review website with snippet-first cards, `/progress`, `/preferences`, and stable JSON endpoints: `/api/state`, `/api/progress`, `/api/preferences`.
- Added a compact preferences/onboarding page with short example-backed questions for choosing desired question categories.
- Updated the static dashboard with snippet cards, a progress hierarchy, and a lightweight SVG progress graph.
- Added docs for customization/API surface and updated card-quality/review-session docs.
- Dogfooded on a fresh demo repo and `/home/adam/mergeLearn`; verified snippets, explanations, progress, preferences page/API, no network use, and scratch cleanup.

Verified during development:

```bash
npm run check
npm test -- --run tests/core/preferences.test.ts tests/core/progress.test.ts tests/core/planner.test.ts tests/core/render.test.ts tests/core/storeDashboard.test.ts tests/session/server.test.ts
npm test
npm run build
```

## 2026-06-27 Batch 12

- Added persisted card batches and active/archived lifecycle metadata for generated flashcards.
- Added `mergelearn-tutor cards generate --count N --mode more|regenerate`.
- Added `POST /api/cards/generate` plus website “Generate 5 more” and “Regenerate 5” controls.
- Preserved history by archiving/superseding old active cards instead of deleting learning events, answers, or ratings.
- Added reusable diff-like snippet rendering with line numbers and add/delete/context styling.
- Applied diff snippets to the local review website and static dashboard.
- Redesigned the review website with a hero, queue toolbar, batch stats, polished cards, and stronger visual hierarchy.
- Ran screenshot iteration: baseline screenshot, redesigned screenshot, duplicate-heading fix, final screenshot, and browser console check.
- Dogfooded on `/tmp/mergelearn-live-demo`: CLI generation, API generation, regenerate archive counts, pages, preferences, progress, and dashboard.

Verified:

```bash
npm run check
npm test
npm run build
npm run eval
npm run smoke
npm run smoke:package
npm run eval:repos -- --fixtures --with-enrichment fake --out /tmp/mergelearn-tutor-batch12-fixtures
```

## 2026-06-27 Batch 13

- Added staged active-recall review flow: answer first, reveal explanation, then self-grade as known, partly, missed, or card-quality issue.
- Added hover/focus button highlights and shared navigation/design treatment across review, history, progress, and preferences pages.
- Added `/history` and `GET /api/cards/history` for active/archived cards, batches, and per-card events.
- Split card-quality feedback from learner failure: `marked_bad_card`, `marked_wrong_evidence`, and `marked_duplicate` do not reduce mastery.
- Preserved compact unified diff snippets with hunk headers, deletions, additions, and repo-domain snippets.
- Added focused tests for card-quality semantics, unified-diff extraction, and session history APIs.

Verified:

```bash
npm run check
npm test
npm run build
npm run eval
npm run smoke
npm run smoke:package
npm run eval:repos -- --fixtures --with-enrichment fake --out /tmp/mergelearn-tutor-batch13-fixtures
```

Demo dogfood:

- Demo repo: `/tmp/mergelearn-demo-batch13`
- Verified active/archived cards, batch history, markdown doc evidence, unified diff hunk/deletion snippets, and card-quality feedback that did not increment failed count.
- Browser-reviewed `/`, `/history`, `/progress`, and `/preferences`; console had no JS errors.

## 2026-06-27 Batch 14

- Added learning courses/tracks with goals, material paths, documentation paths, enabled question planes, and concept focus.
- Added question-bank persistence with fake/local LLM-style evidence-bound drafts, accepted/rejected statuses, draft batches, and no-network provenance.
- Added accepted-question driven course card generation through CLI and local API.
- Added evidence timeline and graph projections connecting commits, files, docs, concepts, courses, questions, card batches, cards, and review events.
- Added website pages and APIs: `/courses`, `/questions`, `/timeline`, `/graph`, `/api/courses`, `/api/questions`, `/api/evidence-timeline`, and `/api/evidence-graph`.
- Simplified `/history` into summary-first active/archived sections with raw JSON behind a secondary link.
- Added visual cleanup for question cards and graph nodes so dense generated question text is progressively disclosed or clamped.
- Added focused core, server, and CLI tests for courses, question drafting/acceptance, course-generated cards, and timeline/graph data.

Verified:

```bash
npm run check
npm test
npm run build
npm run eval
npm run smoke
npm run smoke:package
npm run eval:repos -- --fixtures --with-enrichment fake --out /tmp/mergelearn-tutor-batch14-fixtures
```

Demo dogfood:

- Demo repo: `/tmp/mergelearn-full-demo`
- Demo server: `http://127.0.0.1:4197`
- Demo state: 1 course, 5 fake/local LLM-style question drafts, 3 accepted questions, 3 active course cards, 9 archived cards, 2 batches, 35 timeline/graph nodes, 97 edges, 2 doc nodes, `networkUsed:false`.
- Browser-reviewed `/courses`, `/questions`, `/timeline`, and `/graph`; console had no JS errors.

## 2026-06-27 Documentation polish

- Rewrote the root `README.md` into a professional GitHub-facing overview with quick start, screenshots, local browser workflow, CLI examples, privacy stance, verification commands, and release blockers.
- Added `docs/USER_MANUAL.md`, a page-by-page guide for Review, Courses, Questions, Timeline, Graph, History, Progress, and Preferences.
- Added `docs/GITHUB_PUSH_READY.md`, a concrete push-readiness checklist with verification commands, expected tracked files, ignored artifacts, and public-release blockers.
- Captured fresh screenshots under `docs/assets/screenshots/` for all primary browser pages.
- Updated package metadata and packaging tests so screenshot assets are included in packaged documentation.
- Updated beta-readiness docs to mention the complete browser surface and screenshot/manual documentation.

Verified:

```bash
npm run check
npm test
npm run build
npm run eval
npm run smoke
npm run smoke:package
```

## 2026-06-27 Autonomous cycle 1: visual graph map

- Started the overnight autonomous polish branch `autonomous-platform-polish`.
- Added a real SVG evidence graph map to `/graph`, above the existing grouped node panels and raw JSON projection.
- The graph now shows lanes for Evidence, Courses, Concepts, Questions, Cards, and Events, with curved relationship edges and a compact legend.
- Added session-server regression assertions for the graph map, legend, and JSON link.
- Captured screenshot evidence under `.autoloop/screenshots/20260627T021844Z/graph-after-map.png`.

Verified:

```bash
npm run check
npm test
npm run build
npm run smoke:package
git diff --check
```

## 2026-06-27 Autonomous cycle 2: first-use Start here path

- Added a state-aware `Start here` panel to the Review page that explains the local path from empty repo to useful cards: ingest evidence, create a course, draft/accept questions, then generate/review cards.
- The panel shows completed-step counts for concepts, courses, accepted/draft questions, and active cards, with direct links to Courses, Questions, and Preferences.
- Replaced the bare no-card empty state with guidance to follow the Start here path.
- Updated session-server regression coverage and the user manual first-run instructions.
- Captured before screenshots for all primary pages and an after screenshot for the affected Review page.

Verified:

```bash
npm run check
npm test -- --run tests/session/server.test.ts
npm test
npm run build
```

## 2026-06-27 Autonomous cycle 3: guided course/question setup

- Added a state-aware `Course setup guide` to `/courses` so users can move from a fuzzy learning outcome to scoped evidence paths, drafted questions, and review cards.
- Improved the course form with clearer examples, safe-default guidance, and a direct link to question preference tuning.
- Added a `Question workflow` panel to `/questions` explaining the draft → accept → review-card pipeline.
- Added a browser `Target course` selector for fake/local question drafting so course-specific questions can be created without guessing which course the button uses.
- Updated session-server regression coverage and the user manual for the guided Courses/Questions path.
- Captured before screenshots for all primary pages and after screenshots for the affected Courses and Questions pages.

Verified:

```bash
npm run check
npm test -- --run tests/session/server.test.ts
npm test
npm run build
git diff --check
```

## 2026-06-27 Autonomous cycle 4: Review source generation

- Added an explicit `Review source` selector to the Review page so users can choose the broad due-evidence queue or target a specific course before generating cards.
- Renamed the Review generation buttons to `Generate 5 focused cards` and `Regenerate from source` to make the selected source meaningful.
- Passed the selected course id through the browser generation action to `POST /api/cards/generate`, reusing the existing course-scoped card generation behavior without enabling remote LLM calls.
- Added course and accepted-question badges to Review cards so users can see when a card came from a selected course and accepted prompt.
- Updated session-server regression coverage and the user manual for the focused Review-source flow.
- Captured before screenshots for all primary pages and an after screenshot for the affected Review page.

Verified:

```bash
npm run check
npm test -- --run tests/session/server.test.ts
npm test
npm run build
git diff --check
```

## 2026-06-27 Autonomous cycle 5: Progress and History audit guides

- Added a `Progress guide` to `/progress` explaining what changes mastery numbers: visible card generation, answered review events, source scope, and raw-progress debugging.
- Improved empty and unchanged progress groups with explicit no-concepts copy instead of empty lists.
- Added a `Source audit` panel to `/history` that separates broad repo evidence cards, course-scoped cards, accepted-question cards, and card-quality feedback.
- Clarified History empty states for recent activity, batches, active cards, and archived cards so users know which Review action populates each section.
- Updated session-server regression coverage and the user manual for the new Progress/History audit panels.
- Captured before screenshots for all primary pages and after screenshots for the affected Progress and History pages.

Verified:

```bash
npm run check
npm test -- --run tests/session/server.test.ts
npm test
npm run build
git diff --check
```

## 2026-06-27 Research packet: next improvements

- Created `docs/research/2026-06-27-next-improvements/` as a deep research handoff packet for deciding the next best platform improvements.
- Captured fresh screenshots for Review, Courses, Questions, Timeline, Graph, History, Progress, and Preferences.
- Added a current-state brief, source packet, research prompts, main recommendation packet, and design-system scaffold.
- Main recommendation: consolidate the current surface around a Learning Plan/Plan Builder, add a deterministic Card Quality Gate, clarify repo/source targeting, and professionalize the app shell before adding more pages.
