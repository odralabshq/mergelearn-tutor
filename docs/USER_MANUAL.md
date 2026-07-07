# MergeLearn User Manual (v2)

MergeLearn is a local-first, model-free learning library and FSRS review shell.
Your coding agent authors the material; MergeLearn stores, validates, freezes,
schedules, and serves it. This manual covers the full workflow. For the design
rationale, see `docs/design/redesign-2026-07/`.

## Mental model

- **Set** — a titled deck of cards, the thing you pick to study.
- **Card** — a self-contained question (`front.prompt`) and answer
  (`back.shortAnswer` + `back.explanationMarkdown`). You learn by reading the
  card, not by opening the repo.
- **Tag** — the taxonomy. Tags carry `parentIds`/`relatedIds`, so the tag set
  *is* the learning graph. A card belongs to exactly one set; tags cross-cut.
- **SourceRef** — optional. When a card cites repo code, MergeLearn freezes the
  exact lines from disk at a pinned commit. The agent authors but never grades
  its own snippet.
- **FSRS** — per-card scheduling. Reviews are grouped into per-sitting session
  files under `profile/sessions/`.

## Where state lives

The library is global at `~/.mergelearn/` (override with the `MERGELEARN_HOME`
env var or `--home <path>`). Nothing is stored in your target repos. See the
storage layout in the README.

## Authoring workflow (the handshake)

Card creation is import-only and happens in two steps, with your coding agent
in the middle.

### Step 1 — emit the authoring context

```bash
mergelearn context --goal "TypeScript union types" > context.json
# add --repo /path/to/repo to allow the agent to cite real code
# add --target-set <id> to author into an existing set
```

`context.json` contains your goal, the existing sets, the full tag taxonomy,
and the folder tree. Handing this to the agent is what stops it from inventing
duplicate tags — it sees what already exists and extends it.

### Step 2 — the agent returns a patch, you import it

Your agent produces an **AgentSetPatch** JSON: the set metadata, a `tagPatch`
(tags to reuse + new tags to propose), the teaching `order`, and the `cards`.
Then:

```bash
mergelearn import --file patch.json --agent my-coding-agent
```

Import runs two gates before writing anything:

1. **Tag-graph guard** — rejects unknown reuse ids, duplicate labels, dangling
   parents, and cycles. The taxonomy can only grow coherently.
2. **Structure gate** — every card needs a non-empty prompt, short answer, and
   explanation; the prompt must not leak the answer verbatim; tag refs must
   resolve; the order must cover exactly the patch's cards.

If either gate fails, the import is rejected and the library is untouched.

Cards that cite code have their snippets **frozen from disk** at the current
commit. A card citing an unregistered repo is imported but flagged
`needs_review` rather than silently trusting the agent's text.

## Review workflow

```bash
mergelearn sets                                 # list your decks + card counts
mergelearn due                                  # cards due now (most overdue first)
mergelearn due --set <id>                        # narrow by set
mergelearn due --tag <id>                        # narrow by tag
mergelearn due --folder ts/basics                # narrow by folder subtree
mergelearn show --set <id> --card <id>           # read front + back (+ frozen code)
mergelearn grade --card <id> --rating <1-4>      # advance the schedule
```

Ratings are the standard FSRS four: `1` Again, `2` Hard, `3` Good, `4` Easy.
Grading advances the card's per-card FSRS state, records a review event, and
persists a session file under `profile/sessions/<date>/`. A graded card leaves
the due queue until its next due date.

The intended loop: run `due`, `show` a card, answer it in your head, read the
explanation, then `grade` honestly. Only active cards are ever due;
`needs_review` and `archived` cards are held back.

## Command reference

| Command | What it does |
|---|---|
| `context --goal <text> [--repo <path>] [--target-set <id>]` | emit the AuthoringContext JSON for your agent |
| `import --file <patch.json> [--agent <name>]` | apply an AgentSetPatch (the only card-creation path) |
| `sets` | list card sets |
| `due [--set] [--tag] [--folder]` | list cards due now |
| `show --set <id> --card <id>` | print a card front + back |
| `grade --card <id> --rating <1-4>` | grade one due card |
| `serve [--port <n>]` | open the local review GUI (Home + Practice) |

Global: `--home <path>` overrides the library root (default `~/.mergelearn/`,
or `$MERGELEARN_HOME`).

## Review GUI

If you prefer a browser to the terminal, `mergelearn serve` starts a local,
offline web UI on `127.0.0.1` (no network calls, no bundled model):

```bash
mergelearn serve            # random free port
mergelearn serve --port 4300
```

Two tabs, matching the CLI:

- **Home** — your sets, a due-today count, and a Start-practice button.
- **Practice** — one card at a time: read the prompt, reveal the answer
  (space/Enter), then grade with `1`-`4` (Again/Hard/Good/Easy). Each grade
  advances the card's FSRS state and drops it from the queue, same as
  `grade` on the CLI. Graded cards write the same session files.

The GUI is read-through to the same library on disk, so you can mix CLI and
browser freely. Authoring is still import-only — the GUI reviews cards, it
does not create them.

## What MergeLearn does not do

- It does not generate cards. Authoring is your agent's job.
- It does not run or bundle any model, and makes no network calls.
- It does not analyze your repo to infer concepts, tags, or ordering — the
  agent supplies those, MergeLearn only validates and stores them.
