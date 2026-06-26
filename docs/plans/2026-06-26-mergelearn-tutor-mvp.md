# MergeLearn Tutor MVP Implementation Plan

## Read this first
This repo implements the second product idea as a separate local-first product, not as a PR gate. The right first product is a personal coding tutor that turns real git history into a transparent skill ledger, daily learning cards, and spaced explain-back review.

Current implementation default: TypeScript/Node CLI plus generated static dashboard. No SaaS, no IDE extension, no blocking checks, no required LLM calls, and no telemetry.

## Product judgment
The direction is good if it avoids becoming a generic course generator. The durable value is personal relevance: it teaches concepts because the user actually touched them in a real repo. The first version should optimize for habit, trust, and evidence links, not fancy adaptive ML.

## Research-backed refinements
- AI coding can weaken skill formation when used as an answer machine; the product should promote follow-up questions and active recall.
- Retrieval practice and spaced repetition are better than passive explanations.
- AI code-review tools compete on bug finding; this product should differentiate on learner modeling and knowledge debt.
- Expert-guided tours outperform pure AI tours, so v1 should allow transparent evidence and manual correction.

## Dependency graph
A. Repo skeleton and CLI baseline
   -> B. Git ingestion
      -> C. Concept extraction
         -> D. Local learner state
            -> E. Learning cards and review scheduling
               -> F. CLI flows
               -> G. Dashboard
                  -> H. Evaluation and dogfood

## Modules
1. Git ingestion
   - Reads commits, changed files, diff text.
   - Must never run target repo code.
2. Concept extraction
   - Deterministic pattern-based TypeScript/repo concept detection.
   - Evidence points to commit/file/path/snippet.
3. Learner state
   - Transparent JSON state in `.skilltrace/state.json`.
   - SQLite is a later migration seam because current environment is Node 20.
4. Tutor planner
   - Prioritizes recent, important, weak, and due concepts.
   - Generates concept cards, explain-back prompts, trace tasks, and risk prompts.
5. CLI and dashboard
   - `init`, `ingest`, `today`, `review`, `profile`, `map`, `debt`, `dashboard`, `explain-last-commit`.
6. Evaluation
   - Unit tests, CLI integration tests, local fixture evaluation, dogfood on MergeLearn.

## Human decisions intentionally deferred
- Product name for public launch: MergeLearn Tutor vs SkillTrace.
- License for public release.
- Whether to add optional LLM enrichment and which provider/privacy boundary.
- Whether to migrate storage to SQLite before public release.

## Acceptance criteria
- New repo builds from clean install.
- CLI can ingest a TypeScript git repo.
- Concepts are grounded in real files/commits.
- Daily review produces useful cards.
- Dashboard renders a local static HTML report.
- Tests cover extraction, planning, state updates, CLI, and evaluation.
- Dogfood run against `/home/adam/mergeLearn` produces output without secrets or telemetry.
