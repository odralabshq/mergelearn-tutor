---
title: "MergeLearn Tutor — Storage & Migration (2026-07 Redesign)"
description: "Global ~/.mergelearn/ library: folder-per-set, one JSON per card, agent-authored order files, a single agent-maintained tag taxonomy, and per-session review history. Recommends a clean-slate v2 cutover for the pre-launch platform, with the phased dual-write migration kept only as a fallback if real user data exists."
resource: docs/design/redesign-2026-07/02-STORAGE-AND-MIGRATION.md
tags: [architecture, storage, migration, redesign]
updated: 2026-07-07
status: design
---

# Storage & Migration

Current reality (`src/core/store.ts`): one JSON file per repo at
`<repo>/.skilltrace/state.json`, a `TutorState` v1 object, ~150 call sites
keyed on `repoPath`. The target is a global `~/.mergelearn/` library with
folder-per-set and card-per-file storage.

---

## 1. Target layout

```
~/.mergelearn/
  config.json                     global prefs + trust flags (no model config)
  repos/
    registry.json                 repoId -> path/label/status (OPTIONAL infra)
  library/
    tags.json                     THE taxonomy (tags = hierarchy + relations)
    folders.json                  optional folder metadata (labels/descriptions)
    sets/
      typescript-basics/          one folder per set (folder name = setId)
        set.json                  CardSet metadata
        order.json                agent-authored card sequence
        cards/
          variables.json          one JSON per Card (filename = cardId)
          union-types.json
          throw-errors.json
        assets/                   optional per-set media
  profile/
    user.json                     preferences + derived learning summary
    stats.json                    DERIVED cache (rebuildable from sessions)
    sessions/
      2026-07-07/
        session_2026-07-07T18-42-00.json
```

**Folder-per-set + card-per-file** is the deliberate choice over one big set
JSON. See sec 2 for why.

---

## 2. Why folder-per-set and one JSON per card

A set is a directory; each card is its own file. At this scale (tens to a few
hundred cards per set, single user) the wins outweigh the cost:

- **Agents edit one card without rewriting the set.** The authoring loop
  touches individual card files, not a monolith — smaller writes, smaller
  diffs, less clobber risk.
- **Human review is one card = one file.** Easy to open, read, hand-edit.
- **Moving a card** between sets/folders is a metadata change, not a rewrite
  of two large files.
- **Corruption is isolated.** A bad write damages one card, not the set.
- **Sharing/marketplace is trivial later.** A set package is just its folder
  (`set.json` + `order.json` + `cards/` + `assets/`) — zip and go.
- **Git/backup diffs stay clean.**

The one cost — listing a set means reading many small files — is negligible
here. If it ever bites, add a derived per-set index cache; do not pre-optimize
into a database now.

---

## 3. The taxonomy is one file, agent-maintained

`library/tags.json` holds the entire tag taxonomy (hierarchy + relations).
There is no separate concept-graph file — tags carry `parentIds`/`relatedIds`
(doc 01 sec 4), so this one file is the DAG.

- The tutor reads it to build the `AuthoringContext` it hands the agent
  (doc 03), so the agent reuses existing tags instead of inventing synonyms.
- Agent imports patch it (add tags, add edges) through validation that rejects
  cycles, dangling parents, and duplicate labels/aliases.
- `folders.json` is optional sugar (folder labels/descriptions); folder
  *paths* live as plain strings on sets and cards, so the tree needs no
  central registry to function.

---

## 4. Repo registry — optional infrastructure, not the root

Repos are a *source* of material, not the root of the data model. A
conceptual set (TypeScript, algorithms) has no repo at all. The registry
exists only to keep repo-grounded cards anchored when a folder moves.

```ts
export type RepoRef = {
  id: string;                 // stable UUID, generated on first use
  normalizedPath: string;     // current path on this machine
  label: string;              // human-friendly ("ml-core")
  gitOriginUrl?: string;      // aids re-grounding after a move
  status: 'active' | 'missing' | 'deleted';
  createdAt: string;
  lastSeenAt: string;
};
```

A `SourceRef` stores `repoId` (+ path + lines + SHA + frozen text). The
registry maps `repoId` to the current path. Move a folder -> update one
registry entry -> every card stays anchored. Cards with no source refs never
touch the registry.

---

## 5. Migration: recommend a clean-slate v2 cutover

**Context that changes the calculus.** The elaborate 4-phase dual-write
migration in the first draft was designed to protect live user data through a
gradual transition. This platform is **pre-launch**: the only `.skilltrace/`
state is dev/eval data that is regenerable and disposable. Preserving it is
not worth the cost of a dual-write adapter, a mirror-back layer, and a
multi-release choreography.

**Recommendation — one-shot cutover:**

1. Build the global library store (`~/.mergelearn/`) as the only store.
2. Write a one-shot `library import-legacy` that reads any existing
   `.skilltrace/state.json`, maps it via the doc-01 table (best-effort:
   `LearningItem` -> `Card`, `Concept` -> `CardTag`), and writes global files.
   Repo cards keep their frozen snippets; conceptual fields fill what they can.
3. Cut every call site to the new store in one branch. Delete the legacy
   `TutorState` store and all removed modules (doc 05) in the same branch.
4. `.skilltrace/` is dropped and gitignored.

There is no dual-write, no mirror-back, no version-2-migration gating. The old
path is deleted, not deprecated-in-place.

---

## 6. Fallback: phased migration (only if real user data exists)

If, at execution time, there IS non-disposable user data in the wild, fall
back to a gradual path instead of a hard cutover:

1. **Global index (read-only).** Build the global store; a `library sync`
   synthesizes sets/cards into `~/.mergelearn/` while `.skilltrace/` stays
   authoritative.
2. **Adapter + dual-write.** Route call sites through one `StoreAdapter`;
   new imports write global first, mirror a derived view back to local so
   `today`/`review` keep working.
3. **Cutover.** Flip the read pointer to global; local becomes a cache.
4. **Drop local.** Remove the local branch and legacy types.

This is strictly the contingency. Default to the sec-5 clean cutover; only
reach for this if data loss would actually hurt someone.

---

## 7. Provenance edge cases

Reuse the existing `checkSnippetDrift` logic; status is explicit and never
blocks review (the frozen text always remains):

| Situation | Behavior |
|---|---|
| Repo moved/renamed | registry can't resolve -> `missing`; warn, offer relink |
| Repo deleted | `deleted`; card reviewable on frozen text |
| File missing at HEAD | SourceRef `missing`; card reviewable, flagged |
| Commit gone (force-push) | `orphaned_commit`; drift check stops, text stays |
| No source refs at all | nothing to check — conceptual card, always fine |

---

## 8. Privacy model (post model-runtime removal)

MergeLearn ships no model and authors nothing, so its own outbound-code
surface is effectively zero:

- The **authoring agent** holds all model/privacy responsibility. A user who
  needs local-only guarantees connects an agent running a local model.
- There is no answer-key oracle and no bundled endpoint to send code to.
- A `.mergelearnignore` (gitignore-shaped) keeps secrets/paths out of any
  `AuthoringContext` the tutor assembles for the agent (doc 03).
