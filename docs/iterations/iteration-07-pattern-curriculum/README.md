---
type: plan
title: "Iteration 07: Pattern Curriculum"
description: "Connect catalog problems to reusable learning patterns and prerequisites."
resource: docs/iterations/iteration-07-pattern-curriculum/README.md
tags: [iteration, patterns, curriculum, relationships]
timestamp: 2026-08-04
---

# Iteration 07: Pattern Curriculum and Problem Relationships

## Outcome

Catalogs determine coverage while reusable pattern lessons determine learning order.

## Scope

- Add first-class Pattern records or an equivalent validated relation model.
- Relate each problem to zero or more primary and secondary patterns.
- Relate pattern lessons to representative, transfer, and checkpoint problems.
- Model prerequisite patterns without forcing a rigid universal order.
- Add a curriculum view showing introduction, reasoning evidence, transfer evidence, and available problems.
- Allow learner corrections and local mappings without rewriting source catalog metadata.
- Use company and source-list membership as filters or priority overlays, not pedagogy.

## Prove it

- Test many-to-many mappings, cycles, missing lessons, conflicting classifications, and local overrides.
- Verify a problem appearing in several catalogs remains one problem.
- Browser-test curriculum navigation, filters, empty states, and link provenance.

## Excluded

- Automatic taxonomy generation, hard-coded universal pattern counts, or frequency-based learning order.
