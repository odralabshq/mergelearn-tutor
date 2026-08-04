---
type: plan
title: "Iteration 06: Problem Catalog"
description: "Add a local metadata catalog for interview problems without copying commercial content."
resource: docs/iterations/iteration-06-problem-catalog/README.md
tags: [iteration, interview-prep, catalog, provenance]
timestamp: 2026-08-04
---

# Iteration 06: Local Interview Problem Catalog

## Outcome

Users can import, inspect, filter, and open interview-problem metadata independently of learning cards.

## Scope

- Define a versioned local catalog model with stable source ID, title, URL, difficulty, memberships, companies, dated source metrics, and learner status.
- Keep full problem statements, editorials, and solutions outside the catalog.
- Support safe imports from user-provided Blind 75-style and company-wise metadata files.
- Preserve source provenance, snapshot date, and source-specific meaning of frequency or recency.
- Deduplicate one problem across multiple catalogs and companies.
- Add CLI and UI listing, filtering, detail, and canonical-link opening.
- Add export, backup, validation, and forward migration for catalog data.

## Prove it

- Test duplicate IDs, changed titles, missing URLs, stale snapshots, malformed files, and large catalogs.
- Verify no imported catalog content is silently converted into cards.
- Package-test import/export using redistributable fixtures only.

## Excluded

- Scraping, bundled proprietary datasets, copied statements, solutions, or company-question predictions.
