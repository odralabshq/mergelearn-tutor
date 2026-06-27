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
