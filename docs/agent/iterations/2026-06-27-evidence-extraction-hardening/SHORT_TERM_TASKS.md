# Short-term batch: evidence and extraction hardening

Batch folder: `docs/agent/iterations/2026-06-27-evidence-extraction-hardening/`

## Goal

Make evidence references stable and concept extraction more explainable so wrong-evidence and duplicate feedback can remain useful across re-ingest, richer AST extraction, and future store migrations.

## Why this batch now

The previous correction-calibration batch made feedback affect future generation, but it still relies on path/snippet-level matching. Before adding more habit-loop UI or bigger extraction breadth, the product needs a stable evidence/finding shape that can explain why a card exists and what exact source fact feedback targeted.

## Dependency-aware order

1. Define derived evidence identity first.
2. Use that identity in quality/correction tests without a store migration.
3. Normalize AST/concept findings around the identity.
4. Only then consider persisted schema/versioning in a later batch.

## Task E1: stable derived evidence identity

Files to inspect first:

- `src/core/types.ts`
- `src/core/concepts.ts`
- `src/core/lexicon.ts`
- `src/core/planner.ts`
- `tests/core/planner.test.ts`

Acceptance:

- Add a pure helper that derives a stable evidence key from commit, path, label, and snippet hash.
- Existing `EvidenceRef` data remains backward compatible; no state migration yet.
- Wrong-evidence tests use the derived key where available and still pass for legacy path-only evidence.
- Unit tests cover same evidence, changed snippet, and missing commit cases.

## Task E2: normalized concept finding shape

Files to inspect first:

- `src/core/analyzers/typescriptAst.ts`
- `src/core/concepts.ts`
- `tests/core/typescriptAstAnalyzer.test.ts`
- `tests/core/concepts.test.ts`

Acceptance:

- Introduce an internal `ConceptFinding` shape with concept ID, source, reason, path, optional symbol, optional confidence, and evidence key.
- Keep public `Concept` output compatible while building it from findings.
- Tests prove AST, regex/path hints, and repo-domain concepts preserve expected concept IDs and evidence.

## Task E3: wrong-evidence and duplicate correction semantics follow findings

Files to inspect first:

- `src/core/events.ts`
- `src/core/planner.ts`
- `src/core/lexicon.ts`
- `tests/core/events.test.ts`
- `tests/core/planner.test.ts`

Acceptance:

- Wrong-evidence feedback can target the derived evidence key when present.
- Duplicate feedback can downgrade or suppress repeated concept/path/question-plane cards without suppressing the entire concept by default.
- Tests prove future cards avoid the rejected evidence while still using other evidence for the same concept.

## Task E4: reassess store migration boundary

Files to inspect first:

- `src/core/store.ts`
- `src/core/types.ts`
- `tests/core/storeDashboard.test.ts`
- `docs/agent/LONG_TERM_TASKS.md`

Acceptance:

- Produce a short recommendation in this batch worklog: keep evidence keys derived-only, or persist them and bump state version.
- If code changes touch persisted state shape, add migration tests before committing.
- Update the long-term queue with the next dependency-safe batch.

## Verification scope

Focused checks:

```bash
npm test -- --run tests/core/planner.test.ts tests/core/events.test.ts tests/core/concepts.test.ts tests/core/typescriptAstAnalyzer.test.ts tests/core/storeDashboard.test.ts
npm run check
```

Batch-end checks:

```bash
npm run check
npm test
npm run build
npm run smoke:package
git diff --check
```

## Human bottlenecks

None expected for E1-E3. Stop and ask before introducing an irreversible state migration, changing the public state file version, or pushing this branch.
