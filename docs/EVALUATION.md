# MergeLearn Tutor Evaluation

## Purpose

The evaluation harness exists to answer the question that matters before UI polish:

> Are generated concepts and learning cards grounded, answerable, and useful enough to justify more product investment?

The harness is intentionally local-first and deterministic. It does not call remote services.

## Commands

Run synthetic fixture evaluation:

```bash
npm run eval:repos -- --fixtures --out eval-runs/fixtures-smoke
```

Run fixture evaluation plus a real local repo:

```bash
npm run eval:repos -- --fixtures --repo /home/adam/mergeLearn --since 30d --limit 30 --out eval-runs/mergelearn-dogfood
```

Outputs:

```text
evaluation-run.json
evaluation-report.md
```

`eval-runs/` is ignored because evaluation reports are generated artifacts and may contain local paths.

## What the harness measures now

Current automated metrics:

- repo count
- collected commit/artifact count
- concept count
- card count
- grounded concept rate
- answerable card heuristic rate
- ready / needs-review / blocked card-quality rates
- average duplicate-risk score
- average card-quality score
- manual rating count, coverage, and per-field averages when ratings are provided to an eval spec
- expected concept hit rate for fixtures
- missing expected concepts
- warnings for empty/no-output cases

A concept is considered grounded when it has at least one evidence path.

A card is considered answerable by heuristic when it has evidence, a non-trivial prompt, and expected focus terms.

These are not final product-quality metrics. The quality metrics come from the deterministic gate in `src/core/cardQuality.ts`; they are baseline guardrails that catch obvious regressions before screenshots or UI polish hide weak cards.

## Manual rating rubric

The generated Markdown report includes a manual rubric and CLI commands for persisting ratings back to `.skilltrace/state.json`:

```bash
mergelearn-tutor rate --repo . --item <card-id> --answerability 5 --usefulness 4 --note "grounded and clear"
mergelearn-tutor rate --repo . --concept <concept-id> --relevance 5 --evidence 4
mergelearn-tutor ratings --repo .
```

Use concept ratings for relevance and evidence correctness. Use card ratings for answerability, usefulness, and whether the session is worth repeating.

| Item | Rating 1-5 | Notes |
|---|---:|---|
| Top concepts are relevant |  |  |
| Evidence paths are correct |  |  |
| Cards are answerable |  |  |
| Cards teach something useful |  |  |
| Session would be worth repeating |  |  |

Manual rating is required because the product is about perceived learning value, not only extraction mechanics.

When eval specs include `manualRatings`, the report also renders a `Manual rating calibration` section. This keeps deterministic quality gates honest by showing how much human-rated evidence exists, which dimensions have averages, and where coverage is still too sparse to tune thresholds confidently.

## Batch 1 dogfood result

Command:

```bash
npm run eval:repos -- --fixtures --repo /home/adam/mergeLearn --since 30d --limit 30 --out eval-runs/mergelearn-dogfood
```

Observed result:

```text
Repos: 4
Concepts: 64
Cards: 28
MergeLearn artifacts: 30
MergeLearn concepts: 48
MergeLearn cards: 12
Grounded concept rate: 100%
Answerable card heuristic rate: 100%
```

Product corrections made from dogfood:

1. Language concepts no longer trigger from TypeScript file paths alone. They must match actual diff content.
2. Repo-domain concepts now use the inferred term as the label instead of the first evidence filename.

Remaining quality concerns:

- The MergeLearn report still has many broad concepts, so Batch 2 and Batch 3 should focus on correction and better extraction.
- The answerable-card metric is currently heuristic only.
- Manual usefulness rating is still required before deciding the interactive UI is worth building.

## Failure gates

Pause UI/packaging work if:

- fewer than 70% of manually rated top concepts are useful and grounded
- more than 20% of cards are irrelevant or unanswerable
- dogfood reports show repeated duplicate/noisy repo-domain concepts
- users cannot understand why a card was generated
- blocked card-quality rate increases after extraction/planner changes
- duplicate-risk average increases without a matching product reason

## Next evaluation improvements

1. Compare before/after reports across extractor changes.
2. Add fixture repos for backend/API and config-heavy projects.
3. Calibrate card-quality thresholds against manual usefulness ratings.
4. Add duplicate concept detection and correction-history-aware scoring.
