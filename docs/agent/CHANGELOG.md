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
