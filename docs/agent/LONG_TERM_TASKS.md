# MergeLearn Tutor long-term task queue

Source: `docs/research/deep-research-report.md` plus current local product state.

## Operating rules

- Work on `autonomous-platform-polish` only.
- Make local commits; do not push or merge to `main` without approval.
- Prioritize evidence/card quality before visual breadth.
- Verify each slice with tests, build, and screenshot/API checks when UI changes.
- Keep local-first privacy, no telemetry, no target-repo execution, no default remote LLM.

## Foundation tasks

1. Real evaluation corpus and quality rubric across varied TypeScript repos. Status: partially complete; deterministic quality metrics exist, broader real-repo corpus remains.
2. Deterministic card-quality gates before cards enter review. Status: complete for generated cards; continue threshold calibration.
3. Stronger local correction loop for bad cards, wrong evidence, duplicate concepts, ignored paths. Status: next recommended short-term batch.
4. AST-backed extraction upgrades: symbols, imports/exports, touched tests, richer evidence bundles.
5. JSON store hardening: schema versioning, append-only events, export/import, migration tests.

## Habit-loop tasks

6. Proper local Today session: one-card mode, reveal/self-grade, bad-card action, shortcuts, due reasons.
7. Rename/de-emphasize Courses as Plans or Focus Areas in UI.
8. Progress becomes next-review guidance, not only passive mastery report.
9. Weekly digest: concepts changed repeatedly but weakly understood.

## Source/repo tasks

10. Explicit source manager: repos, paths, docs, language, recency, branch/source scope.
11. Workspace index of known repos without silent scanning.
12. Multi-repo plans only after single-repo value is proven.

## Evidence UX tasks

13. Timeline/Graph filters, focus mode, node detail drawer, why-this-card trace.
14. Keep graph secondary: provenance and explainability, not homepage.

## Release tasks

15. OSS readiness: license decision, clean quickstart, sample workflow, install smoke.
16. Optional LLM enrichment later: explicit preview, per-repo opt-in, redaction, no truth adjudication.

## Explicitly deferred

- Manager dashboards, surveillance metrics, default cloud sync, mandatory SaaS.
- Course marketplace, giant ontology, graph-heavy rewrite.
- LLM grading as authoritative judge.
- IDE-first or GitHub-first product before local web habit loop works.
