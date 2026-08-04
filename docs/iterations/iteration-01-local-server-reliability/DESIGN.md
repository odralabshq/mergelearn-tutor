---
type: design
title: "Iteration 01: Local Server Reliability"
description: "Target design for stale-tab recovery and browser-local draft preservation."
resource: docs/iterations/iteration-01-local-server-reliability/DESIGN.md
tags: [iteration, reliability, design]
timestamp: 2026-08-04
---

# Iteration 01 Design: Local Server Reliability

## Status and grounding

This is the target design. For the current implementation, see `README.md` in this folder. It is grounded in `src/session/managedServer.ts` (130 lines), `src/session/server.ts` (1,691 lines), `src/libCli.ts` (941 lines), and their current tests.

The server already owns a per-library `server.json` lock, validates its PID plus `GET /health`, serializes startup with `server.starting`, and starts on a random port by default. `GET /api/keepalive` intentionally records activity. `serve` ensures that server but only prints an instruction, despite describing browser opening.

## Decisions

- D1: Extend the existing managed-server and page-shell contracts. Do not add a daemon, service worker, fixed port, or parallel health service.
- D2: Use visibility return, an immediate one-shot `GET /health` with a matching serving-instance ID, and actual failed server requests as connection evidence. Keepalive remains a normal activity request, never a health probe. Matching IDs connect; unequal present IDs disconnect; either absent ID is unverified; an unreachable health probe or failed mutation disconnects.
- D3: A persistent `role="status"` banner reports disconnection and recovery without blocking reading or local edits. Only requests that mutate server state are disabled while disconnected.
- D4: Store unfinished Practice answers and Manage teaching-text edits in namespaced browser `localStorage`, keyed by the server-rendered card identity. Draft storage is advisory and never sent until the learner deliberately submits. It survives reload and same-process navigation, not a random-port server restart.
- D5: Successful server acknowledgement clears only the confirmed draft. A recovered connection does not replay a mutation automatically.
- D6: Every `serve` invocation without `--json` opens its returned local URL once, whether reused or newly started, through an injected platform opener seam. A failed opener writes a non-fatal stderr note while stdout still prints the URL. JSON output stays machine-readable and does not launch a browser.

## Draft and recovery model

Practice persists only the answer state needed to reconstruct an unrevealed card attempt: card reference, interaction-specific response, and a schema version. It never persists correctness, rating, reveal content, session identity, or credentials. On load, it restores a draft only when the visible card reference and schema version match; stale, malformed, or mismatched values are copyable recovery text requiring explicit acceptance, never auto-filled or submitted. Because browser storage is origin-scoped and the managed server selects a random port, restart survival is an explicit non-goal.

Manage persists the three editable teaching-text fields with the card reference and the rendered `updatedAt` token. A restored edit is auto-filled only when its `updatedAt` matches the current rendered card, with a visible non-modal "Unsaved draft restored" notice and a discard action. A mismatch is presented as recoverable text requiring explicit learner acceptance, never silently populated or submitted. A conflict or validation failure preserves the draft and directs the learner to reconcile it manually.

The connection banner names the recovery action: restart with `mergelearn serve`, then return or refresh this tab. It has no automatic retry path. It is event-driven, so an already-visible idle tab can remain apparently connected until its next visibility change or server request. A health response re-enables mutations only when both IDs are present and match the ID embedded by the page shell. Unverified state shows no warning and disables nothing.

Before issuing a mutable grade, undo, session-end, card action, sample install, feedback/defer, or spaced-repetition request, its payload is written to one pending slot for that action kind. A successful response clears that slot. A failed request keeps it and renders copyable recovery text in the status region. Reveal is local-only; advance is disabled when it would issue a grade. Nothing is automatically resent.

## Acceptance criteria

1. All main pages include the same accessible connection-status region and visibility health handler.
2. A lost server marks the tab disconnected from transport evidence, disables server-mutating controls, and retains content plus drafts.
3. Practice and Manage restore only valid matching drafts after reload or same-process navigation; a confirmed grade or edit clears its own draft.
4. `serve` opens a newly started or reused GUI URL exactly once in human output mode; `--json` is stdout-pure and launches nothing.
5. Existing health/keepalive activity semantics, random-port reuse, and server-start claims remain unchanged.
