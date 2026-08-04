---
type: implementation-design
title: "Iteration 01: Local Server Reliability Implementation"
description: "Verified-path implementation contract for the reliability slice."
resource: docs/iterations/iteration-01-local-server-reliability/IMPLEMENTATION.md
tags: [iteration, reliability, implementation]
timestamp: 2026-08-04
---

# Iteration 01 Implementation Design

## Change surfaces

Modify existing `src/session/server.ts`, `src/libCli.ts`, and the verified existing tests named in `TESTING.md`. Create proposed internal module `src/session/connectionController.ts` and proposed direct test `tests/session/connectionController.test.ts`. It adds no runtime dependency. `src/session/managedServer.ts` is read-only: its lock, probe, claim, and reuse contracts are not change surfaces.

The browser client is an opaque template string in `src/session/server.ts`. It must contain no literal backticks in new copy, use literal glyphs rather than unicode escapes, and declare every client variable. The change is incomplete until the served `/practice` script parses with Node and carries every new handler marker.

## Client contract

`startReviewServer` derives `instanceId = options.instanceId ?? randomUUID()`, passes that derived option to `handleRequest`, and supplies it to `pageShell`; health returns that same value. This is entirely in `server.ts`; managed startup already supplies its ID through `ReviewServerOptions`.

Proposed `connectionController.ts` exports one self-contained `createConnectionController({ fetch, storage, doc, instanceId })` factory. It has no imports, module-scope helpers or constants, or TypeScript feature needing an emitted helper. The factory never reads global `window`, `document`, or `localStorage`; all collaborators arrive through its argument. The shell serializes its source and instantiates it with browser globals. Tests import the factory directly with fakes. The controller runs health on visible `visibilitychange`: both IDs present and equal connect; both present and unequal disconnect; either absent is unverified; an unreachable health request or failed same-origin mutation disconnects. It must not classify a normal HTTP validation response as a transport outage.

Each mutable request first persists its payload through the draft adapter, then registers success and failure with that controller. A successful response removes that action's one pending slot. On transport failure it preserves the payload, offers copyable recovery text only while pending, and shows recovery guidance. On ordinary server rejection it retains the existing validation feedback path instead of showing a false disconnected state. A matching successful health response is the only transition back to connected.

## Server and CLI contract

`GET /health` remains a read-only identity check. No new recovery endpoint is needed. The shared shell may embed connection-controller code, but page-specific clients must call its public registration functions rather than duplicate polling loops. Detection is event-driven, not polling: it can lag until visibility returns or a request is attempted.

Add `buildProgram(deps?: { openUrl?: (url: string) => boolean })` so tests do not launch a real browser. Default `openUrl` to the existing synchronous `requestBrowserOpen` adapter. `createAndOpen` and `serve` use this same callback type and default, rather than separate production adapters. Every invocation without `--json`, independent of TTY, calls the opener once after printing its URL. A `false` result emits a non-fatal stderr note and is not retried. The `serve` JSON branch returns before any opener call.

## Implementation sequence

1. Add the smallest failing server-rendered shell assertion, then the connection controller and status markup.
2. Add the smallest failing Practice draft assertion, implement its scoped storage and success clearing, then repeat for Manage edit drafts.
3. Add the CLI failing test for normal versus JSON `serve`, implement the injected opener and production adapter.
4. Run source/spec review, then required independent code review only after the later implementation phase permits coding.

No source path under `src/core/library/` changes in this iteration. FSRS writes, session persistence, server lock shape, and `ensureServer` reuse behavior are retained as existing contracts.
