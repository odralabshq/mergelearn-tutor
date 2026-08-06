---
type: reference
title: "Privacy Model"
description: "What MergeLearn reads, stores locally, and never transmits."
resource: docs/PRIVACY.md
tags: [privacy, local-first, security]
timestamp: 2026-08-06
---

# Privacy model

MergeLearn is local-first. Its CLI and local server store lessons, scheduling state, preferences, and review sessions under `~/.mergelearn/` unless `MERGELEARN_HOME` or `--home` selects another directory.

## Default boundary

- The server binds to `127.0.0.1`.
- MergeLearn ships no model, telemetry, account, or sync service.
- Agent-authored patches are validated and stored locally.
- Optional source citations are read from registered local repositories and frozen into the lesson.
- Review grades and session recovery state remain in the selected local library.
- External problem links open only after an explicit user action.

Your coding agent is a separate tool with its own privacy and network policy. MergeLearn does not transmit source code to that agent or to a model.

## Browser resources

The core UI works locally. If an authored explanation contains a Mermaid diagram, the browser may request the Mermaid renderer from jsDelivr when that diagram is displayed. No lesson or library data is added to that request. Avoid Mermaid content or block the CDN if fully offline rendering is required.

## Sharing and backups

Lesson bundles contain authored teaching content, interactions, tags, supplied references, and frozen source excerpts. They exclude review schedules, sessions, preferences, and local repository identifiers.

Profile backups include learning state, history, configuration, and repository registry data. They are unencrypted and should be stored securely.
