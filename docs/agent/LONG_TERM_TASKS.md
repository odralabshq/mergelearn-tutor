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
3. Stronger local correction loop for bad cards, wrong evidence, duplicate concepts, ignored paths. Status: partially complete; review feedback now downgrades/blocks repeated failures, but stable evidence IDs and path/term-level correction targets remain.
4. Stable evidence identity and richer extraction findings. Status: next recommended short-term batch; needed before wrong-evidence and duplicate corrections can become durable across re-ingest.
5. AST-backed extraction upgrades: symbols, imports/exports, touched tests, richer evidence bundles. Status: pending after stable finding/evidence shape.
6. JSON store hardening: schema versioning, append-only events, export/import, migration tests. Status: pending; should follow any persisted evidence/finding shape changes.

## Habit-loop tasks

7. Proper local Today session: one-card mode, reveal/self-grade, bad-card action, shortcuts, due reasons.
8. Rename/de-emphasize Courses as Plans or Focus Areas in UI.
9. Progress becomes next-review guidance, not only passive mastery report.
10. Weekly digest: concepts changed repeatedly but weakly understood.

## Source/repo tasks

11. Explicit source manager: repos, paths, docs, language, recency, branch/source scope.
12. Workspace index of known repos without silent scanning.
13. Multi-repo plans only after single-repo value is proven.

## Evidence UX tasks

14. Timeline/Graph filters, focus mode, node detail drawer, why-this-card trace. Status: started; timeline/graph filters exist, node detail drawer and deeper why trace remain.
15. Keep graph secondary: provenance and explainability, not homepage.

## Release tasks

16. OSS readiness: license decision, clean quickstart, sample workflow, install smoke.
17. Optional LLM enrichment later: explicit preview, per-repo opt-in, redaction, no truth adjudication.

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
