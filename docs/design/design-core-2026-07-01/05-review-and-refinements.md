---
type: design
title: "Core Redesign: Review Judgment and Refinements"
description: "MoA multi-model review verdicts and the inline refinements they drove."
resource: docs/design/design-core-2026-07-01/05-review-and-refinements.md
tags: [design, core, review, moa]
timestamp: 2026-07-01
---

# Core Redesign - Review Judgment and Refinement Log

Date: 2026-07-01
Author: Claude Opus 4.8 (via kiro)
Status: records the MoA review of docs 00-04 and the resulting refinements
Review source: Hermes MoA (mixture of agents), preset "default" - reference models kimi-k2.7-code, minimax-m3, deepseek-v4-pro; aggregator glm-5.2; via opencode-go. Raw output archived at /tmp/mlt_moa_review.md (session 20260702_231503_9b1323).

## How to read this doc

The MoA critique was rigorous and largely correct. This log records each critique, my verdict (accept / accept-in-spirit / reject-with-reason), and the concrete change made to docs 00-04. Two critiques were near-fatal to the core claim and are fixed as first-class design elements, not footnotes.

## The two critiques that change the design most

### A. The answer-key oracle problem (ACCEPT - highest priority)

Critique: the LLM authors the question AND the `expectedAnswer`, then `gradeAnswer` grades the user against that same model-written key. The same fallible author writes the question, the key, and the grade. Nothing re-derives correctness from the code. verify.ts checks provenance (is the snippet real) not correctness (is the answer true). A confidently-wrong key marks a right user wrong, or trains the user on the model's misconception.

Verdict: correct, and it is the single most dangerous hole in the set. "Deterministic verification makes an LLM-only author trustworthy" was overstated - verification proved groundedness, not truth.

Fix (doc 02): add an answer-key validation step at authoring time, separate from the author call. A second, independent LLM pass (different prompt, ideally different model slot) must re-derive the answer from the snippet alone and agree with the author's `expectedAnswer`; disagreement downgrades the card to `needs_review` or triggers one regenerate. At grade time, the grader is given the snippet as the oracle and instructed that the stored `expectedAnswer` is a reference, not ground truth - it must grade against the code. This is now a named guardrail, not an assumption.

### B. Commit drift / no SHA pin (ACCEPT - fatal for "grounded")

Critique: cards store `snippetPath` + line range and re-fetch via `readRange` at review time. This is a repo under active development; the next commit shifts line numbers and the card points at unrelated code. No pinning, no re-resolve-by-symbol, no invalidation on file change. The grounding guarantee evaporates on the first refactor.

Verdict: correct and close to fatal for a tool whose pitch is "grounded in real code." I under-specified snippet identity.

Fix (doc 01 + doc 02): pin every card's evidence to the commit SHA it was authored against (the `CommitArtifact.externalId`/`EvidenceRef.commit` fields already exist - types.ts:42, 83). Store the snippet TEXT at author time (immutable), plus path+range+SHA for provenance. At review time show the stored text; separately run a staleness check that re-resolves the symbol at HEAD and flags "code changed since authored" rather than silently showing stale lines. Card invalidation on drift becomes a background check, not a review-time surprise.

Note this reverses doc 01's "cite-don't-reproduce" rule. The right rule is "cite AND store the fetched text, pinned to a SHA" - reproduce from a verified fetch, not from the model, and freeze it. The anti-hallucination goal is preserved (text comes from a real `readRange`, not the model); the drift problem is fixed (text is frozen at a known SHA).

## FSRS critiques (doc 03)

- Wrong regime, not just unfit params (ACCEPT-IN-SPIRIT). Reviewer: at 12-50 concepts over a few weeks, FSRS may never reach the volume where it beats a trivial scheme, so it could be a non-win, not a deferred win. Verdict: fair. Refinement: keep FSRS (its per-card stability model is still better-behaved than the +0.18/-0.12 deltas even at low volume, and it removes hand-tuned magic numbers) but drop the framing that implies a review-count win is coming. It is adopted for a principled, parameter-free-ish scheduler, full stop.
- Confidence->Rating corrupts stability (ACCEPT). Reviewer: confidence is a pre-reveal feeling, not demonstrated recall; feeding it as an FSRS Rating corrupts stability. Correct and I missed it. Fix: FSRS Rating is derived ONLY from a graded retrieval outcome (LLM grade, or self-marked correct/incorrect after reveal). Confidence-only reviews are recorded in history for calibration analysis but do NOT drive FSRS - they schedule a near-term re-show via a simple rule, not a Rating. This cleanly separates "how I felt" from "did I recall."
- Default learning_steps are minutes (ACCEPT). Reviewer: FSRS defaults (1m/10m) suit one Anki sitting; this tool opens once a day. Fix: set `learning_steps`/`relearning_steps` to daily-cadence values and set `enable_short_term` off. Named as a required config, not left to defaults.
- Mastery formula undefined (ACCEPT). Reviewer: the state machine gates on `masteryEstimate >= 0.8` but FSRS emits stability/difficulty/due, not mastery. Real gap. Fix: define mastery as a function of FSRS retrievability at a horizon (e.g. predicted recall probability at +7 days) combined with reps/lapses; specify it explicitly in doc 03.
- Migration resets everyone (ACCEPT). Reviewer: discarding delayedProbes cold-starts every deck at once. Fix: on migration, seed each existing card's FSRS state from its current `masteryEstimate`/`lastTestedAt` so due dates are staggered, not all-at-once. Lossy for schedule precision, but no thundering herd.

## Graph critiques (doc 03)

- Really 1 edge, not 3 (ACCEPT-IN-SPIRIT). Reviewer: only `prereq_of` is used; `is_a`/`relates_to` traverse nothing, so by the design's own rule they shouldn't exist yet. Fair hit on the "3 as simplification from 10" theater. Refinement: ship `prereq_of` as the load-bearing edge; keep `is_a` because the Map/Workbench render concept hierarchy (a real consumer), and DROP `relates_to` until a feature traverses it. Honest count: 2 edges, each with a named consumer.
- Author context needs contradict the cut (ACCEPT, reframe). Reviewer: doc 01 recomputes caller/callee + git evidence every run because the graph can't persist `uses_evidence`/`from_commit`. Verdict: correct that it is recomputed, but persisting those as first-class graph edges is premature; the right fix is a per-card cache of resolved evidence (keyed by SHA), not new edge kinds. Recorded as a cache, not a graph change.
- Who verifies prereq edges (ACCEPT). Reviewer: a hallucinated prerequisite mis-classifies ready/blocked. Same "LLM authors, nothing verifies" hole as (A), extended to structure. Fix: prereq edges proposed by the LLM are advisory - they influence ordering but a `blocked` concept is always still reviewable on demand (never hard-locked), so a wrong edge degrades ordering, not access.

## Removal-list critiques (doc 00)

- Deleting the staging area (questionBank) removes the only pre-schedule catch (ACCEPT, partial). Reviewer: with direct-write, the first time anyone sees a card it is already scheduled, and the `needs_review` triage doc 02 reinvents was the draft batch's job. Verdict: correct that the need reappears. Fix: keep a lightweight `pendingReview` staging status on `LearningItem` (not the full questionBank/questionDraftBatches two-collection pipeline). Cards land in `pending` until they clear verification AND answer-key validation, then promote to active. This restores the catch without restoring the deleted machinery. So: still remove `questionBank`/`questionDraftBatches` as collections, but the staging CONCEPT survives as a status on the item.
- studyAssignments = the only objective measurement harness (ACCEPT-IN-SPIRIT). Reviewer: you can't "tune empirically" after deleting your only measurement, and "eyeball them" is the biased signal A/B existed to correct. Verdict: the strongest process critique. But the full A/B crossover apparatus is heavier than a solo local tool needs. Refinement: delete `studyAssignments`, but add a lightweight card-quality eval set (doc 05 addendum below) - a fixed set of held-out concepts with human-labeled "good/bad" cards, run as an offline metric during the tuning buffer. This gives an acceptance criterion without the crossover-study scaffolding.
- manualRatings (REJECT-with-reason). Reviewer: nothing rates card quality after this deletion. Verdict: partially wrong - the existing `ReviewEventType` values `marked_bad_card`, `marked_useful`, `marked_wrong_evidence`, `marked_duplicate` (types.ts:18) already capture per-card quality signal inline in the review flow, and `corrections` drives suppression/pinning. manualRatings was a separate 5-axis form on top of that. Decision: still remove the redundant form, but doc 00 now explicitly names these event types as the retained card-quality signal so the capability is not silently lost.
- cardBatches gives bulk rollback (ACCEPT). Reviewer: when a prompt tweak poisons a batch and step 7 is "tune and regenerate repeatedly," batch-level revert is worth more, not less. Correct. Decision: KEEP `cardBatches`. Reversed from doc 00's "remove if UX doesn't need it."

## Delivery critiques (doc 04)

- Hosted-mode tool delegation breaks the trust layer (ACCEPT). Reviewer: if the host's read/grep has different semantics than what authored the card, verification runs against different behavior; "only the tool source differs" is exactly where grounding bugs live. Fix: verify.ts and the frozen-snippet fetch ALWAYS run on MergeLearn's built-in tools, even in hosted mode. The host agent may drive orchestration and supply the authoring LLM, but the grounding/verification path is never delegated. Named explicitly in doc 04.
- State-file race (ACCEPT). Reviewer: host agent + human CLI both writing `.skilltrace/state.json`, no lock. Fix: add a file lock (lockfile or atomic write-and-rename with a version check) around state writes. Named in doc 00's storage section.
- "any LLM" collides with strict JSON; author has no fallback (ACCEPT). Reviewer: weak local endpoints do not reliably honor json_object, and unlike the grader the author has no fallback, so the advertised "point at Ollama" produces empty decks. Fix: author gets a tolerant JSON path (extract-and-repair the first JSON object, retry with a stricter instruction) before the regenerate-once/skip cascade, and doc 04 states the honest capability tier: strong models get full quality, weak local models may degrade. No false "any LLM works identically" promise.

## Sequencing and budget critiques (doc 04)

- Budget doesn't sum (ACCEPT). Reviewer: parts sum to 25-35 days, headline says 4.5-6 weeks, and none of the new work above is budgeted. Fix: revised budget below, and the headline is raised and reconciled with the sum.
- Steps 2 and 3 ordered wrong (ACCEPT). Reviewer: the "first real quality test" at step 2 uses an author without the neighbor/git context step 3 adds, so tuning is against a crippled author. Fix: SWAP - context tools (old step 3) move before the prompt+exemplar tuning. You tune the author with its real inputs present.
- Burning the boats first (ACCEPT). Reviewer: step 0 does the lossy migration and deletes measurement before step 4 proves the loop. Fix: keep the deterministic author and the removed collections behind a feature flag / on a branch until step 4 validates the new loop; the destructive migration is the LAST step, not the first. Simplification stays first as code-level dead-path removal, but data-destructive deletion waits for validation.
- Buffer unfalsifiable (ACCEPT). Reviewer: tuning needs a metric; eyeballing is biased. Fix: the card-quality eval set (above) is the acceptance criterion for the buffer. "Done" = eval score threshold, not vibes.

## Blind-spot critiques (cross-cutting)

- Privacy contradiction (ACCEPT - important). Reviewer: a local/privacy-first tool that defaults to OPENAI_API_KEY and lists OpenAI first ships private code + diffs to a cloud LLM by default. Directly contradicts the product identity (and my own memory of this project's positioning). Fix: doc 04 leads with a LOCAL endpoint default (Ollama/LM Studio) and treats cloud as explicit opt-in with a one-time consent prompt that names what leaves the machine. This is now a first-class requirement, not a config footnote.
- Cost/latency blindness (ACCEPT). Reviewer: 1 call/card, regenerate doubles it, grader adds calls, no batching/budget. Fix: add a per-run token/cost budget and a cap on cards-per-run; batch concept authoring where the endpoint allows. Named in doc 01.
- "Deterministic" doing marketing work (ACCEPT - language fix). The verification is deterministic in shape, not outcome (regenerate is nondeterministic). Fix: docs now say "provenance/format verification + independent answer-key validation," dropping the implication that determinism equals correctness.
- Concepts with no teachable code (ACCEPT). Reviewer: config/generated/vendored files yield grounded noise. Fix: a "teachability" pre-filter that skips vendored/generated/lockfile paths (a small deny-list + heuristic), named in doc 01's context bundle.
- corrections kept but orphaned (ACCEPT). Reviewer: doc 00 keeps `corrections` but doc 03's loop omits it. Fix: doc 03's loop now includes corrections as the suppression/pin input to the author's concept selection.
- Migration untested (ACCEPT). Fix: the migration ships with a fixture test over a real captured v1 state, and writes a v1 backup before converting.

## Addendum: the card-quality eval set (new artifact)

To make the tuning buffer falsifiable without the deleted A/B harness:

- A fixed `eval/cards.jsonl` of ~20-30 held-out (concept, snippet) targets from this repo, each with a human label of what a good card must contain.
- A scorer runs the author over the eval targets and scores output against the labels (citation correctness, answer-key agreement via the independent validator, anti-trivia). Produces a single number.
- Acceptance: buffer/tuning "done" = eval score >= threshold AND manual spot-check of 10 cards. This replaces "eyeball them."

## Revised time budget (reconciled with the sum)

Adding the newly-surfaced work (answer-key validator, SHA-pinning + drift check, custom FSRS steps + mastery formula, pending-review staging, file lock, tolerant JSON, eval set) and reconciling with the per-step sum:

- Simplification (code-level dead-path removal, NON-destructive): 2-3 days.
- LLM-only author skeleton + endpoint config (local default): 2-3 days.
- Context tools (grep/readRange/gitContext) - MOVED BEFORE tuning: 2-3 days.
- Authoring prompt + exemplars + eval set + tuning to threshold: 4-5 days.
- History + grading + answer-key validator + verify.ts + SHA-pin/drift: 5-6 days.
- Typed graph (2 edges) + state machine + FSRS (custom steps, mastery formula): 6-8 days.
- Skill + CLI delivery (local default, built-in verify path, file lock, tolerant JSON): 4-5 days.
- Destructive v2 migration (LAST, after validation) + fixture test: 2 days.
- Real-repo test buffer against the eval set: 4-6 days.

Honest total: ~31-41 working days = 6.5-8.5 weeks. The original "4.5-6 weeks" was optimistic and did not budget the two near-fatal fixes. This is the corrected number.

## Net verdict on the review

The MoA review was high-value: it caught two near-fatal design holes (answer-key oracle, commit drift) that would have shipped, plus a set of correct second-order fixes. Roughly 85% of its points were accepted or accepted-in-spirit; the one substantive push-back (manualRatings) was itself partly conceded. The design is materially stronger for it. The single most important change: verification now proves the card is TRUE (independent answer-key validation) and STABLE (SHA-pinned frozen snippet), not merely that the snippet is real.