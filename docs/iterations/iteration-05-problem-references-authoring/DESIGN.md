---
type: design
title: "Iteration 05: Problem References and Authoring Guidance"
description: "Target design for portable interview-problem provenance and transfer-oriented authoring."
resource: docs/iterations/iteration-05-problem-references-authoring/DESIGN.md
tags: [iteration, interview-prep, provenance, design]
timestamp: 2026-08-05
---

# Iteration 05 Design: Problem References and Authoring Guidance

## Status and grounding

Repository `SourceRef` is intentionally tied to a repo id, path, commit, frozen text, and drift checks. It cannot represent an external interview problem without false semantics. Existing AgentSetPatch, lesson bundles, authoring context, advisory lesson summary, and post-reveal explanation provide the required extension seams without a catalog.

## Decisions

- D1: Add one optional portable value type, `ExternalProblemRef`, directly to `CardSet`, `Card`, and `AgentCardDraft` as `problemRefs`. Do not create a Problem entity, registry, file tree, importer, scraper, or deduplication service.
- D2: A reference contains `sourceName`, `sourceId`, `canonicalUrl`, optional `title`, and optional `attributions`. An attribution is `{ kind: "list" | "company", label, observedOn }`. Company metadata always renders as `Reported by <sourceName>: <label>, as of <date>`, never as a verified claim that a company asked the problem.
- D3: Apply Unicode NFC, trim surrounding whitespace, and reject C0, C1, and bidi-control characters in every authored text field. Require source name, source id, and attribution label lengths of 1 through 100 JavaScript string code units; optional title 1 through 200; URL at most 2048; at most 20 references per owner and 50 attributions per reference. Duplicate keys case-fold normalized `(sourceName, sourceId)` within one owner.
- D4: `canonicalUrl` must parse as absolute HTTPS, contain no username/password, and have no fragment. Persist `URL.toString()` after default-port removal. Keep query strings but emit an advisory because shared URLs may contain tracking or session data. Validation makes no network request and never claims the target exists or remains current.
- D5: `observedOn` is a strict real calendar date in `YYYY-MM-DD`, between `1970-01-01` and the validator's injected UTC date. The UI renders every attribution with `as of <date>`. Older dates remain valid provenance and are never silently labelled stale or current.
- D6: Problem references are author-owned content. Re-import replaces or removes them when absent while preserving learner FSRS. New exports use lesson bundle format 2; the importer accepts formats 1 and 2. This prevents an older format-1 app from silently importing and then dropping refs on re-export. Existing format-1 bundles remain compatible.
- D7: Practice renders the deduplicated union of Set and Card references only in the post-commit reveal area, with Card metadata winning on a duplicate key. The prompt, context, hidden pre-reveal DOM, document title, and live regions receive no problem metadata automatically. At render time, re-parse HTTPS; invalid stored URLs render as plain text. Links use `target="_blank"`, `rel="noopener noreferrer"`, `referrerpolicy="no-referrer"`, and display the URL parser's ASCII hostname.
- D8: Unlabelled transfer is authoring guidance, not a new interaction or persisted stage. Keep problem and pattern identity out of prompt/context for transfer activities and place them in explanation or post-reveal refs. Practice does not render tags pre-commit. Existing interactions, tags, and `siblingGroupId` are sufficient.
- D9: Do not add prose-based warnings for missing transfer, leaked pattern names, or unstated tradeoffs. Those require brittle inference or another schema field. Keep existing structural advisories and add only the deterministic URL-query advisory. Documentation and the example carry faded-guidance and constraint-tradeoff guidance.
- D10: Ship one original `examples/interview-pattern-lesson.json` imported through the normal gate. It uses an invented scenario, original code/pseudocode, reserved `example.org` URLs, and no real company attribution. It demonstrates worked example, completion, near-miss, competing approach, unlabelled transfer, and `problemRefs` without copied statements, editorials, examples, or solutions.

## Acceptance criteria

1. Existing patches, cards, Sets, backups, and lesson bundles remain readable without migration.
2. Invalid URLs, dates, duplicate refs, and oversized metadata reject before writing.
3. Format-2 export/import and copy-import preserve portable metadata without local identifiers or learner schedules; format-1 imports remain supported.
4. Set and Card refs render as one deduplicated post-commit list, and hand-edited unsafe URLs never become links.
5. No problem statement, editorial, solution, verified-company claim, frequency claim, or remote content is stored or generated automatically.
6. Problem identity and pattern labels stay post-commit in Practice, with accessible external links.
