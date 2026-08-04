---
type: test-design
title: "Iteration 03: Session Integrity Testing"
description: "Behavioral proof for planned, idempotent, recoverable sessions."
resource: docs/iterations/iteration-03-session-integrity/TESTING.md
tags: [iteration, session, testing]
timestamp: 2026-08-05
---

# Iteration 03 Testing: Session Integrity

## Existing coverage and layout

Tests are flat beneath `tests/core/library/`, not mirrored from `src/`. Extend `tests/core/library/session.test.ts` for durable session transitions and `tests/session/server.test.ts` for HTTP lifecycle behavior. `tests/core/library/dueQueue.test.ts`, `interleave.test.ts`, and `tests/session/requeue.test.ts` are regression controls for existing bounded selection and revisit policy. Extend `tests/session/practiceAccessibility.test.ts` only for changed Practice accessibility; no proposed test path is needed.

## Behavioral priorities

1. An accepted request id is a non-trivial scheduling write; its identical replay must return success while FSRS reps and event count remain unchanged.
2. A queue snapshot survives restart and cannot be widened by a newly due card, an arbitrary active-card request, or a second client fetch.
3. Retry, skip, undo, end, and interruption preserve one truthful plan, cursor, and summary.

## Test matrix

| Behavior | Verified path | Required proof |
| --- | --- | --- |
| Focused plan | `tests/core/library/session.test.ts` | Review due, Study once, and Retry missed preserve scope/order/bounds; each card schedules once; retries/revisits are evidence-only. |
| Idempotent grade | `tests/core/library/session.test.ts` | Exact replay returns stored body with one event and FSRS advance; semantic conflict, tombstone, and request-budget exhaustion do not mutate. |
| Revision admission | `tests/core/library/session.test.ts` | Stale revision/entry, out-of-plan, ended, archived, duplicate, and two-tab requests return authoritative state and leave card unchanged. |
| Crash recovery | `tests/core/library/session.test.ts` | Interrupt before intent, after intent, after tokened card save, and after final session save; pre token applies once, post token finalizes, unrelated token/version diverges. |
| Undo | `tests/core/library/session.test.ts` | Latest undo restores card/event/plan and scheduling eligibility, advances revision, tombstones old id, and permits one corrected grade with a new id. |
| Lookup order | `tests/core/library/session.test.ts` | A lost-response replay with stale revision reaches replay before admission; tombstone precedes replay; semantic conflict precedes budget. |
| Bounds and summaries | `tests/core/library/session.test.ts` | Initial scope caps at 128; at most two live evidence revisits per card; undo recomputes live bounds; scheduled response alone has due; summaries separate scheduled, evidence, first-pass, retried, and unresolved counts. |
| Writer ownership | `tests/session/server.test.ts` | A second server on the same root cannot acquire mutation ownership; a live paused owner is never stale; dead-owner claims recover; every write revalidates instance id; old-owner cleanup preserves a replacement claim. |
| HTTP lifecycle | `tests/session/server.test.ts` | Start exposes plan; GET resumes; grade requires requestId/revision/entryId; legacy is end-only; conflicts carry authoritative state; End bypasses budget. |
| Client contract | `tests/session/server.test.ts` | Practice uses server plan, stores only session id, replays the complete original unknown request including old revision, resyncs conflicts, distinguishes evidence from scheduled responses, offers End, and makes no second queue fetch. |
| Card version invariant | existing lifecycle and import tests plus session tests | Every non-session card mutation changes `updatedAt`; a preserved or divergent version makes recovery refuse to write. |
| Accessibility | `tests/session/practiceAccessibility.test.ts` | Status changes are announced, End is keyboard-operable, and changed control labels retain native semantics. |

## Built artifact and browser gate

After `npm run build`, use `dist/libCli.js` and a fresh `mktemp -d /tmp/mlt-...` library. Seed through supported import APIs, serve the built artifact, extract every `/practice` script with a case-insensitive pattern, run `node --check`, and assert the served client includes each new resume, request-id, and End handler.

Use a real Chromium-family browser only against that disposable library. Control case: begin a valid two-card session and complete one grade. Then verify reload resumes the next planned card, a response-lost retry records one event, an archived queued card skips visibly, End is always reachable, and keyboard and live-status behavior work. Run two tabs against the same session to prove the stale cursor rejection is visible and non-destructive.
