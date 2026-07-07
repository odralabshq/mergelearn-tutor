# MergeLearn

MergeLearn is a local-first, model-free learning library and spaced-repetition
review shell. Your own coding agent authors the learning material; MergeLearn
stores it, freezes any cited code, schedules reviews with FSRS, and gives you a
simple loop to learn by reading and answering cards.

It ships no model and makes no network calls. All authoring intelligence lives
in whatever coding agent you already use; MergeLearn is the deterministic
library and review engine underneath it.

> **v2 redesign (2026-07).** This replaces the earlier repo-analysis tutor
> (git ingestion, concept extraction, bundled card generation, browser UI).
> The north-star design lives in `docs/design/redesign-2026-07/`.

## Model

- **CardSet** — the user-facing atom. A titled deck of cards in a folder.
- **Card** — a self-contained front (`prompt`) and back (`shortAnswer` +
  `explanationMarkdown`), so you learn by reading, not by opening the repo.
- **Tags** — one taxonomy that *is* the learning graph (tags carry
  `parentIds`/`relatedIds`). Cards belong to one set; tags cross-cut.
- **SourceRef** — optional. When a card cites repo code, MergeLearn freezes the
  exact lines from disk at a pinned commit — the agent never grades itself.
- **FSRS** — per-card scheduling. Review history is grouped into session files.

## The authoring handshake

Card creation is import-only, in two steps:

1. `mergelearn context` emits an **AuthoringContext** (existing sets, the full
   tag taxonomy, folders) for your agent to author against — so it reuses tags
   instead of inventing synonyms.
2. Your agent returns an **AgentSetPatch** JSON; `mergelearn import` validates
   it (structure gate + tag-graph guard), freezes cited code, and writes it.

Both gates must pass or nothing is written.

## Requirements

- Node.js 20 or newer.
- Git on `PATH` (only needed for cards that cite repo code).

## Install (local development)

```bash
npm install
npm run build
npm link            # optional: puts `mergelearn` on your PATH
```

Or run the built CLI directly:

```bash
node dist/libCli.js --help
```

## Quick start

```bash
# 1. Ask your agent to author against the current library state.
#    (repo is optional; omit --repo for purely conceptual sets.)
mergelearn context --goal "TypeScript union types" --repo /path/to/repo > context.json

# 2. Hand context.json to your coding agent; it returns an AgentSetPatch JSON.

# 3. Import the patch (validates, freezes cited code, writes the set).
mergelearn import --file patch.json --agent my-coding-agent

# 4. Review.
mergelearn due                                  # what's due now
mergelearn show --set ts-union-types --card <id>  # learn by reading
mergelearn grade --card <id> --rating 3         # 1 Again, 2 Hard, 3 Good, 4 Easy
```

The library lives at `~/.mergelearn/` (override with `MERGELEARN_HOME` or
`--home`).

## CLI commands

```bash
mergelearn context --goal "..." [--repo <path>] [--target-set <id>]
mergelearn import  --file <patch.json> [--agent <name>]
mergelearn sets
mergelearn due     [--set <id>] [--tag <id>] [--folder <path>]
mergelearn show    --set <id> --card <id>
mergelearn grade   --card <id> --rating <1-4>
mergelearn serve   [--port <n>]
```

## Review GUI

Prefer a browser? `mergelearn serve` starts a local, offline web UI on
`127.0.0.1` — no network calls, no bundled model. Two tabs: **Home** (your
sets + what's due) and **Practice** (one card at a time; reveal with
space/Enter, grade with `1`-`4`). It reads the same on-disk library as the
CLI, so you can mix the two. Authoring stays import-only — the GUI reviews
cards, it does not create them.

## Storage layout

```
~/.mergelearn/
  library/
    tags.json                     the taxonomy = the learning graph
    folders.json
    sets/<setId>/
      set.json
      order.json                  agent-authored teaching order
      imports.json                provenance of each applied patch
      cards/<cardId>.json         one file per card
  repos/registry.json             stable repoId -> path (optional)
  profile/sessions/<date>/        one file per review sitting
```

## Privacy

MergeLearn is local-first and model-free by design.

- No telemetry, no required network calls, no bundled model.
- Your coding agent does the authoring; MergeLearn never sends code anywhere.
- Cited code is read from your local disk and frozen at a pinned commit.

## Verification

```bash
npm run check          # tsc --noEmit
npm test               # vitest
npm run build          # emit dist/
npm run smoke          # build + CLI --help
npm run smoke:package  # pack the tarball and run the packaged binary
```

## Documentation

- `docs/design/redesign-2026-07/` — the v2 north-star design (object model,
  storage, pipeline, UI, deletion inventory).
- `docs/PRIVACY.md` — local-first privacy model.

## Release status

The package is still `private: true`. Product name and distribution channel
need explicit human approval before any public publish.

## License

Licensed under the PolyForm Noncommercial License 1.0.0. See [LICENSE](./LICENSE).
Noncommercial use is allowed under the public license; commercial use requires
separate permission from the copyright holder, Odra Labs. This is a
source-available license, not an OSI-approved open-source license.
