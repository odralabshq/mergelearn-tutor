# MergeLearn User Manual

MergeLearn is a local-first, model-free learning library. Your coding agent authors lessons; MergeLearn validates, stores, schedules, and serves them locally.

## Install and start

```bash
npm install -g mergelearn
mergelearn setup-agent
mergelearn serve
```

The library lives at `~/.mergelearn/`. Override it with `MERGELEARN_HOME` or `--home <path>`.

## Author a lesson

Ask a configured coding agent to create a MergeLearn lesson. The agent reads authoring context, writes an AgentSetPatch, and applies it through the supported command:

```bash
mergelearn context --goal "TypeScript union types"
mergelearn apply --file patch.json --agent my-coding-agent --open
```

`apply` validates the tag graph, lesson structure, answer-leak rules, and optional source references before writing. Use `--dry-run` to preview without changing the library.

## Browser navigation

`mergelearn serve` opens three primary destinations:

- **Home**: due Review, in-progress learning, evidence-backed weak cards, and up to five recent lessons.
- **Library**: complete Lessons and Cards views, including search, filtering, editing, archive, and restore.
- **Practice**: **Review due** for graded FSRS sessions, plus read-only **Strengthen weak areas** and **External problems** modes.

Learning and Review sessions require JavaScript. Library search and filters retain a server-rendered no-JavaScript path. Strengthen and External problems do not grade cards or write FSRS state.

## Current CLI

```bash
mergelearn list sets
mergelearn list cards [--query <text>] [--set <id>]
mergelearn list due [--set <id>] [--tag <id>] [--folder <path>]
mergelearn show <set/card>
mergelearn grade <set/card> <1-4>
mergelearn mastery
mergelearn weak
mergelearn settings [--review-session-cap <n>] [--queue-strategy overdue|interleaved]
```

Ratings are `1` Again, `2` Hard, `3` Good, and `4` Easy. Grading advances per-card FSRS state and records the review session locally.

Run `mergelearn help` for the grouped command surface or `mergelearn help <command>` for full options. Deprecated spellings remain visible only under `mergelearn help --all`.

## Privacy and state

MergeLearn binds its server to `127.0.0.1`, ships no model, and stores lessons, scheduling state, and sessions in the selected local library. Lesson bundles exclude learner schedules and history; profile backups include them and are unencrypted.
