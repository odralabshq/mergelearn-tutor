---
title: "MergeLearn: Minimal Server Lifecycle"
description: "Lockfile with pid/port/instanceId, /health probe, instance reuse, stale metadata removal, signal cleanup, inactivity timeout, and a 60s browser keepalive. Scoped to what create-and-open needs; explicitly not a background-service architecture."
resource: docs/design/agent-loop-2026-07/04-SERVER-LIFECYCLE.md
tags: [design, server, lifecycle, 2026-07]
updated: 2026-07-28
status: design
---

# Minimal Server Lifecycle

Task 5. Build this **first**: `create-and-open` depends on instance reuse.

## 1. Problem

`startReviewServer(root, port = 0)` binds an ephemeral port. Two `serve` runs
therefore succeed on two different ports and coexist. That is the
multiple-instance bug. There is no lockfile, no `/health`, no idle timeout and no
signal cleanup, so an auto-opened server can also linger indefinitely.

Foreground `serve` stays the default. This work matters for the **auto-opened**
flow, where nobody is watching the terminal.

## 2. Lockfile

Path: `<root>/server.json` (root = `MERGELEARN_HOME` or `~/.mergelearn`, via the
existing `rootFrom(homeOpt())`). Use the existing `writeJson`/`readJson` from
`src/core/library/io.ts`.

```ts
type ServerLock = {
  pid: number;
  port: number;
  instanceId: string;   // crypto.randomUUID()
  url: string;          // http://127.0.0.1:<port>
  startedAt: string;    // ISO
  managed: boolean;     // true only for detached server-run children
};
```

## 3. Process model and acquisition

`mergelearn serve` remains foreground and owns its socket until Ctrl+C.
`create-and-open` must return immediately, so it cannot call
`startReviewServer()` in its own process and wait on the listening socket.

Use one hidden internal entry point, `mergelearn server-run`, as the managed
server child. `ensureServer(root)` does this:

1. Read `server.json` and probe an existing process as described below.
2. If healthy, return its URL with `reused: true`.
3. If stale, remove the metadata.
4. Spawn the current Node entry point as `server-run` with the resolved root
   passed explicitly, detached with ignored stdio. Call `child.unref()`. Do not
   rely on the child inheriting a shell alias or current working directory.
5. Poll `server.json` plus `/health` for up to 3 seconds, then return the URL.
   If readiness never arrives, fail without opening the browser.

`server-run` starts the server, writes metadata only after `listen()` succeeds,
and owns timeout and signal cleanup. It is internal, not advertised in help.

To avoid two simultaneous `create-and-open` calls spawning two children, acquire
`<root>/server.starting` atomically with `open(..., 'wx')`. A loser waits for the
winner's health result. Treat a claim older than 5 seconds as stale.

Probe logic: check `process.kill(pid, 0)`, then `GET <url>/health` with a 500ms
timeout. Health must return the same `instanceId`. This second check is required
because operating systems recycle pids.

Export `ensureServer(root): Promise<{ url: string; reused: boolean }>` for
`create-and-open`; keep `startReviewServer()` as the in-process test seam.

## 4. `/health`

`GET /health` returns `200 { ok: true, instanceId, startedAt, managed }`.
It is localhost-only and leaks no library data. It must **not** count as activity
for the idle timer, or probes would keep an abandoned managed server alive.

Foreground `serve` participates in the same lock protocol. If a healthy instance
already exists, it prints that URL and returns rather than opening another socket.
If none exists, it runs in the foreground and writes `managed: false` to the
lock. Only a managed `server-run` uses the inactivity timeout; foreground `serve`
keeps its current Ctrl+C lifecycle.

## 5. Shutdown, two layers

**Layer 1: inactivity timeout (backstop).** Track `lastActivityAt`, updated by
every request except `/health`. A timer checks every 30s and exits after
**15 minutes** idle. This is the guarantee against indefinite background hangs.

**Layer 2: browser keepalive.** Every rendered page pings
`GET /api/keepalive` every **60 seconds** while visible. Pause the timer while
`document.visibilityState !== 'visible'`; a forgotten background tab should not
keep the server alive forever.

Without this, an open lesson can time out while the user is reading or thinking.
Sixty seconds is enough because this is a liveness signal, not interaction
tracking. GET also avoids the server's existing cross-origin POST guard.

## 6. Signal and exit cleanup

Handle `SIGINT` and `SIGTERM`: close the server, then delete `server.json` only
if its `instanceId` still matches this process. A stale process must never delete
a newer server's metadata. Remove `server.starting` in the parent `finally` path;
treat its age as crash recovery.

`process.on('exit')` may perform only synchronous best-effort cleanup. Normal
cleanup belongs in the signal and idle-timeout paths.

Node specifics that will cost an hour if missed:

- `server.close()` only stops **new** connections and waits for existing ones. With
  keep-alive sockets it can hang. Call `server.closeIdleConnections()`, and
  `closeAllConnections()` if a forced stop is needed.
- `unref()` the interval timers, or the timer itself keeps the process alive.

## 7. Not in scope

No daemon, no launchd/systemd unit, no port registry, no multi-root support, no
cross-machine coordination. One local instance per library root.

## 8. Acceptance

Automated (`tests/session/server.test.ts` plus CLI tests):

1. `startReviewServer()` still works in-process against an injected temp root.
2. `ensureServer()` on a clean root spawns a managed child, waits for readiness,
   and returns while that child remains healthy.
3. Two concurrent `ensureServer()` calls from separate processes return the same
   URL and leave exactly one managed child.
4. A dead pid, expired `server.starting`, or mismatched `/health.instanceId` is
   treated as stale and replaced.
5. `GET /health` does not advance activity; `GET /api/keepalive` does.
6. A managed child exits after an injected short idle timeout and removes only
   metadata carrying its own `instanceId`.
7. A foreground `serve` has `managed: false`, ignores the idle timeout, and a
   second start reuses it instead of opening another socket.

Manual:

8. `mergelearn serve`, then Ctrl+C: `server.json` is gone. Repeat twice; no
   stale lock accumulates.
9. `kill -TERM <managed-pid>` produces the same cleanup.
10. Run `create-and-open` and confirm the command exits promptly while its managed
    server remains reachable.
11. Keep a lesson visible for 3+ minutes without clicking: server remains alive.
    Hide or close all tabs, wait about 16 minutes: managed process exits.
12. Two terminals invoke `create-and-open` simultaneously: one server process,
    same port in both outputs.

Verify with: `lsof -nP -iTCP@127.0.0.1 -sTCP:LISTEN | grep node` and
`cat ~/.mergelearn/server.json`.
