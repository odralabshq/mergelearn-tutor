# MergeLearn Tutor long-term task queue

Source: `docs/research/deep-research-report.md` plus current local product state.

## Operating rules

- Work on `autonomous-platform-polish` only.
- Make local commits; do not push or merge to `main` without approval.
- Prioritize evidence/card quality before visual breadth.
- Verify each slice with tests, build, and screenshot/API checks when UI changes.
- Keep local-first privacy, no telemetry, no target-repo execution, no default remote LLM.

## Foundation tasks

1. Real evaluation corpus and quality rubric across varied TypeScript repos. Status: partially complete; deterministic quality metrics and manual rating calibration exist, broader real-repo corpus remains.
2. Deterministic card-quality gates before cards enter review. Status: complete for generated cards; continue threshold calibration through dogfood ratings.
3. Stronger local correction loop for bad cards, wrong evidence, duplicate concepts, ignored paths. Status: mostly complete locally; review feedback now stores evidence metadata, avoids rejected evidence, and scopes duplicate feedback by concept/path/question-plane. Path/term-level lexicon promotion remains.
4. Stable evidence identity and richer extraction findings. Status: complete for derived evidence keys, normalized findings, AST symbols, and evidence-aware feedback. Keep evidence keys derived-only until a later schema migration is justified.
5. AST-backed extraction upgrades: imports/exports, touched tests, richer evidence bundles, and dependency-flow findings. Status: pending; basic symbols now exist through normalized findings.
6. JSON store hardening: schema versioning, append-only events, export/import, migration tests. Status: pending; no state-version bump for derived evidence keys yet, but legacy-event compatibility coverage exists.


## Scientific effectiveness research loop

7. External Deep Research packet on platform effectiveness. Status: local-only packet created at `docs/agent/research-packets/2026-06-27-scientific-effectiveness/`; waiting for user-returned reports.
8. Integrate returned research reports into the task queue: map evidence to current design, avoid unsupported claims, and prioritize next-level product/evaluation tasks.
9. Add measurement instrumentation recommended by the research: pre/post checks, delayed recall, confidence calibration, usefulness/answerability trends, and proof packages for skeptical developers or buyers.

## Habit-loop tasks

10. Proper local Today session: one-card mode, reveal/self-grade, bad-card action, shortcuts, due reasons.
11. Rename/de-emphasize Courses as Plans or Focus Areas in UI.
12. Progress becomes next-review guidance, not only passive mastery report.
13. Weekly digest: concepts changed repeatedly but weakly understood.

## Source/repo tasks

14. Explicit source manager: repos, paths, docs, language, recency, branch/source scope.
15. Workspace index of known repos without silent scanning.
16. Multi-repo plans only after single-repo value is proven.

## Evidence UX tasks

17. Timeline/Graph filters, focus mode, node detail drawer, why-this-card trace. Status: started; timeline/graph filters exist, node detail drawer and deeper why trace remain.
18. Keep graph secondary: provenance and explainability, not homepage.

## Release tasks

19. OSS readiness: license decision, clean quickstart, sample workflow, install smoke.
20. Optional LLM enrichment later: explicit preview, per-repo opt-in, redaction, no truth adjudication.

## Completed local iteration milestones

- Deterministic card quality gate with eval metrics.
- Planner gating for blocked cards and visible needs-review warnings.
- Review and Questions quality panels with compact score disclosure.
- Correction-aware regeneration for bad-card, wrong-evidence, and duplicate feedback.
- Manual rating calibration in evaluation reports.
- Plan Builder page connecting evidence, course goals, accepted questions, and review cards.

## Explicitly deferred

- Manager dashboards, surveillance metrics, default cloud sync, mandatory SaaS.
- Course marketplace, giant ontology, graph-heavy rewrite.
- LLM grading as authoritative judge.
- IDE-first or GitHub-first product before local web habit loop works.
