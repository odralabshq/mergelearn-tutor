# MergeLearn

MergeLearn is a local-first, model-free learning tool. Your own coding agent
writes the lessons; MergeLearn stores them, schedules reviews with FSRS, and
gives you a local website to learn from. It ships no model and makes no network
calls.

## How you use it

```bash
npm install -g mergelearn
mergelearn setup-agent
```

Then open your coding agent in a repository and ask:

> Create a MergeLearn lesson from my last PR.

For worthwhile work, the agent reads relevant recent lessons, writes an
AgentSetPatch, and runs `mergelearn apply --file <patch.json> --open`. That
single action validates and stores the lesson, starts or reuses one local server,
opens its exact URL, and prints the URL as a fallback. It may deliberately create
no lesson when the work has no durable learning value.

`mergelearn serve` reuses the same managed local server; `--port 4321` requests a
fixed port only when it needs to start one. The server closes after inactivity.
Home lists lessons with their objective, estimated time, progress, and one Start /
Continue / Practice again action. Due spaced-repetition reviews stay separate.

<p align="center">
  <img src="docs/assets/screenshots/lesson-home.png" alt="MergeLearn Home showing a sample lesson, its objective and duration, and four due reviews" width="100%">
</p>

*Home keeps authored lessons and spaced-repetition reviews separate.*

### Try it before using an agent

From the empty Home page, click **Try a sample lesson**, or run:

```bash
mergelearn sample
mergelearn serve
```

The sample is opt-in, offline, and demonstrates every question type. Running the
command again does not create duplicates.

## Install details

Requirements: Node.js 20 or newer. Git is needed only for lessons that cite
repository code.

`setup-agent` auto-detects installed coding agents. Supported agents: `claude`
(Claude Code), `codex`, `cursor`, `opencode`, and `gemini`.

```bash
mergelearn setup-agent                                  # detected agents, global
mergelearn setup-agent --agent all                      # every supported agent
mergelearn setup-agent --agent claude,codex --scope project
mergelearn setup-agent --dry-run                        # preview, write nothing
mergelearn setup-agent --uninstall                      # remove managed copies
mergelearn doctor                                       # read-only setup diagnosis
```

The installer copies the canonical skills (no symlinks), records checksums so
reruns are idempotent, and never overwrites a copy edited by hand. Unsupported
agents can read `skills/mergelearn-authoring/SKILL.md` directly.

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

Code-ordering activities work with the mouse or keyboard. Select a tile, move it
with the arrow keys or visible buttons, or drag it into place.

<table>
  <tr>
    <td width="50%"><img src="docs/assets/screenshots/code-ordering-selected.png" alt="A shuffled code-ordering activity with the function signature tile selected"></td>
    <td width="50%"><img src="docs/assets/screenshots/code-ordering-reordered.png" alt="The same code-ordering activity after moving the selected signature tile to the first position"></td>
  </tr>
  <tr>
    <td><em>Select a code tile.</em></td>
    <td><em>Move it without losing selection.</em></td>
  </tr>
</table>

After an attempt, MergeLearn reveals deterministic feedback and the authored
explanation. Your confidence grade controls FSRS scheduling; answer correctness
is stored as evidence but does not grade your confidence for you.

<p align="center">
  <img src="docs/assets/screenshots/answer-feedback.png" alt="A correct multiple-choice attempt with targeted feedback, full explanation, and Again, Hard, Good, and Easy confidence controls" width="75%">
</p>

*Feedback appears only after the attempt; the learner still chooses the review grade.*

## Ways to use it

- **Learn a codebase.** Ask your agent to author lessons from real files; cited
  code is frozen at a pinned commit so the lesson stays stable.
- **Learn a concept.** Skip the repo and ask for a conceptual lesson on any
  topic (a language feature, an algorithm, a protocol).
- **Keep it fresh.** Review the due queue in the browser now and then; FSRS
  spaces cards so you revisit them right before you would forget.
- **Preview before you trust it.** Run `mergelearn apply --dry-run` on an
  agent's output to see what would be created before it touches your library.

## CLI commands

The browser is the main interface, but every action is also available on the
command line.

```bash
mergelearn context     [--goal "..."] [--repo <path>] [--target-set <id>] [--recent <n>]
mergelearn apply       --file <patch.json> [--agent <name>] [--open] [--dry-run]
mergelearn skip        --task <text> --reason <text>
mergelearn sample      [--dry-run]
mergelearn doctor
mergelearn status
mergelearn list        <sets|cards|due> [filters]
mergelearn archive     <setId/cardId>
mergelearn unarchive   <setId/cardId>
mergelearn edit        <setId/cardId> [content options]
mergelearn delete      <setId|setId/cardId> --yes [--force]
mergelearn settings    [--review-session-cap <n>] [--queue-strategy overdue|interleaved]
mergelearn due         [--set <id>] [--tag <id>] [--folder <path>] [--limit <n>]
mergelearn show        <setId/cardId>
mergelearn grade       <setId/cardId> <1-4>
mergelearn mastery
mergelearn check       [--set <id>] [--archived]
mergelearn prune       [--set <id>] [--yes]
mergelearn export      --set <id> --output <lesson.mergelearn.zip>
mergelearn import      --file <lesson.mergelearn.zip> [--as-copy] [--dry-run]
mergelearn backup      --output <profile.mergelearn-backup.zip>
mergelearn restore     --file <profile.mergelearn-backup.zip> [--force] [--dry-run]
mergelearn serve       [--port <n>]
mergelearn setup-agent [--agent <ids|all>] [--scope global|project] [--dry-run] [--uninstall]
```

Global options work before or after any operational command: `--home <path>`
selects the library, `--json` emits machine-readable output, and `--yes`
confirms destructive or bulk actions. Run `mergelearn help <command>` for full
options or `mergelearn help --all` for internal and deprecated spellings.

`context` prints the current library state for an agent; `--goal` is optional but
helps focus the lesson, while `--recent` exposes recent question summaries,
source paths, and review state. `apply --open` is the normal agent workflow:
it validates, stores, starts or reuses one local GUI, opens the exact lesson, and
prints the URL. `apply` without `--open` is the lower-level storage primitive for
scripts and dry runs; `skip` records meaningful completed work for which the
developer deliberately made no lesson. Early-stage
"Worth it" feedback controls are shown by default; set
`MERGELEARN_DOGFOOD_CONTROLS=0` before starting the server to hide them.

Each lesson is included in spaced repetition by default. Its lesson page has an
**Include in spaced repetition** checkbox for a reversible learn-once opt-out.
This learner preference survives later agent re-imports of the lesson.

Lesson bundles contain authored teaching content, interactions, referenced tags,
assets, and frozen source excerpts. They exclude review schedules, sessions,
preferences, agent metadata, and local repository identifiers. Private profile
backups are different: they preserve learning state, history, configuration, and
the repository registry. Backup files are unencrypted and should be stored
securely.

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

Licensed under the [Apache License 2.0](./LICENSE). MergeLearn is free to use,
modify, and distribute under its terms.
