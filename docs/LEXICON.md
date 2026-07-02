---
type: reference
title: "Lexicon"
description: "Shared vocabulary and domain terms used across the tool."
resource: docs/LEXICON.md
tags: [glossary, terminology]
timestamp: 2026-07-02
---

# Repo lexicon and concept packs

MergeLearn Tutor keeps repo-specific teaching knowledge in local JSON under `.skilltrace/lexicon.json`. This file lets you add vocabulary, rename noisy extracted labels, and ignore concepts/paths without changing project source code.

The lexicon is local-first:

- it is only read from the target repo filesystem;
- it does not execute target repo code;
- it does not make network calls;
- it is meant for `.skilltrace/` scratch state unless you intentionally copy the ideas into a committed team config later.

## Commands

```bash
mergelearn-tutor concept list --repo .
mergelearn-tutor concept add --repo . --id repo.billing_flow --label "Billing flow" --term "checkout,invoice" --path "src/billing/*"
mergelearn-tutor concept alias --repo . --concept security.auth_boundary --label "Session policy boundary"
mergelearn-tutor concept ignore --repo . --concept repo.noisy --path "docs/**"
mergelearn-tutor concept promote-corrections --repo .
mergelearn-tutor ingest --repo . --since 30d
```

## File shape

```json
{
  "version": 1,
  "concepts": [
    {
      "id": "repo.billing_flow",
      "label": "Billing flow",
      "description": "How checkout and invoice code connect in this repo.",
      "kind": "repo_domain",
      "difficulty": "intermediate",
      "pathPatterns": ["src/billing/*"],
      "terms": ["checkout", "invoice"]
    }
  ],
  "aliases": [
    { "conceptId": "security.auth_boundary", "label": "Session policy boundary" }
  ],
  "ignores": [
    { "conceptId": "repo.noisy", "pathPattern": "docs/**" }
  ]
}
```

## How matching works

- `pathPatterns` match changed file paths. `*` matches one path segment and `**` can span path separators.
- `terms` match changed paths, commit text, and diff text case-insensitively.
- aliases override extracted concept labels after extraction.
- ignore rules filter matching evidence; if all evidence for a concept is ignored, the concept is dropped from future cards.

## Promoting corrections

Corrections are still the quick UX path during review. When a correction should become durable repo knowledge, run:

```bash
mergelearn-tutor concept promote-corrections --repo .
```

Promotion currently maps:

- `better_label` corrections to lexicon aliases;
- `not_useful` and `wrong_concept` corrections to concept ignore rules;
- `pin_important` corrections to local lexicon concepts seeded from current evidence.

Run `ingest` after promotion so the planner rebuilds cards with the updated lexicon.
