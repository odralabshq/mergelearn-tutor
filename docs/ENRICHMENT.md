---
type: reference
title: "Enrichment"
description: "How concept metadata is enriched before card authoring."
resource: docs/ENRICHMENT.md
tags: [enrichment, metadata]
timestamp: 2026-07-02
---

# Optional Local-Only Enrichment

MergeLearn Tutor can compare deterministic cards with an optional wording enrichment experiment. This feature is intentionally local-only in Batch 8.

## Safety defaults

- It sends no network requests.
- The default provider is `fake`.
- `remote` provider is rejected by the implementation.
- Enrichment is not a truth source: deterministic card evidence and concepts remain canonical.
- The enrichment input is the same redacted outbound preview payload used by `privacy preview`.
- Snippets remain omitted unless `--include-snippets` is passed.

## CLI usage

```bash
mergelearn-tutor enrich --repo . --provider fake --limit 3
mergelearn-tutor enrich --repo . --provider local --include-snippets --limit 3
```

The output shows an A/B comparison:

- deterministic prompt
- enriched wording
- worked example
- follow-up questions
- provenance line confirming deterministic-card truth source

## Evaluation usage

```bash
npm run eval:repos -- --fixtures --with-enrichment fake --out eval-runs/enrichment-fixtures
npm run eval:repos -- --repo /path/to/repo --with-enrichment fake --out eval-runs/enrichment-dogfood
```

The evaluation report records enriched card count, `network used: no`, and provenance status. These are guardrails for a future human usefulness rating; they do not prove that enriched wording is better.

## What is intentionally not implemented

- real remote LLM calls
- hidden source upload
- LLM grading
- LLM-derived concept truth
- automatic replacement of deterministic cards

A future remote provider requires a separate human approval because it touches privacy, possible cost, and secrets/API keys.
