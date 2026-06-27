# Research synthesis: scientific effectiveness reports

## Read this first

Reports reviewed:

- `docs/research/deep-research-report (1).md`
- `docs/research/deep-research-report(2).md`
- `docs/research/deep-research-report (3).md`

Report 3 is not a synthesis report. It correctly refused to run because the first two reports were not attached to that external agent. I treat it as a process finding: next time, attach reports 1 and 2 before running the synthesis prompt.

Bottom line: the product direction is credible, but the strongest evidence supports the core learning loop, not the surrounding graph/provenance UI by itself. The next work should make MergeLearn Tutor measurable as a trust-calibration and knowledge-debt tool: confidence-before-reveal, delayed recall, active controls, transfer/debugging cards, and privacy-preserving study exports.

Recommended next implementation order:

1. Add confidence-before-reveal events and calibration summaries.
2. Add delayed recall scheduling/probes at 2 and 7 days.
3. Add active-control/passive-review mode for experiments.
4. Add transfer/debugging/localisation card templates.
5. Add opt-in code-free event export for studies.

## Critical evaluation of report 1

Report 1 is the scientific evidence review. Its strongest points are well aligned with the current platform:

- Retrieval practice supports answer-before-reveal cards.
- Distributed practice supports delayed reviews rather than only same-session cards.
- Self-explanation supports prompts that ask why, what could break, what test matters, and how behavior flows.
- Professional code-review/debugging studies support repo-grounded evidence and mental-model tasks.
- AI-coding research supports the knowledge-debt framing, but only if measured as calibration, comprehension, transfer, and appropriate reliance.

The report is appropriately skeptical. It does not claim that graphs, timelines, courses, or local-first privacy directly improve learning. Those are product enablers and explainability surfaces, not proven interventions.

## Critical evaluation of report 2

Report 2 is the evaluation-design report. It is more operationally useful than report 1 because it names concrete metrics, study designs, and product instrumentation.

Its key correction to the current platform is that current evaluation is content-pipeline evaluation, not learning-effectiveness evaluation. MergeLearn already measures groundedness, answerability, quality verdicts, and manual usefulness. It does not yet measure delayed comprehension, transfer, debugging performance, confidence calibration, or AI-overreliance behavior.

The report also correctly says active controls matter. The real baseline is not “no learning”; it is rereading the diff/docs or reading an AI explanation for the same amount of time.

## What current platform already gets right

- Local-first default and no required LLM calls.
- Snippet-first cards tied to inspectable repo evidence.
- Answer-first review with explanation hidden until reveal.
- Separate quality feedback from learner mastery.
- Quality gates and manual ratings for card usefulness.
- Course scoping and question planes.
- Timeline, graph, and history for provenance and auditability.
- Evidence-aware correction loop for bad cards, wrong evidence, and duplicates.

## Highest-risk gaps

1. No explicit confidence-before-reveal event, so calibration cannot be measured.
2. No delayed-probe schedule, so retention is not measured.
3. No active-control mode, so experiments cannot compare against passive rereading.
4. No transfer/debugging task family, so the product may optimize for recall instead of code understanding.
5. No opt-in code-free export schema, so local-first studies are hard to aggregate.
6. Product copy must avoid claiming productivity, defect reduction, or proven skill preservation.

## Evidence-backed task roadmap

| Rank | Task | Why now | Verification |
|---|---|---|---|
| 1 | Confidence-before-reveal and calibration summary | Smallest change that makes trust calibration measurable | Event tests, API test, browser HTML test |
| 2 | Delayed recall probes | Directly tests retention, the core learning claim | Scheduler tests and history/progress UI |
| 3 | Active-control passive-review mode | Required for credible experiments | Experiment-mode tests and docs |
| 4 | Transfer/debugging/localisation card templates | Moves beyond literal snippet recall | Planner/card-quality tests |
| 5 | Evidence-inspection events | Tests whether provenance actually helps | Timeline/history/API tests |
| 6 | Local anonymized export preview | Enables studies without breaking privacy promise | Export schema tests and privacy docs |
| 7 | Open-ended explanation rubric | Supports blinded/human grading later | Eval harness tests |
| 8 | Seeded benchmark task bundle | Supports repeatable proof and regression | Fixture/eval tests |
| 9 | Claims/positioning guardrails | Prevents overclaiming before evidence | README/docs review |
| 10 | UI polish around the main review loop | Improve navigation once metrics exist | Screenshot/console loop |

## Next four implementation batches

### Batch A: calibration foundation

Goal: record confidence before reveal and compute local calibration summaries.

Tasks:

1. Extend review events with `confidenceBeforeReveal`.
2. Add a `revealed` review event that does not affect mastery.
3. Require confidence selection in the browser before reveal.
4. Add calibration summary helpers/API/history panel.
5. Add docs and tests.

### Batch B: delayed recall probes

Goal: turn the review loop into a retention loop.

Tasks:

1. Add delayed-probe metadata to learning items or events.
2. Schedule 2-day and 7-day probes after answered cards.
3. Show due delayed probes in Review/Today.
4. Track delayed completion and retention ratio.

### Batch C: experiment mode and active controls

Goal: compare MergeLearn against passive rereading.

Tasks:

1. Add a passive-review control card/session mode.
2. Randomize or alternate conditions locally.
3. Store condition metadata without raw code export.
4. Render experiment summaries.

### Batch D: transfer/debugging task families

Goal: test useful code understanding beyond recall.

Tasks:

1. Add question planes or item types for code tracing, blast radius, failing test prediction, and bug localization.
2. Add deterministic prompt templates.
3. Add quality rules for transfer tasks.
4. Add synthetic fixtures proving the tasks fire.

## Claims to avoid until proven

- Do not claim improved delivery speed.
- Do not claim defect reduction.
- Do not claim proven skill preservation.
- Do not claim graph/provenance views improve learning by themselves.
- Do not claim spaced review is proven for code until delayed probes show it.
- Do not collapse groundedness into learning effectiveness.

## Current implementation choice

I am starting with Batch A because it is the smallest high-confidence slice and it unlocks the later evidence loop. It does not require a state version bump because the new event fields can be optional for old events.

Success for the first slice:

- User must choose confidence before reveal in the browser.
- Reveal records a local `revealed` event with confidence metadata.
- Answer events can be paired with prior confidence to compute calibration.
- History or API exposes the calibration summary.
- Legacy events remain valid.
