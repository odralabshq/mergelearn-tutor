---
type: plan
title: "Iteration 05: Problem References and Authoring Guidance"
description: "Support interview-problem provenance and transfer-oriented lessons without a new catalog engine."
resource: docs/iterations/iteration-05-problem-references-authoring/README.md
tags: [iteration, interview-prep, provenance, authoring]
timestamp: 2026-08-04
---

# Iteration 05: Problem References and Authoring Guidance

## Outcome

Sets and cards can link to external interview problems and support faded, transfer-oriented authoring without copying commercial content or adding a catalog subsystem.

## Scope

- Add minimal typed external problem links to existing Set/Card source metadata.
- Preserve canonical URL, source name, source ID, and optional dated list/company labels.
- Validate URLs and provenance while excluding statements, editorials, and solutions.
- Add authoring templates for worked examples, completion tasks, near-misses, and unlabeled transfer.
- Reveal problem title and pattern labels only after commitment where the activity requires it.
- Preserve multiple valid approaches and constraint-dependent tradeoffs.
- Ship one original, redistributable sample pattern lesson.

## Prove it

- Test import, validation, export, re-import, stale metadata, and absent optional fields.
- Verify existing bundles remain compatible and no external content becomes cards automatically.
- Browser-test hidden-label reveal, links, accessibility, and the sample lesson.

## Excluded

- Scraping, proprietary bundles, a separate Problem entity, pattern graph, and runtime AI grading.
