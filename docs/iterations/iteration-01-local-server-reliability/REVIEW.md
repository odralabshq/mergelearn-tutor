---
type: review
reviewer: "Opus 5 via Kiro, source-grounded by Hermes"
review_cycles: 3
title: "Iteration 01: Local Server Reliability Review"
description: "Independent review record and source-grounded adjudication."
resource: docs/iterations/iteration-01-local-server-reliability/REVIEW.md
tags: [iteration, reliability, review]
timestamp: 2026-08-04
---

# Iteration 01 Design Review

## Review boundary

This package is design-only. Its scope is stale local-server detection, browser-local drafts, truthful recovery, and the already-described `serve` browser opening. It must not implement automatic restart, retry a non-idempotent grade or edit, alter FSRS, or add product entities.

## Independent review request

The required Opus 5 review will receive the full package as a numbered, tool-free brief. Every numbered recommendation will be recorded below as adopted, modified, deferred, or rejected with a source-grounded reason. At most three revision cycles are permitted.

## Initial source checks

- `managedServer.ts:44-50` proves health requires both a live PID and matching `instanceId`.
- `managedServer.ts:110-129` proves reuse or safe child startup already belongs to `ensureServer`.
- `server.ts:68-74` keeps health out of activity accounting and makes keepalive activity.
- `libCli.ts:833-845` shows the current `serve` description and non-opening behavior.
- `createAndOpen.ts:45-50` supplies the existing injected browser-opening seam and exact URL convention.

## Review criteria

The reviewer must test this design against five risks: stale tabs incorrectly reported as healthy, drafts attached to the wrong card, accidental replay of non-idempotent mutations, JSON CLI output polluted by launch feedback, and a duplicate client-health implementation drifting across routes. It must also challenge whether the current page-shell structure can actually host a shared controller without a new runtime dependency.

## Adjudication ledger: Opus cycle 1

The first usable Opus 5 review is `/tmp/mergelearn-iteration-01-opus-review-cycle-1.md`. Where a point conflicts with the earlier package, this ledger wins.

- R1 adopted: origin-scoped `localStorage` cannot cross a random-port restart. `DESIGN.md` now limits restoration to reload and same-process navigation and makes cross-port restoration a non-goal.
- R2 adopted: health must match a page-embedded instance ID. `DESIGN.md`, `TESTING.md`, and `IMPLEMENTATION.md` add the identity rule and mismatch control case.
- R3 modified: the reviewer proposed an async `Promise<void>` callback, but `libCli.ts:94-110` and `createAndOpen.ts:18-24` use synchronous boolean openers. The adopted shared seam is optional `buildProgram` dependencies with `(url: string) => boolean`.
- R4 adopted: event-driven detection can lag in an already-visible idle tab. The design calls that non-polling limitation out explicitly; the failed-request path remains authoritative.
- R5 adopted: a Manage draft with stale `updatedAt` is never auto-filled or submitted. It requires explicit learner acceptance as recoverable text.
- R6 adopted: marker checks remain a presence guard; the test matrix adds an executed controller-transition test with injected fetch and DOM stubs.
- R7 modified: `managedServer.ts` is now explicitly read-only. `server.ts` owns direct-start instance identity and shell embedding; managed startup already supplies an ID.
- R8 adopted: browser QA explicitly uses a new `/tmp` library, and D6 now requires one open for each human `serve`, whether reused or newly started.

## Adjudication ledger: Opus cycle 2

- R9 adopted: `DESIGN.md` and `IMPLEMENTATION.md` now define matching, mismatching, and absent-ID transitions. `startReviewServer` in `server.ts` derives direct-start IDs, while managed startup continues passing its existing option.
- R10 modified: the review requested an own module, overriding the earlier no-new-module preference. `IMPLEMENTATION.md` proposes internal `src/session/connectionController.ts`, not a dependency, with injected fetch, storage, and document seams plus a direct test.
- R11 adopted: D2 is now an explicit transition table in prose rather than an ambiguous conjunction.
- R12 adopted: matching Manage restores carry a visible notice and discard action; only stale drafts require explicit acceptance as copyable text.
- R13 adopted: every mutation persists its payload before send and a transport failure exposes copyable recovery text. It is never resent automatically.
- R14 adopted: `serve` means every non-JSON invocation, independent of TTY; opener failure is non-fatal stderr output after stdout prints the URL.
- R15 adopted: the previously deferred mutation inventory is named in `DESIGN.md`. Current-origin draft age pruning is deferred because the package has no evidence of same-origin storage accumulation and origin replacement makes old ports inaccessible.

## Final Opus verdict

Opus cycle 3 returned "not blocked" with one important serialization correction and four minor clarifications. All are adopted below; no fourth review is permitted by the worker contract.

- R16 adopted: the controller factory is self-contained, with no imports, module-scope captures, or emit helpers. Server tests reconstruct emitted source with `new Function`, inject the direct-test fakes, and drive a transition.
- R17 adopted: each action kind holds one pending slot; successful responses clear it and recovery text only represents still-pending data.
- R18 adopted: current source has no test assertion for absent direct-start health IDs, while `managedServer.ts:48-49` already requires a present matching ID. The implementation test updates health expectations to the new always-present direct-start contract.
- R19 adopted: all non-JSON CLI test calls inject an opener; fresh, reuse, false-return, and JSON behavior are asserted without a real browser launch.
- R20 adopted: a Practice schema-version mismatch follows the stale-draft recovery path and is never auto-filled or submitted.
