---
type: test-design
title: "Iteration 01: Local Server Reliability Testing"
description: "Behavioral proof matrix for connection state, drafts, and browser launch."
resource: docs/iterations/iteration-01-local-server-reliability/TESTING.md
tags: [iteration, reliability, testing]
timestamp: 2026-08-04
---

# Iteration 01 Testing: Local Server Reliability

## Existing coverage and layout

Tests are flat in `tests/`, not mirrored under the source tree. Extend `tests/session/server.test.ts` for served routes and emitted client code, `tests/session/practiceAccessibility.test.ts` for keyboard and ARIA assertions, and `tests/cli/libCli.test.ts` for the wired CLI. Extend `tests/createAndOpen.test.ts` only for the reusable injected opener seam it already covers.

`tests/session/server.test.ts` already proves `/health` does not count as activity and `/api/keepalive` does. It also parses the emitted Practice script with `new Function`. `tests/createAndOpen.test.ts` proves exact deep-link opening through injection. No current test exercises the `serve` command's browser launch or browser-storage draft recovery.

## Behavioral priorities

1. A visible tab detects a dead server through health or a real failed request, exposes an accessible persistent status, and leaves readable content and draft fields usable.
2. A matching serving instance clears the warning after a successful health response without replaying an old write; a 200 response from a different instance stays disconnected.
3. Practice and Manage draft values survive reload and same-process navigation in the same browser profile and are removed only after a confirmed successful grade or card edit.
4. Plain `serve` opens the exact ensured URL once. `serve --json` emits valid JSON and opens nothing.

## Test matrix

| Behavior | Existing path to extend | Required proof |
| --- | --- | --- |
| Shared status shell | `tests/session/server.test.ts` | Every served main route contains the live status region and client marker. |
| Client syntax and handlers | `tests/session/server.test.ts` | Extract `/practice` and every relevant page script with case-insensitive matching, parse each, and assert new handler markers. Reconstruct the emitted self-contained controller factory with `new Function`, invoke it with the same fakes as the direct test, and drive connected to disconnected. |
| Connection transitions | proposed new `tests/session/connectionController.test.ts` | Matching IDs connect; rejected health or mutation disconnects; a later matching health recovers; absent either ID is unverified with no warning or disabling. |
| Serving identity | `tests/session/server.test.ts` | A health 200 with a mismatched instance ID stays disconnected and leaves mutations disabled. |
| Controller behavior | proposed new `tests/session/connectionController.test.ts` | Import the controller factory with injected fetch, storage, and minimal document stubs; assert status, controls, copied recovery payload, and transition behavior. |
| Draft persistence | `tests/session/server.test.ts` plus disposable browser QA | Matching answer/edit drafts restore with notice; malformed, schema-mismatched, and stale drafts require explicit acceptance; success clears only its action slot. |
| Accessible status | `tests/session/practiceAccessibility.test.ts` | `role=status` or equivalent polite live announcement, visible recovery copy and restored-draft discard action, keyboard controls not blocked. |
| CLI opening | `tests/cli/libCli.test.ts` | Every non-JSON `serve` test injects an opener. Fresh and reused paths each call once; `false` produces a non-fatal stderr note with no retry; `--json` remains parseable and does not call it. |

## Built-artifact and browser gate

After build, invoke `dist/libCli.js` against a fresh `mktemp -d /tmp/mlt-...` home. Confirm `serve --json` returns a healthy URL without an opener and that a normal invocation opens once through a controlled platform-opener seam. Start the built server, fetch `/`, `/manage`, `/set/<id>`, and `/practice`, and parse every extracted script with `node --check`.

Use a real Chromium-family browser only with a fresh disposable `mktemp -d /tmp/mlt-...` library. Enter a Practice answer and a Manage edit, stop the server, return to the visible tab, and check the event-driven status announcement and disabled mutations after the next request. Restart with `serve`, confirm the recovery guidance rather than cross-port draft restoration, then independently confirm same-process reload restoration and successful-draft clearing. Record a matching health control before interpreting any failed-request case.
