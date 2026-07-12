---
name: mergelearn-tutor
description: >-
  Drive MergeLearn, a local-first, model-free spaced-repetition tutor for a
  codebase or any concept. Cards are authored by a capable coding agent (see the
  mergelearn-authoring skill) and reviewed locally with FSRS scheduling. Use when
  the user wants to review/practise learning cards, browse their library, or run
  the local review GUI. All processing is local; the tool never sends code or
  card data anywhere.
---

# MergeLearn (v2, model-free)

MergeLearn stores an agent-authored card library and schedules it with FSRS. The
library lives under `MERGELEARN_HOME` (default `~/.mergelearn`) as plain JSON —
sets, cards, tags, and per-sitting review sessions — all inspectable.

There are two roles:

- **Author** (a coding agent): creates cards via the two-step handshake
  (`context` → `import`). That workflow lives in the `mergelearn-authoring`
  skill — load it when the task is *making* cards.
- **Learner** (this skill): reviews due cards, browses the library, and runs the
  local GUI. That is what the commands below do.

## The one rule that matters

The library is the source of truth. Every mutation goes through a command so
FSRS scheduling, provenance, and the session log stay intact. Do NOT hand-edit
the JSON under `MERGELEARN_HOME`, and do NOT grade a card by reading the repo
yourself — grade through `grade` (or the GUI) so scheduling updates correctly.

## Invocation

Run the linked binary `mergelearn` (or `node dist/libCli.js` in this repo).
A global `--home <path>` overrides the library root; otherwise `MERGELEARN_HOME`
or `~/.mergelearn` is used. Verify wiring with `mergelearn --help` — it lists
every command below.

## Review loop (the learner path)

1. `mergelearn sets` — list card sets (id, title, card count, folder).
2. `mergelearn due [--set <id>] [--tag <id>] [--folder <path>]` — what is due
   now, optionally scoped. Empty filter = everything due across the library.
3. `mergelearn show --set <id> --card <id>` — read one card's front + back
   (question, context, short answer, full explanation, and any frozen source
   snippet). Use this to learn by reading without affecting scheduling.
4. `mergelearn grade --card <id> --rating <1-4>` — grade a DUE card
   (1 Again · 2 Hard · 3 Good · 4 Easy). This advances FSRS and sets the next
   due date. The card must currently be due.

## The local review GUI (recommended)

`mergelearn serve [--port <n>]` starts the offline review server and prints a
URL like `http://127.0.0.1:PORT`. It does NOT auto-open a browser — open the URL
yourself. The process blocks the terminal and stays up until Ctrl+C. Three tabs:

- **Home** — sets and what's due.
- **Practice** — one card at a time: rate confidence → reveal → grade. The short
  answer shows first; a "Show full explanation" toggle reveals the deeper
  markdown explanation, examples, and common mistakes. Mermaid diagrams in an
  explanation render as SVG.
- **Manage** — browse the folder tree and tag taxonomy with per-node mastery,
  build a filter (Match any / Match all across folders + tags), and launch a
  filtered Practice session.

## Authoring is a separate skill

To CREATE cards, load `mergelearn-authoring`: it covers the `context` → `import`
handshake, the `AgentSetPatch` schema, and how to write explanations that teach.
Don't hand-write cards into `MERGELEARN_HOME`.

## Pitfalls

- `mergelearn <cmd>` printing nothing usually means a stale build — rebuild
  (`npm run build`) so the linked bin points at current `dist/`.
- Nothing due? The library may be empty (author some cards) or everything is
  scheduled for later — `sets` confirms whether cards exist at all.
- `grade` only accepts a card that is currently due; a "not due" result means
  FSRS has it scheduled ahead, not that it's missing.
- Wrong `--home` (or unset `MERGELEARN_HOME`) points at a different library and
  looks like "lost cards" — it's just the wrong root.
