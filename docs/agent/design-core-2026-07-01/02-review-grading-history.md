# Core Redesign - Review, Grading, and History

Date: 2026-07-01
Author: Claude Opus 4.8 (via kiro)
Status: design, not yet implemented
Parent: `../CORE_PLATFORM_PLAN_2026_07_01.md`
REFINED: see `05-review-and-refinements.md`. The MoA review added an independent answer-key validator, removed confidence from the FSRS Rating path, and renamed the guardrails. Where this doc and 05 differ, 05 wins. Inline corrections marked [REFINED].

## Goal

Make the difficulty signal honest and capture everything for later reflection. Three parts: always-on history capture, LLM answer grading, and the verification guardrails that make an LLM-only author trustworthy. Time: 4-5 days.

## Current state (grounded)

- `recordReviewEvent` (events.ts:27-50) already stores `answerText`, `confidenceBeforeReveal` (1-5, validated), and `correct` on a `LearningEvent`. History capture is largely already there.
- The scheduler is ad-hoc: `updateConceptStateForEvent` (events.ts:113-133) sets `nextReviewAt: addDays(now, isCorrect ? 3 : 1)` and mastery/confidence via fixed `+0.18/-0.12` deltas. This is what FSRS replaces (doc 03 owns the scheduler swap; this doc owns the grade that feeds it).
- `DelayedProbe` hardcodes `intervalDays: 2 | 7` (types.ts:224). Removed once FSRS owns scheduling.
- There is no LLM grading today; `correct` is a caller-supplied boolean (self-grade).

## History capture (mostly done; make it complete)

The `LearningEvent` schema already captures what matters. Two small changes:

- Confidence-only reviews are first-class. A `revealed` event already requires `confidenceBeforeReveal` (1-5). Make the review loop able to end on a confidence rating alone (no typed answer) and treat that as a complete, valid review event - do not force typing. This is the low-friction default many users will use.
- Add a grade field. Extend `LearningEvent` with an optional `grade: 'correct' | 'partial' | 'incorrect'` and `gradeSource: 'self' | 'llm'`. `correct: boolean` stays for back-compat but `grade` is the richer signal FSRS maps from.

Capture is always-on, offline, and cheap. It never depends on a model being available. This is deliberate: history must accumulate before any judge runs so the judgment phase (doc 03 / ideas log) has data.

## LLM answer grading (when a typed answer exists)

A new function `gradeAnswer(item, answerText)` in `src/core/grader.ts`:

- Input: `{ question, expectedAnswer, expectedFocus, snippet, userAnswer }`.
- Output (JSON via `llmClient.completeJson`): `{ verdict: correct|partial|incorrect, gap: string, missedFocus: string[] }`.
- The verdict maps to FSRS `Rating`: correct->Good (or Easy if confidence was high and answer full), partial->Hard, incorrect->Again. [REFINED by doc 05: confidence must NOT drive FSRS.] Confidence is a pre-reveal feeling, not demonstrated recall; feeding it as a Rating corrupts stability. FSRS `Rating` is derived ONLY from a graded retrieval outcome (LLM grade, or self-marked correct/incorrect after reveal). Confidence-only reviews are recorded in history for calibration analysis but schedule a near-term re-show via a simple rule, NOT via an FSRS Rating.
- Fallback: if no model is configured or the call fails, fall back to the self-grade boolean. Grading is an enhancement, never a hard dependency - same rule as authoring.

The gap string is the tutor moment: instead of a bare "wrong," the user sees what a correct answer needed. It is stored on the event (`note`) for the history judge to cluster later.

## Verification guardrails (the trust layer)

This is the repurposed deterministic code - validator, not author. A new `src/core/verify.ts` runs before any authored card is saved. It reuses the scoring shape already in `cardQuality.ts` (types.ts:29-39, the 5-score `CardQualityResult`). Checks:

- Citation check: `snippetPath` exists and the line range is real (resolve via `readRange`).
- Grounding check: the saved snippet is the fetched code, not model-reproduced text (structural, per doc 01's cite-don't-reproduce contract).
- Schema check: JSON matches `CardDraft`; required fields non-empty.
- Anti-trivia heuristic: reject prompts that are pure definition lookups (reuse the specificity/answerability scores).
- Dedup check: reject near-duplicate prompts against existing active items for the concept.

A card that fails citation or grounding is rejected (regenerate once, then skip). A card that only trips the soft heuristics is saved with `quality.verdict = 'needs_review'` rather than blocked. This mirrors the existing `CardQualityVerdict` (ready/needs_review/blocked).

## Time breakdown (4-5 days)

- History: confidence-only path + `grade`/`gradeSource` fields + migration: 1 day.
- `grader.ts` + Rating mapping + fallback: 1.5 days.
- `verify.ts` (reusing cardQuality scores) + regenerate-once loop: 1.5 days.
- Wiring into `recordReviewEvent` + tests: 1 day.