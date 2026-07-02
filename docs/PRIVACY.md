---
type: reference
title: "Privacy Model"
description: "What data MergeLearn reads, stores locally, and never transmits; local-first guarantees."
resource: docs/PRIVACY.md
tags: [privacy, local-first, security]
timestamp: 2026-07-02
---

# MergeLearn Tutor Privacy Boundary

MergeLearn Tutor is local-first. The default commands read local git history and `.skilltrace` state only; they do not call a remote LLM, send telemetry, or execute target repo code.

## What changed in the privacy boundary

The privacy layer adds three guardrails before any optional enrichment exists:

1. **Offline by default** — outbound enrichment is blocked unless a future feature explicitly checks the privacy config and the config has network, consent, and provider set.
2. **Outbound preview** — users can inspect the exact JSON payload that an enrichment provider would receive.
3. **Redaction and ignore rules** — snippets are omitted by default, obvious secrets are redacted, and local path globs can be omitted from preview evidence.

## Commands

Create an offline config:

```bash
mergelearn-tutor privacy init --repo .
```

Add project-specific preview rules:

```bash
mergelearn-tutor privacy init --repo . \
  --ignore-path "secrets/**" \
  --ignore-path "fixtures/private/**" \
  --redact "internal-codename"
```

Preview what optional enrichment would receive:

```bash
mergelearn-tutor privacy preview --repo . --provider fake
```

Include bounded snippets in the preview only when you want to inspect them:

```bash
mergelearn-tutor privacy preview --repo . --provider fake --include-snippets
```

The preview command sends nothing. `--provider fake` is only a label in this phase.

## Config file

`privacy init` writes `.skilltrace/privacy.json`:

```json
{
  "version": 1,
  "network": {
    "enabled": false,
    "consentToSend": false
  },
  "redaction": {
    "replacement": "[REDACTED]",
    "extraTerms": []
  },
  "ignorePaths": [],
  "includeSnippetsByDefault": false
}
```

Fail-closed outbound checks require all of these before future enrichment can send anything:

- `network.enabled: true`
- `network.consentToSend: true`
- `network.provider: "fake" | "local" | "remote"`

No current command sends to any provider.

## Redaction behavior

The preview redacts:

- GitHub-style tokens such as `ghp_...`.
- AWS access key IDs.
- private-key blocks.
- email addresses.
- simple `secret=...`, `token=...`, `apiKey=...`, and `password=...` assignments.
- literal `redaction.extraTerms` strings.
- home-directory user segments in absolute Linux/WSL and Windows paths.

Snippets are omitted unless `--include-snippets` or `includeSnippetsByDefault` is enabled.

## What the preview contains

The preview payload is intentionally narrow:

- repo basename, not full repo path.
- learning goals.
- current learning card ids, concept ids, titles, prompts, expected focus.
- evidence paths, labels, short commit ids.
- optional snippets only when explicitly requested.

This is meant to make future optional enrichment reviewable before any real provider is added.

## Verification

Privacy behavior is covered by:

```bash
npm test -- --run tests/core/privacy.test.ts tests/cli/cli.test.ts
npm run check
```

The full release gate remains:

```bash
npm run check
npm test
npm run build
npm run eval
npm run smoke
```
