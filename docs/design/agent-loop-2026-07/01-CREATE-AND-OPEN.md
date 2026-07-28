---
title: "MergeLearn: create-and-open"
description: "One command that accepts an agent-authored patch, validates it, stores it, ensures a local server, and opens the exact lesson URL with a printed fallback. A wrapper over the existing import path, not a new card-creation pipeline."
resource: docs/design/agent-loop-2026-07/01-CREATE-AND-OPEN.md
tags: [design, cli, workflow, 2026-07]
updated: 2026-07-28
status: design
---

# `mergelearn create-and-open`

Task 1, highest priority. Depends on `04-SERVER-LIFECYCLE.md`.

## 1. Why

The current sequence is create → `serve` → find URL → navigate. Four steps after
the work is already done, which is why the tool is easy to demo and hard to use
daily. This collapses it to one.

## 2. It is a wrapper, not a new path

`import` remains **the only card-creation path**. This command composes existing
pieces in order:

1. `importAgentSet(root, patch, { agentName, dryRun })`
2. `summarizeLesson(patch, res.cards)`, advisory only, never rejects
3. `ensureServer(root)` from doc 04, which reuses or starts a detached managed
   child and returns promptly
4. open `<url>/set/<encodeURIComponent(setId)>?source=create-and-open`, a route
   that already exists (the optional query value is only dogfood provenance)
5. always print the URL when a server is available

No new validation rules. No new storage. If a rule is missing, it belongs in
`importAgentSet`, not here.

## 3. Shape

```
mergelearn create-and-open --file <patch.json> [--agent <name>]
                           [--dry-run] [--json] [--no-open]
```

- `--file` required, an `AgentSetPatch`, same contract as `import`.
- `--dry-run` validates and reports; writes nothing, starts nothing, opens nothing.
- `--json` is machine-readable so the agent can self-correct.
- `--no-open` stores the lesson, ensures the managed server, and prints the exact
  URL without invoking the platform browser. Use `import` for storage only.

Keep `import` as-is. It stays the scriptable primitive; this is the ergonomic
front door. Do not deprecate it.

## 4. Output contract

Human output ends with the URL on its own line when a server is available. If the
platform opener fails (no GUI, SSH, sandbox), that is **not** command failure:
report it and print the URL. With `--no-open`, report the stored set and print the
same usable URL without launching the browser.

```
imported set "auth-middleware-01": 3 active, +1 tags
  objective: Understand the new auth ordering
  ⚠ lesson:no_estimate: Lesson has no estimated duration
open: http://127.0.0.1:52134/set/auth-middleware-01
```

`--json` emits `{ ok, imported, setId, url, openRequested, reused, summary,
cards, errors }`, the existing `import --json` payload plus workflow fields.
`url` is `null` only when server startup fails. `openRequested` means the
platform opener accepted the request; it is always false with `--no-open`. The
dogfood log records an actual page open only after `GET /set/<setId>` succeeds.

## 5. Failure handling

Rejected patch: exit 1, print coded `res.errors`, start no server and open no
browser. The agent reads `--json`, fixes the patch and retries.

Import can succeed before managed-server startup fails. That is a **partial
success**, not a rollback: return exit 1 with `ok: false, imported: true, setId,
url: null` and tell the user the lesson is stored and can be opened later with
`mergelearn serve`. Never claim the import failed or import it a second time.

`needs_review` cards are not command failure. Store and open them while surfacing
the reasons in the existing summary.

Browser open uses the platform opener (`open` / `xdg-open` / `start`). Never
block on it; never let it fail the command.

## 6. Acceptance

Automated:

1. Valid patch: set stored, command exits promptly, JSON carries `url` ending
   `/set/<setId>` and `openRequested` is a boolean.
2. Invalid patch: exit 1, `imported: false`, errors non-empty, no server metadata
   and no opener invocation.
3. Managed-server startup failure after import: exit 1 with `imported: true`; set
   remains readable. Output directs the user to `mergelearn serve`, not to rerun
   `create-and-open` and duplicate the import record.
4. `--dry-run`: nothing written, no server, no opener, exit 0.
5. `--no-open`: stored, server healthy, URL printed, opener not called.
6. Two consecutive runs: one managed server; second reports `reused: true`.
7. `setId` needing escaping is percent-encoded in the URL.
8. Opener failure: exit 0, `openRequested: false`, URL still printed.

Manual:

9. Real agent authors a patch, calls the command, and the correct lesson page
   opens in the default browser without `serve` or manual URL hunting.
10. `GET /set/<unknown-id>` behaves as it does today (unchanged).
