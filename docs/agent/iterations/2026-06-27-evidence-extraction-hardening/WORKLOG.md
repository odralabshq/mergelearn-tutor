# Evidence and extraction hardening worklog

## 2026-06-27 start

Branch: `autonomous-platform-polish`

Preceding batch:

- Correction calibration completed through C4.
- Quality/correction loop is now usable, but wrong-evidence feedback still needed stable evidence identity before richer extraction work.

## E1 implementation result

Implemented stable derived evidence identity without state migration:

- Added `src/core/evidenceIdentity.ts` with a pure `deriveEvidenceKey` helper.
- The key is derived from commit, path, label, and normalized snippet/code hash.
- Planner wrong-evidence matching now compares content-backed evidence keys when both old and new cards have content.
- Legacy evidence without snippet/code still falls back to path matching, preserving old state behavior.

Focused verification passed:

```bash
npm test -- --run tests/core/evidenceIdentity.test.ts tests/core/planner.test.ts
npm run check
```

## E2 implementation result

Implemented a normalized concept finding seam while preserving public concept output:

- Added `ConceptFinding` / `ConceptFindingSource` and `extractConceptFindings()`.
- Findings include concept ID, source (`ast`, `regex`, `path`, `repo_domain`), reason, path, commit, snippet, optional symbol, confidence, and evidence key.
- `extractConcepts()` now reduces findings back into the existing `Concept[]` shape, so callers and persisted state remain compatible.
- TypeScript AST analyzer now carries symbol names for interface/type-alias findings.

Focused verification passed:

```bash
npm test -- --run tests/core/concepts.test.ts tests/core/typescriptAstAnalyzer.test.ts
npm run check
```

## E3 implementation result

Implemented correction semantics that follow evidence metadata:

- Review events for `marked_wrong_evidence` and `marked_duplicate` now store optional evidence key, evidence path, and question plane metadata.
- Wrong-evidence regeneration filters rejected evidence before selecting a snippet, so a concept can still produce a card from alternate evidence.
- If no alternate evidence remains, regenerated cards are blocked from active review.
- Duplicate feedback is scoped to repeated concept/path/question-plane cards instead of downgrading every future card for the concept.

Focused verification passed:

```bash
npm test -- --run tests/core/events.test.ts tests/core/planner.test.ts
npm run check
```
