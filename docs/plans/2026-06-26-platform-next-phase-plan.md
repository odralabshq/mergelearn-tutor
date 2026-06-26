# MergeLearn Tutor Next-Phase Platform Plan

## Read this first

What works today: MergeLearn Tutor is a verified local-first TypeScript/Node CLI that ingests git commits, extracts deterministic concepts, stores transparent learner state, generates review cards, and renders a static dashboard. The current repo is clean except for the untracked imported research report under `docs/reserach/`.

Recommended shape: continue the product, but do not jump straight to a polished web app or LLM tutor. The next phase should make the platform truthful, correctable, and measurable before it becomes more visually impressive.

The best product goal: create a local-first, repo-aware learning loop that helps AI-heavy developers understand what they just shipped, correct the tutor when it is wrong, and return weekly because the session is short and useful.

The next build order should be: evaluation harness first, correction/event model second, AST-backed extraction third, interactive local review fourth, optional LLM enrichment last.

Human decisions soon, but not immediately blocking: product name, public license, whether public release must be open-source, whether optional LLM enrichment is allowed, and whether the next UI should be local web or IDE-first. My default is local web-first, CLI as control plane, IDE later.

Main risk: building a nicer UI on top of noisy concept extraction. If users see irrelevant cards, trust collapses. Therefore concept quality and correction loops are the critical path.

---

## 1. Inputs reviewed

Primary inputs:

- `/home/adam/mergelearn-tutor/docs/reserach/deep-research-report (2).md`
- `/home/adam/mergelearn-tutor/README.md`
- `/home/adam/mergelearn-tutor/docs/PRODUCT_CRITIQUE.md`
- `/home/adam/mergelearn-tutor/docs/DOGFOOD.md`
- `/home/adam/mergelearn-tutor/docs/plans/2026-06-26-mergelearn-tutor-mvp.md`
- current source and test tree under `src/` and `tests/`

Fresh research was also checked for:

- AI coding adoption and trust concerns.
- Retrieval practice, self-explanation, and spaced repetition.
- code tours and repo onboarding.
- AI code review and codebase-understanding tools.
- Tree-sitter / AST-based code analysis.
- local-first/privacy-sensitive developer tools.

Current repo state during planning:

```text
branch: main
last commit: 8664419 feat: build local code tutoring MVP
untracked: docs/reserach/deep-research-report (2).md and Zone.Identifier
```

I am intentionally not treating the imported research report as committed product state yet.

## 2. My verdict on the deep research report

The report is directionally strong. I agree with its central thesis: MergeLearn Tutor should not become a generic course generator, repo chat tool, manager dashboard, or PR blocker. Its best wedge is a personal, local-first, repo-aware micro-tutor for AI-heavy developers.

The report correctly identifies the biggest current weakness: the MVP proves that the loop can exist, but it does not yet prove that the generated concepts and cards are accurate, useful, habit-forming, or trustworthy across repos.

The report also correctly recommends delaying mandatory LLM use. LLMs can later improve card phrasing, examples, and explanations, but the truth source should remain grounded evidence and user correction. Default LLM grading would create privacy, hallucination, determinism, and appeal-flow problems too early.

My main refinement: the next phase should be organized as a product-validation platform, not as feature expansion. The goal is not “add AST, add UI, add LLM” as independent features. The goal is to make every card traceable, correctable, measurable, and useful in one short user session.

## 3. North-star product goal

Build a fully tested local-first code tutoring platform that lets an AI-heavy developer answer this question after each coding session:

> What did I just change, what concepts did I rely on, what do I not understand well enough yet, and what is the smallest useful review I should do now?

The platform should feel like a calm personal coach, not like school, surveillance, or another AI assistant competing for attention.

The ideal recurring loop:

```text
1. User codes with AI or manually.
2. Tutor ingests recent commits/diffs.
3. Tutor proposes 3-5 evidence-linked learning items.
4. User answers, skips, marks unsure, or corrects the tutor.
5. Tutor updates a transparent learner ledger.
6. Tutor schedules a future review based on real interaction, not passive exposure.
7. User can inspect why every recommendation exists.
```

Success means the user voluntarily returns because the session helps them understand their actual repo faster than their normal ad hoc rereading.

## 4. Fresh research synthesis

### 4.1 AI coding adoption creates the problem, but trust is the opening

Recent market summaries based on Stack Overflow, GitHub, and developer surveys consistently indicate high AI coding-tool adoption but low trust in generated output. Even when exact numbers differ by source, the pattern is stable: developers use AI coding tools, but they still need to verify, understand, and integrate the generated work.

Useful planning implication: do not position the product as “AI will teach you everything.” Position it as “stay fast with AI without losing understanding of your own repo.”

Relevant source examples:

- Stack Overflow / AI coding statistics summaries reporting high adoption but reduced trust in AI output.
- Sonar and related reporting about developers not fully trusting AI-generated code.
- METR-style findings that AI assistance can sometimes slow experienced developers on familiar codebases, making verification and comprehension more important than raw generation speed.

### 4.2 Learning science supports active recall, not passive explanation

The strongest learning mechanisms for this product are retrieval practice, self-explanation, spacing, and feedback. Passive explanations can feel useful while creating weak retention. This validates the report’s criticism of a read-only static dashboard.

Planning implication: every next UX should end in an action: answer, skip, mark unsure, correct, pin, or defer. A card that is only read is incomplete evidence.

Relevant source examples:

- Retrieval practice literature: active recall strengthens memory more than rereading.
- Spaced repetition literature: review timing matters.
- Programming education / automated feedback research: many systems over-index on correctness and short-term performance while under-serving learner agency and higher-order understanding.

### 4.3 Code tours and repo onboarding show the value of curation

The LACY/code-tour line of work is important because expert-guided tours outperform AI-only tours in reported comprehension outcomes. This strongly supports an editable/correctable tutor. The system can infer a first draft, but users need to correct labels, pin important flows, and create repo-specific concept packs.

Planning implication: correction loop before fancy graph. If the tutor guesses wrong and the user cannot fix it, the product feels untrustworthy.

### 4.4 AI review and codebase-understanding tools define the boundary

CodeRabbit, Qodo, Greptile, GitHub Copilot Review, Sourcegraph Cody, DeepWiki, and related tools already occupy the space of “review/explain/search the codebase.” MergeLearn Tutor should avoid competing head-on as another generic reviewer or chat interface.

Planning implication: the product’s defensible axis is the learner model: what this developer has touched, answered, corrected, skipped, misunderstood, and returned to.

### 4.5 AST/static analysis is the right next technical upgrade

Regex and path hints are acceptable for the MVP, but concept quality is now the bottleneck. Tree-sitter or TypeScript compiler APIs can produce symbol-aware evidence while staying local and deterministic.

Planning implication: improve extraction with an AST adapter, but keep the output explainable. Do not make the extractor an opaque model call.

### 4.6 Privacy is a product feature, not a footnote

Developer privacy concerns around AI assistants are real, especially when source code, prompts, and private repo context may leave the machine. A local-first tool with no telemetry is a strong differentiator, but only if it is tested and visible.

Planning implication: add network-off tests, ignore/redaction rules, and outbound preview before any optional LLM enrichment.

## 5. Positioning recommendation

Primary positioning:

> Understand what you shipped with AI, using your own repo history.

Secondary internal framing:

> Repay knowledge debt from AI-assisted coding.

Avoid these positions for now:

- “AI coding tutor” because it sounds generic.
- “Course generator” because it suggests passive curriculum.
- “AI code reviewer” because that market is crowded and bug-focused.
- “Developer skill analytics” because it creates surveillance concerns.
- “Knowledge graph for your repo” because graphs impress but do not guarantee habit or learning.

First ICP:

- Solo or small-team TypeScript/JavaScript developers using AI heavily on repos they do not fully understand.

Later ICPs:

- Junior developers in AI-heavy teams.
- Developers onboarding to unfamiliar repo areas.
- Agencies maintaining client codebases.
- Staff engineers creating curated onboarding packs.

Not the first ICP:

- Enterprise LMS buyers.
- Managers seeking productivity rankings.
- Schools needing graded assignments.

## 6. Dependency-aware product architecture

### 6.1 Critical dependency graph

```text
A. Evaluation harness and scoring rubric
   └── B. Correction/event model
       ├── C. AST-backed extraction and evidence ranking
       │   └── D. Better card generation
       └── E. Interactive local review session
           ├── F. Transparent learner ledger and session replay
           └── G. Privacy boundary and outbound preview
               └── H. Optional LLM enrichment experiment
```

Why this order differs from a feature wishlist:

- A better UI depends on answer/session state.
- Session state depends on a richer event model.
- Concept quality must be measured before it is optimized.
- Optional LLMs must wait until privacy boundaries exist.
- SQLite/package/IDE decisions should wait until the core habit loop is proven.

### 6.2 Target architecture after next phase

```text
src/core/git.ts
  -> CommitArtifact[]

src/core/analyzers/*
  -> RegexAnalyzer
  -> TypeScriptAstAnalyzer
  -> RepoLexiconAnalyzer
  -> ConceptCandidate[]

src/core/evidence.ts
  -> ranked file/symbol/hunk evidence

src/core/concepts.ts
  -> Concept[] after merging, correction, ranking

src/core/session.ts
  -> ReviewSession with items and event transitions

src/core/planner.ts
  -> prioritized cards based on state, evidence, corrections, due dates

src/core/store.ts
  -> local JSON now, SQLite-compatible contract later

src/ui/local-review/* or src/server/*
  -> interactive local session

src/eval/*
  -> multi-repo scoring, fixtures, manual rating exports
```

### 6.3 Module breakdown

#### Module 1: Evaluation harness

Purpose: determine whether concept extraction and card generation are good enough across repos.

Depends on: current git ingestion, concept extraction, rendering.

Blocks: AST work, correction prioritization, UI decisions.

AI can do: implement harness, fixtures, reports, scoring format, regression tests.

Human must do: rate a small sample of generated cards for usefulness and correctness.

Risk: High product risk if skipped.

#### Module 2: Correction and event model

Purpose: let the user mark wrong, unclear, duplicate, useful, skipped, or mastered items.

Depends on: stable state schema and card IDs.

Blocks: trustworthy learner model, interactive UI.

AI can do: schema/types, CLI commands, state transitions, tests.

Human must do: approve default terminology for correction actions if desired.

Risk: High trust risk if skipped.

#### Module 3: AST-backed extraction

Purpose: improve concept and evidence quality for TypeScript/JavaScript.

Depends on: evaluation harness baseline.

Blocks: richer repo-aware cards and UI confidence.

AI can do: spike TypeScript compiler API vs Tree-sitter, implement chosen adapter, tests.

Human must do: no immediate decision unless dependency choice has licensing/build concerns.

Risk: Medium technical risk, high product upside.

#### Module 4: Interactive local review

Purpose: convert static reports into a habit-forming session.

Depends on: event model and minimum correction flows.

Blocks: meaningful dogfood/user testing.

AI can do: local server or static form flow, state persistence, tests, docs.

Human must do: manually try the UX and report what feels annoying.

Risk: Medium; wrong UI can distract from core learning.

#### Module 5: Privacy and optional enrichment

Purpose: preserve trust before any LLM feature or outbound data path.

Depends on: stable card/evidence format.

Blocks: safe LLM experiments.

AI can do: config, preview, redaction, logging, network-off tests.

Human must do: approve whether any outbound LLM mode is allowed.

Risk: High if mishandled.

## 7. Implementation phases

### Phase 0: Preserve baseline and make the plan executable

Goal: make sure future work starts from a clean, documented baseline.

Tasks:

1. Commit or intentionally ignore the imported research report.
2. Add this plan to `docs/plans/`.
3. Add a short `docs/ROADMAP.md` pointer to the active plan.
4. Confirm `npm run check`, `npm test`, `npm run build`, `npm run eval`, and `npm run smoke` still pass.

Acceptance criteria:

- Current MVP behavior is unchanged.
- The active plan is discoverable from docs.
- No machine-local scratch state is committed.

### Phase 1: Multi-repo evaluation harness

Goal: make concept/card quality measurable before improving extraction or UI.

New/changed files likely:

- `src/eval/types.ts`
- `src/eval/repoRunner.ts`
- `src/eval/report.ts`
- `src/eval/rubric.ts`
- `src/eval/localEvaluation.ts`
- `tests/eval/*.test.ts`
- `docs/EVALUATION.md`

Implementation steps:

1. Define `EvaluationRun`, `EvaluatedRepo`, `ConceptFinding`, `CardFinding`, and `ManualRating` types.
2. Add an eval command or script that runs ingest-like analysis against multiple repos.
3. Emit JSON and Markdown reports.
4. Add a manual rating template for concepts and cards.
5. Add small synthetic fixture repos for stable automated tests.
6. Add a dogfood profile for `/home/adam/mergeLearn` but keep absolute-path data out of committed fixtures.

Metrics to report:

- concept count per repo
- top-3 and top-5 concept usefulness rating
- evidence path correctness
- duplicate/noise rate
- card answerability
- card actionability
- session time estimate
- correction rate once corrections exist

Acceptance criteria:

- One command produces a report for at least synthetic fixtures and one local repo.
- Reports are deterministic enough for regression tests.
- Manual rubric can be filled out by a human without reading the source code implementation.

Tests:

```bash
npm run check
npm test -- --run tests/eval
npm run eval
```

Manual test:

- Run the harness on MergeLearn.
- Rate 10 generated concepts/cards.
- Record whether at least 70% are useful and grounded.

### Phase 2: Correction and learner event model

Goal: make the tutor correctable and the learner ledger explainable.

New/changed files likely:

- `src/core/types.ts`
- `src/core/events.ts`
- `src/core/corrections.ts`
- `src/core/planner.ts`
- `src/core/store.ts`
- `src/cli.ts`
- `tests/core/events.test.ts`
- `tests/core/corrections.test.ts`

New concepts:

```ts
type ReviewEventType =
  | 'shown'
  | 'answered'
  | 'skipped'
  | 'marked_unsure'
  | 'marked_useful'
  | 'marked_wrong'
  | 'corrected'
  | 'deferred';
```

Correction types:

- wrong concept
- wrong evidence
- duplicate concept
- better label
- better explanation
- not useful now
- pin as important
- ignore this path/pattern

Implementation steps:

1. Add versioned event schema.
2. Add correction schema.
3. Add pure reducers that update concept/card state from events.
4. Add CLI commands:
   - `correct concept`
   - `correct card`
   - `mark useful`
   - `mark wrong`
   - `skip`
   - `unsure`
5. Update renderers to show why mastery changed.
6. Persist corrections and apply them on future planning.

Acceptance criteria:

- User can correct a concept label.
- User can mark a card wrong.
- Future sessions suppress or down-rank corrected mistakes.
- Profile/debt output explains why a concept is due.

Tests:

- correction persistence tests
- event reducer tests
- future-prioritization tests
- migration/backward-compatibility test for existing `.skilltrace/state.json`

### Phase 3: AST-backed TypeScript extraction

Goal: improve concept quality while preserving deterministic/local behavior.

Decision to make inside phase:

- TypeScript compiler API vs Tree-sitter.

Recommended default:

- Start with TypeScript compiler API for TypeScript/JavaScript symbol-level extraction because this repo is TypeScript, the dependency is already natural, and symbol kinds map well to concepts.
- Use Tree-sitter later if multi-language support becomes a priority.

New/changed files likely:

- `src/core/analyzers/types.ts`
- `src/core/analyzers/regexAnalyzer.ts`
- `src/core/analyzers/typescriptAstAnalyzer.ts`
- `src/core/evidence.ts`
- `src/core/concepts.ts`
- `tests/core/analyzers/*.test.ts`

Concepts to detect first:

- exported function
- exported type/interface
- discriminated union
- generic type/function
- async function/promise flow
- import/export dependency
- test file and tested symbol
- validation schema/parser
- CLI command handler

Acceptance criteria:

- AST analyzer improves precision on evaluation fixtures.
- Evidence includes path plus symbol or hunk location where possible.
- Regex analyzer remains as fallback.
- No target repo code is executed.

Tests:

- true-positive fixtures for each concept.
- false-positive fixtures for path-only traps.
- evidence ranking tests.
- eval comparison report before and after AST analyzer.

### Phase 4: Better card generation

Goal: convert higher-quality concepts/evidence into better learning items.

New card types:

- explain-back
- trace-flow
- spot-risk
- nearest-test
- compare-pattern
- code-tour-step
- correction-review

Card quality rules:

- every card must have evidence
- every card must be answerable from repo context
- no card should be generated from a vague path token alone
- no passive mastery increase above the no-recall cap
- card prompt must say exactly what the user should do

Acceptance criteria:

- Cards are ranked by importance, recency, weakness, and correction history.
- Cards include “why this card” explanations.
- User can see source evidence without opening the full dashboard.

Tests:

- card generation unit tests
- no-evidence no-card tests
- ranking tests
- dogfood output inspection on MergeLearn

### Phase 5: Interactive local review surface

Goal: make the primary habit loop actionable without leaving the product.

Recommended default:

- Build a local web review surface launched by CLI, not an IDE extension yet.
- Keep the CLI as the control plane.
- Use a minimal local server or generated local HTML with a small state-update endpoint. Choose the simplest option that can persist events reliably.

Why not IDE yet:

- IDE integration is convenient but adds packaging and permission complexity.
- The core habit loop must work before placing it inside an editor.

Required UX:

1. Start session from CLI:

```bash
mergelearn-tutor session --repo .
```

2. Browser opens local page.
3. User sees 3-5 cards.
4. For each card user can:
   - answer
   - skip
   - mark unsure
   - mark wrong
   - correct label/evidence
   - pin as important
5. End screen shows:
   - what changed in the learner ledger
   - next review date
   - unresolved corrections

Acceptance criteria:

- Session can be completed in under eight minutes.
- State updates without manual JSON edits.
- UI explains why each card was shown.
- User can correct a bad card in one flow.

Tests:

- local session API tests
- Playwright or lightweight browser smoke if a real server is used
- state transition integration tests
- manual UX checklist

### Phase 6: Repo lexicon and concept packs

Goal: move from generic TypeScript concepts toward repo-specific understanding.

New files/config:

```text
.skilltrace/concepts.json
.skilltrace/lexicon.json
.skilltrace/ignore.json
```

Possible committed repo config later:

```text
.mergelearn-tutor/concepts.json
.mergelearn-tutor/flows.json
```

Capabilities:

- add custom concept
- alias extracted concept
- pin important flow
- ignore noisy path or token
- define prerequisites lightly
- add examples and explanations

Acceptance criteria:

- A user can define a repo-specific concept without editing source code.
- Extractor and planner use local lexicon overrides.
- Corrections can promote into lexicon entries.

Tests:

- concept pack merge tests
- local override precedence tests
- ignored pattern tests
- dogfood with one custom MergeLearn concept

### Phase 7: Privacy boundary and outbound preview

Goal: make optional future enrichment safe by construction.

This phase should come before any remote LLM feature.

Capabilities:

- default no-network mode
- explicit config for outbound providers
- exact outbound prompt/content preview
- redaction rules
- ignore paths
- local audit log of sent payload metadata
- fail-closed behavior if config is incomplete

Files likely:

- `src/core/privacy.ts`
- `src/core/redact.ts`
- `src/core/outboundPreview.ts`
- `src/core/config.ts`
- `tests/core/privacy.test.ts`
- `docs/PRIVACY.md`

Acceptance criteria:

- No network calls happen in default commands.
- Optional enrichment cannot run without explicit config.
- User can inspect exactly what would leave the machine.
- Redaction test covers obvious secrets and private paths.

Tests:

- network-off tests using a blocked/fake fetch layer
- config failure tests
- redaction tests
- outbound-preview snapshot tests

### Phase 8: Narrow optional LLM enrichment experiment

Goal: test whether LLMs improve learning item quality without making them the truth source.

Allowed uses:

- rewrite card wording for clarity
- create a worked example from grounded evidence
- suggest alternate phrasing
- generate follow-up questions from evidence

Disallowed uses initially:

- default grading
- final concept truth
- hidden extraction
- hidden source upload
- manager-facing skill scoring

Acceptance criteria:

- Deterministic card still exists without LLM.
- LLM output is labeled as enrichment.
- User can compare deterministic vs enriched card.
- Evaluation harness can rate both versions.

Tests:

- fake provider tests
- no-provider fallback tests
- outbound preview tests
- card provenance tests

### Phase 9: Packaging, naming, and public beta readiness

Goal: prepare for real users only after the core loop is useful and trustworthy.

Human decisions required:

- Name: MergeLearn Tutor vs SkillTrace vs another name.
- License: OSI open source, source-available, private, or dual license.
- Distribution: npm package, GitHub release, local install script, or all three.
- Public positioning: personal AI-era learning companion vs developer onboarding tool.

Readiness checklist:

- evaluation harness exists
- correction loop exists
- privacy docs exist
- local review UX exists
- install docs verified from clean clone
- no accidental telemetry
- no committed personal `.skilltrace` state
- public README has clear privacy and limitation statements

Do not start public marketing before these are true.

## 8. Concrete implementation batches

### Batch 1: Evaluation foundation

Goal: make current output measurable.

Why first: it prevents building on top of unmeasured extraction quality.

Tasks:

1. Add eval result types.
2. Add fixture repo builder utilities.
3. Add synthetic repos for TypeScript utility, CLI, React, and backend/API shapes.
4. Add eval runner over a list of repo paths.
5. Add JSON and Markdown eval reports.
6. Add manual rating rubric.
7. Add `npm run eval:repos` script.
8. Dogfood on MergeLearn and save a non-personal summarized report.

Verification:

```bash
npm run check
npm test -- --run tests/eval
npm run eval
npm run eval:repos -- --fixtures
```

Manual checkpoint:

- Human rates 10 concepts/cards from MergeLearn dogfood.
- If fewer than 7 of 10 are useful and grounded, pause UI work and improve extraction first.

### Batch 2: Correction/event model

Goal: user can fix the tutor and the state explains itself.

Tasks:

1. Define event and correction types.
2. Add reducer functions.
3. Add migration/defaulting for existing state.
4. Add CLI commands for correction and feedback.
5. Update `today`, `review`, `profile`, and `debt` renderers.
6. Add tests for all state transitions.

Verification:

```bash
npm run check
npm test -- --run tests/core/events.test.ts tests/core/corrections.test.ts
npm test
```

Manual checkpoint:

- Run on MergeLearn.
- Mark a bad concept wrong.
- Confirm it is down-ranked or suppressed in the next session.

### Batch 3: AST extraction spike and implementation

Goal: replace shallow concept detection where it matters most.

Tasks:

1. Spike TypeScript compiler API on 5 changed-file fixtures.
2. Compare against Tree-sitter in a short decision note.
3. Implement analyzer interface.
4. Move current regex logic behind `RegexAnalyzer`.
5. Add `TypeScriptAstAnalyzer`.
6. Add evidence ranking.
7. Update concept merge logic.
8. Compare eval reports before/after.

Verification:

```bash
npm run check
npm test -- --run tests/core/analyzers
npm run eval:repos -- --fixtures --compare-baseline
```

Decision rule:

- Keep AST analyzer if precision improves without too much complexity.
- Revert to regex/correction focus if AST output becomes noisy or expensive.

### Batch 4: Interactive local session

Goal: the user can complete a real review loop.

Tasks:

1. Add `ReviewSession` type.
2. Add session creation and completion APIs.
3. Add `mergelearn-tutor session --repo .` command.
4. Serve or generate local review UI.
5. Add actions for answer, skip, unsure, wrong, useful, correct.
6. Add end-of-session summary.
7. Add browser/local smoke test.
8. Add manual UX checklist.

Verification:

```bash
npm run check
npm test
npm run smoke
npm run eval
```

Manual checkpoint:

- Human completes one session on MergeLearn in under eight minutes.
- Record three annoyances and fix the top one before moving on.

### Batch 5: Repo lexicon and concept packs

Goal: make the tutor repo-aware and correctable over time.

Tasks:

1. Define local lexicon config.
2. Add parser/validator.
3. Merge lexicon with extracted concepts.
4. Promote corrections into suggested lexicon entries.
5. Add CLI commands to list/add/edit concepts.
6. Add dogfood concept pack for MergeLearn.

Verification:

```bash
npm run check
npm test -- --run tests/core/lexicon.test.ts
npm test
```

Manual checkpoint:

- Add one custom MergeLearn concept.
- Confirm it appears in future cards with correct evidence.

### Batch 6: Privacy boundary

Goal: make future enrichment safe.

Tasks:

1. Add config schema.
2. Add ignore path handling.
3. Add redaction helpers.
4. Add outbound preview renderer.
5. Add no-network default tests.
6. Add `docs/PRIVACY.md`.

Verification:

```bash
npm run check
npm test -- --run tests/core/privacy.test.ts
npm test
```

Human checkpoint:

- Approve or reject optional remote LLM enrichment after seeing the preview UX.

### Batch 7: Optional LLM enrichment experiment

Goal: test if LLM improves card quality after trust boundaries exist.

Tasks:

1. Add fake provider interface.
2. Add optional local/remote provider config.
3. Add enrichment command behind explicit flag.
4. Enrich wording only, not truth.
5. Add A/B eval output.
6. Add tests for provenance and fallback.

Verification:

```bash
npm run check
npm test
npm run eval:repos -- --fixtures --with-enrichment fake
```

Decision rule:

- Keep if users rate enriched cards meaningfully better.
- Remove or defer if it adds privacy concern without usefulness gain.

## 9. Testing strategy

### Automated tests

Required layers:

1. Unit tests for pure reducers and analyzers.
2. Integration tests for CLI flows.
3. Fixture-based evaluation tests.
4. Snapshot/golden tests for Markdown and dashboard output.
5. Privacy boundary tests.
6. Migration tests for state versions.
7. No-target-execution tests.

### Dogfood tests

Dogfood must inspect real rendered output, not just pass commands.

Minimum dogfood targets:

1. `/home/adam/mergeLearn` as sibling product repo.
2. Synthetic fixture repos with known concepts.
3. One small public TypeScript utility repo.
4. One medium public TypeScript app/repo if time allows.

Dogfood acceptance questions:

- Are top cards useful?
- Are labels too generic?
- Is evidence correct?
- Is the prompt answerable?
- Does the session feel short?
- Can a wrong concept be corrected quickly?
- Is privacy behavior obvious?

### Manual UX tests

Manual test: first review session.

Steps:

1. Run ingest on a real repo.
2. Start local session.
3. Complete 3 cards.
4. Mark one card wrong.
5. Correct one label.
6. End session.
7. Inspect profile/debt.

Expected result:

- User understands why each card appeared.
- State updates are visible.
- Session takes under eight minutes.
- Wrong/corrected content affects future sessions.

### Failure gates

Pause expansion if:

- top-3 useful concept precision below 70%
- more than 20% of cards are irrelevant or unanswerable
- median session time over eight minutes
- user cannot tell why mastery changed
- user expresses privacy discomfort
- corrections do not improve future output

## 10. Human bottleneck points

| Human action | Why needed | When needed | Prepared artifact | Estimated effort | Can batch? |
|---|---|---|---|---|---|
| Rate 10 generated cards from MergeLearn dogfood | AI cannot judge user-perceived usefulness alone | After Batch 1 | eval report + rubric | 15-25 min | Yes |
| Try first interactive review session | UX friction must be felt by actual user | After Batch 4 | local session URL + checklist | 10-15 min | Yes |
| Decide product name/license | Public packaging depends on this | Before public beta | naming/license options doc | 10-20 min | Yes |
| Approve optional remote LLM mode | Privacy/cost/security decision | Before Batch 8 | outbound preview + privacy doc | 10 min | Yes |
| Decide whether to publish npm package | External side effect | After beta readiness | release checklist | 10 min | Yes |

## 11. Decisions and recommended defaults

| Decision | Needed now? | Recommended default | Risk if wrong |
|---|---|---|---|
| Build UI before eval? | Yes | No. Eval first. | Polished wrong output. |
| AST library | Soon | TypeScript compiler API first. | Tree-sitter may be better later for multi-language, but TS API is faster for this stack. |
| Local web vs IDE | Soon | Local web first, CLI control plane. | IDE too early adds packaging complexity. |
| LLM enrichment | Not now | Defer until privacy boundary exists. | Trust loss if code leaves machine unexpectedly. |
| SQLite migration | Not now | Keep JSON until event/session queries become painful. | Premature migration slows learning-loop validation. |
| Public license | Before public beta | Decide later explicitly. | Wrong license is hard to unwind. |

## 12. Risk register

### Product risk: generated cards are not useful

Likelihood: High until evaluated.

Impact: High.

Mitigation: evaluation harness, manual rubric, failure gates, correction loop.

### Product risk: user does not return

Likelihood: Medium.

Impact: High.

Mitigation: shorter sessions, end-of-session payoff, weekly rhythm, UX dogfood.

### Technical risk: AST extraction becomes overbuilt

Likelihood: Medium.

Impact: Medium.

Mitigation: spike first, compare precision, keep regex fallback.

### Trust risk: tutor guesses wrong and cannot be corrected

Likelihood: High with current MVP.

Impact: High.

Mitigation: correction/event model before UI polish.

### Privacy risk: optional LLM mode leaks source

Likelihood: Low if deferred, high if rushed.

Impact: High.

Mitigation: no-network default tests, outbound preview, redaction, explicit config.

### Data risk: state schema evolves without migrations

Likelihood: Medium.

Impact: Medium.

Mitigation: versioned state schema and migration tests in Batch 2.

### UX risk: dashboard overwhelms

Likelihood: Medium.

Impact: Medium.

Mitigation: make interactive session the primary surface; keep graph inspectable but secondary.

## 13. First sprint: exact recommended plan

Sprint goal:

> Make the platform measurable and correctable enough that we can decide whether to build the interactive session UI.

Scope:

- Batch 1 evaluation foundation.
- First half of Batch 2 correction/event model.
- No AST yet except small spike notes if time remains.
- No web UI yet.
- No LLM mode.

Deliverables:

1. `docs/EVALUATION.md`
2. `src/eval/types.ts`
3. `src/eval/repoRunner.ts`
4. `src/eval/report.ts`
5. `tests/eval/*.test.ts`
6. `src/core/events.ts`
7. `src/core/corrections.ts`
8. `tests/core/events.test.ts`
9. `tests/core/corrections.test.ts`
10. updated `README.md` with evaluation/correction commands if implemented

Sprint verification:

```bash
npm run check
npm test
npm run build
npm run eval
npm run smoke
```

Sprint dogfood:

```bash
node dist/cli.js ingest --repo /home/adam/mergeLearn --since 30d --limit 30
node dist/cli.js today --repo /home/adam/mergeLearn
node dist/cli.js debt --repo /home/adam/mergeLearn
npm run eval:repos -- --repo /home/adam/mergeLearn --out /tmp/mergelearn-tutor-eval
```

Sprint success criteria:

- We can produce an eval report.
- We can rate generated concepts/cards.
- We can record at least one correction or wrong-card event.
- The correction affects subsequent output.
- All tests pass.

## 14. What not to build yet

Do not build these until the above gates pass:

- manager/team dashboard
- cloud sync
- mandatory account system
- default remote LLM grading
- polished graph UI
- VS Code/JetBrains extension
- multi-language support beyond TypeScript/JavaScript
- course/certificate mechanics
- public npm release
- browser extension
- GitHub App

Reason: each adds surface area before the core learning loop is proven.

## 15. Research/source appendix

Fresh research references checked while writing this plan:

- AI coding adoption/trust summaries:
  - `https://uvik.net/blog/ai-coding-assistant-statistics/`
  - `https://devops.com/survey-sees-wider-adoption-of-ai-coding-tools-creating-more-devops-challenges/`
  - `https://modall.ca/blog/ai-in-software-development-trends-statistics`
- Retrieval practice / spaced review:
  - `https://pmc.ncbi.nlm.nih.gov/articles/PMC12292765/`
  - `https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2025.1632206/full`
  - `https://evidencebased.education/resource/retrieval-and-spaced-practice-study-strategies-that-must-be-combined/`
- Code tours / onboarding:
  - `https://arxiv.org/html/2603.25391v1`
  - `https://github.com/LefterisXris/CodeTour`
  - `https://github.com/Tour-de-Code-AI/Tour-de-Code-AI`
- AI review / codebase context competitors:
  - `https://www.qodo.ai/`
  - `https://www.deployhq.com/blog/ai-code-review-tools-compared-coderabbit-copilot-sourcery-ellipsis`
  - `https://getoptimal.ai/blog/best-ai-code-review-tools`
- AST/static analysis:
  - `https://dev.to/shrsv/unraveling-tree-sitter-queries-your-guide-to-code-analysis-magic-41il`
  - `https://graphify.net/tree-sitter-ast-extraction.html`
  - `https://www.dropstone.io/blog/ast-parsing-tree-sitter-40-languages`
- Privacy/local-first developer tooling:
  - `https://unit42.paloaltonetworks.com/code-assistant-llms/`
  - `https://posit.co/blog/trust-llm-tools`
  - `https://www.augmentcode.com/guides/how-to-protect-code-privacy-when-using-ai-assistants`

Caveat: some market-stat pages are secondary summaries. Use them as directional market signals, not as the sole basis for investor-grade claims. For public materials, prefer primary Stack Overflow, GitHub, Sonar, METR, and academic sources where available.

## 16. Instructions for the next implementation agent

Start here:

1. Read this plan.
2. Read `docs/reserach/deep-research-report (2).md`.
3. Read `README.md`, `docs/PRODUCT_CRITIQUE.md`, and `docs/DOGFOOD.md`.
4. Run:

```bash
npm run check
npm test
npm run build
npm run eval
npm run smoke
```

Then implement Batch 1 only.

Do not start with AST extraction or UI. The first implementation slice must create the evaluation harness, because every later product decision depends on measuring whether generated concepts/cards are grounded and useful.

After Batch 1:

- produce an eval report
- dogfood on MergeLearn
- add tests
- summarize failures honestly
- only then proceed to correction/event model

## 17. Definition of “fully tested and working platform”

The platform should not be called fully working until all of these are true:

1. It can analyze multiple TypeScript/JavaScript repos reproducibly.
2. It produces useful, evidence-linked learning items for real repos.
3. Users can correct bad concepts/cards.
4. Corrections affect future output.
5. Users can complete an interactive review session.
6. The learner ledger explains why mastery/confidence changed.
7. Passive exposure cannot masquerade as mastery.
8. No code leaves the machine by default.
9. Any optional outbound enrichment has preview, redaction, and logs.
10. Full verification passes from clean clone.
11. Dogfood output has been manually inspected, not just generated.
12. At least one external/user-style evaluation shows the weekly loop is useful.

That is the real finish line. A prettier dashboard without these guarantees is not enough.
