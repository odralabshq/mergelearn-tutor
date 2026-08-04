---
type: plan
title: "Iteration 01: Local Server Reliability"
description: "Make stale browser tabs detectable and preserve work through local server restarts."
resource: docs/iterations/iteration-01-local-server-reliability/README.md
tags: [iteration, reliability, recovery]
timestamp: 2026-08-04
---

# Iteration 01: Reliable Local Server and Draft Recovery

## Outcome

An open MergeLearn page clearly reports when its local server has stopped, preserves unfinished input, and gives truthful recovery instructions.

## Scope

- Move keepalive and connection state into the shared page shell.
- Probe server health when a tab becomes visible and react to real request failures.
- Show a persistent, accessible, non-modal disconnected banner.
- Disable only server mutations while disconnected; keep readable content and editable drafts available.
- Save and restore Practice answers and Manage edits in browser storage.
- Make `mergelearn serve` actually open the browser, matching its CLI description.
- Clear connection warnings and confirmed drafts after successful recovery.

## Prove it

- Simulate idle shutdown, restart, hidden-tab return, failed requests, and successful reconnection.
- Verify drafts survive reload and restart but clear after confirmed submission.
- Browser-test every main route and keyboard/screen-reader status behavior.

## Excluded

- Fixed-port architecture, service workers, background daemons, or automatic process restart.
- Retrying non-idempotent mutations automatically. That belongs to Iteration 04.
