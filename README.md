# MergeLearn

MergeLearn is a local-first, model-free learning tool. Your own coding agent
writes the lessons; MergeLearn stores them, schedules reviews with FSRS, and
gives you a local website to learn from. It ships no model and makes no network
calls.

## How you use it

The main loop has three steps:

1. **Install the authoring skill into your coding agent** (once, see Install).
2. **Ask your agent to author a lesson.** Point it at a topic or some repo code
   and it writes a set of cards for you.
3. **Run `mergelearn serve` and learn in your browser.** This is the primary way
   to use MergeLearn day to day.

```bash
mergelearn serve            # prints a local URL like http://127.0.0.1:52134
mergelearn serve --port 4321  # or pin a fixed port
```

The site is offline and reads your local library. **Home** lists each lesson
with its objective, estimated time, and a single Start / Continue / Practice
again button; progress is remembered so Continue drops you at the first card you
have not attempted yet. Cards due for spaced-repetition review show in a
separate banner. You attempt each card first, then reveal the answer and grade
how well you knew it (`1` Again, `2` Hard, `3` Good, `4` Easy).

## Install

Requirements: Node.js 20 or newer, and Git on your `PATH` (only for lessons that
cite repo code).

```bash
npm install
npm run build
npm link                    # optional: puts `mergelearn` on your PATH
```

Then install the authoring skill into whichever agent you use:

```bash
mergelearn setup-agent                      # auto-detect installed agents
mergelearn setup-agent --agent all          # every supported agent
mergelearn setup-agent --agent claude,codex --scope project   # this repo only
mergelearn setup-agent --dry-run            # show changes, write nothing
mergelearn setup-agent --uninstall          # remove copies this tool installed
```

Supported agents: `claude` (Claude Code), `codex`, `cursor`, `opencode`,
`gemini`. The command copies the skill (no symlinks), records a checksum so
reruns are idempotent, and never overwrites a copy you edited by hand. Any agent
that reads `SKILL.md` files then picks it up; for an agent without a skills
directory, point it at `skills/mergelearn-authoring/SKILL.md` and ask it to
author a lesson.

## Question types

Cards are attempt-first: you act before the answer is revealed, and the reveal
is feedback on your attempt.

- **Multiple choice.** Pick one or several options, graded in the browser.
- **Text answer.** Write a short answer, then self-grade against the expected
  one. Good for explain-why prompts.
- **Code ordering.** Reorder shuffled code blocks into the correct sequence
  (click a block and use the arrow keys, drag it, or use the move buttons),
  graded by exact order.
- **Flashcard.** A plain reveal-then-self-grade card for pure recall.

## Ways to use it

- **Learn a codebase.** Ask your agent to author lessons from real files; cited
  code is frozen at a pinned commit so the lesson stays stable.
- **Learn a concept.** Skip the repo and ask for a conceptual lesson on any
  topic (a language feature, an algorithm, a protocol).
- **Keep it fresh.** Review the due queue in the browser now and then; FSRS
  spaces cards so you revisit them right before you would forget.
- **Preview before you trust it.** Run `mergelearn import --dry-run` on an
  agent's output to see what would be created before it touches your library.

## CLI commands

The browser is the main interface, but every action is also available on the
command line.

```bash
mergelearn context     --goal "..." [--repo <path>] [--target-set <id>]
mergelearn import      --file <patch.json> [--agent <name>] [--dry-run]
mergelearn sets
mergelearn due         [--set <id>] [--tag <id>] [--folder <path>]
mergelearn show        --set <id> --card <id>
mergelearn grade       --card <id> --rating <1-4>
mergelearn serve       [--port <n>]
mergelearn setup-agent [--agent <ids|all>] [--scope global|project] [--dry-run] [--uninstall]
```

`context` emits the current library state (sets, tags, folders) for your agent
to author against. `import` validates the returned patch, freezes any cited
code, and writes the set. `import --dry-run` previews the outcome without
writing.

## Storage layout

The library lives at `~/.mergelearn/` (override with `MERGELEARN_HOME` or
`--home`).

```
~/.mergelearn/
  library/
    tags.json                     the taxonomy that links topics together
    folders.json
    sets/<setId>/
      set.json
      order.json                  the teaching order
      cards/<cardId>.json         one file per card
  repos/registry.json             stable repoId -> path (optional)
  profile/sessions/<date>/        one file per review sitting
agent-skills.json                 manifest of skills installed via setup-agent
```

## Privacy

- No telemetry, no required network calls, no bundled model.
- Your coding agent does the authoring; MergeLearn never sends code anywhere.
- Cited code is read from your local disk and frozen at a pinned commit.

See `docs/PRIVACY.md` for details.

## Verification

```bash
npm run check          # tsc --noEmit
npm test               # vitest
npm run build          # emit dist/
npm run smoke          # build + CLI --help
npm run smoke:package  # pack the tarball and run the packaged binary
```

## License

Licensed under the PolyForm Noncommercial License 1.0.0. See [LICENSE](./LICENSE).
Noncommercial use is allowed under the public license; commercial use requires
separate permission from the copyright holder, Odra Labs. This is a
source-available license, not an OSI-approved open-source license.
