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
  (`context` → `apply`). That workflow lives in the `mergelearn-authoring`
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
or `~/.mergelearn` is used. Global `--json` makes operational output
machine-readable and global `--yes` confirms destructive/bulk actions; global
options work before or after the subcommand. Verify wiring with
`mergelearn --help`; use `mergelearn help --all` for deprecated/internal names.

## Review loop (the learner path)

1. `mergelearn list sets` — list lessons (id, title, card count, folder).
2. `mergelearn due [--set <id>] [--tag <id>] [--folder <path>]` — what is due
   now, optionally scoped. Empty filter = everything due across the library.
   `--quiet` prints just the summary line; `--if-any` prints nothing at all when
   nothing is due, which is what makes it safe in a shell prompt hook. Exit code
   stays 0 either way.
3. `mergelearn show <setId/cardId>` — read one card's front + back
   (question, context, short answer, full explanation, and any frozen source
   snippet). Use this to learn by reading without affecting scheduling.
4. `mergelearn grade <setId/cardId> <1-4>` — grade a DUE card
   (1 Again · 2 Hard · 3 Good · 4 Easy). This advances FSRS and sets the next
   due date. The card must currently be due.

`setId/cardId` is the canonical card reference. It is shown by `list cards` and
copied by the browser's **Copy reference** button. Older `--set/--card` flags
still work during migration but should not be authored into new scripts.

## Library health and learner model

- `mergelearn mastery`: progress by overlapping skill tag and by folder, as TWO
  measures: `coverage` (share of cards that reached review at least once) and
  `retention` (current FSRS recall probability, averaged over the cards actually
  studied), with `studied` as the retention denominator. Read them together. One
  correct answer on one card is 100% coverage and says nothing durable, which is
  why a single number was misleading. Unstudied topics print `—`, not `0%`. Rows
  are weakest first. Add `--json` when an agent should adapt explanations to known
  gaps.
- `mergelearn weak`: the individual cards the learner keeps failing to recall,
  from recorded review evidence, with a per-tag rollup as `weak/eligible`. A card
  must have at least 3 recent attempts and 2 retrieval failures before it is
  called weak; below that bar it is reported as needing more evidence rather than
  ranked. When nothing qualifies the command says so instead of guessing, so an
  empty result means "not enough evidence yet", never "no weaknesses".
- `mergelearn check` — re-check frozen repository citations and report files,
  lines, or commits that drifted or disappeared.
- `mergelearn prune` — preview stale cards that could be archived. It changes
  nothing unless `--yes` is supplied; archiving remains reversible.
- `mergelearn status` — installed version, selected library, and managed server
  state/URL.

## The local review GUI (recommended)

`mergelearn serve [--port <n>]` starts or reuses the managed offline review
server and prints a URL like `http://127.0.0.1:PORT`. The command returns; the
server stays available while active and closes after inactivity. Open the URL
if the browser is not already there. Three tabs:

- **Home** — sets and what's due.
- **Practice** — one card at a time: rate confidence → reveal → grade. The short
  answer shows first; a "Show full explanation" toggle reveals the deeper
  markdown explanation, examples, and common mistakes. Mermaid diagrams in an
  explanation render as SVG.
- **Manage**: browse the folder tree and tag taxonomy with per-node progress,
  build a filter (Match any / Match all across folders + tags), and launch a
  filtered Practice session. The bar and percentage show coverage; hover for
  retention and the studied count, which the CLI reports from identical rules.

## Authoring is a separate skill

To CREATE cards, load `mergelearn-authoring`: it covers the `context` → `apply`
handshake, the `AgentSetPatch` schema, and how to write explanations that teach.
Don't hand-write cards into `MERGELEARN_HOME`.

## Pitfalls

- `mergelearn <cmd>` printing nothing usually means a stale build — rebuild
  (`npm run build`) so the linked bin points at current `dist/`.
- Nothing due? The library may be empty (author some cards) or everything is
  scheduled for later. `list sets` confirms whether cards exist at all, and
  `status` reports the due count directly.
- `grade` only accepts a card that is currently due; a "not due" result means
  FSRS has it scheduled ahead, not that it's missing.
- Wrong `--home` (or unset `MERGELEARN_HOME`) points at a different library and
  looks like "lost cards" — it's just the wrong root.
