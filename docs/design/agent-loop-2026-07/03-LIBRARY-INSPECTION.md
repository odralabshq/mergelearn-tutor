---
title: "MergeLearn: Library Inspection for Agents"
description: "Give the authoring agent machine-readable access to existing material so it can avoid repetition, deepen concepts, stay consistent in terminology and spot gaps. Extends the existing context/sets/cards commands rather than adding a parallel command family. No embeddings."
resource: docs/design/agent-loop-2026-07/03-LIBRARY-INSPECTION.md
tags: [design, cli, agent-context, 2026-07]
updated: 2026-07-28
status: design
---

# Library Inspection for Agents

Task 4. Build after `01` and `02`. It improves authoring quality; it does not
enable the loop.

## 1. Purpose is broader than deduplication

The agent should be able to:

- avoid unnecessary repetition;
- revisit a concept when the new task materially extends it;
- create progressively deeper questions;
- stay consistent with previous terminology;
- connect related concepts across lessons;
- identify gaps in the existing sequence.

Only the first is deduplication. The rest need enough structure that the agent can
reason about progression, which is why raw titles alone are insufficient.

## 2. Do not add a parallel command family

The proposed `lessons recent`, `concepts list`, `lesson show <id>` largely
duplicate what exists:

| Proposed | Already exists |
|---|---|
| `lessons recent --json` | `sets` (via `listSetSummaries`) |
| `concepts list --json` | tags, already in `AuthoringContext.existingTags` |
| `lesson show <id> --json` | `cards --set <id> --json` |

`mergelearn context` already exists precisely as "the tutor's half of the
handshake… emitted BEFORE it authors, so it reuses existing tags/folders instead
of inventing synonyms" (`authoringContext.ts`). That is this task's job.

**So: extend `context`, do not fork it.** A second overlapping surface would drift
out of sync with the first.

## 3. Extend `AuthoringContext`

Current shape: `{ goal?, repo?, existingSets, existingTags, folderTree,
targetSetId? }`. Add one optional block:

```ts
recentLessons?: Array<{
  setId: string;
  title: string;
  objective?: string;
  createdAt: string;
  tagIds: string[];
  citedPaths: string[];        // deduped SourceRef.path values
  questionSummaries: string[]; // card prompts, truncated
  reviewState?: { cards: number; due: number; lapses: number };
}>;
```

Add `--recent <n>` (default 10) to `mergelearn context`. The command already
always emits JSON; do not add a redundant `--json` flag.

Field rationale, since each one buys a specific behaviour:

- `questionSummaries` → avoid asking the same thing twice.
- `citedPaths` → notice this task touches an already-taught file, so deepen
  rather than repeat.
- `tagIds` + `existingTags` → consistent terminology; the existing anti-synonym
  mechanism.
- `createdAt` → recency, so old material can be legitimately revisited.
- `reviewState.lapses` → the strongest gap signal available. Repeatedly lapsed
  cards mark concepts the human has *not* absorbed, which is exactly where a
  deeper question is warranted.

Truncate `questionSummaries` (~120 chars) and cap `recentLessons`. This lands in
an agent prompt, so an unbounded dump would crowd out the task context that makes
the lesson good in the first place.

## 4. Skill change

Instruct the agent to run `mergelearn context --recent 10` **before** authoring
when the task plausibly overlaps existing material, then decide whether to extend
a prior lesson, revisit a weak concept, or start a new one. No separate decision
metadata is persisted.

Keep it advisory. Do not make inspection a hard precondition of `create-and-open`;
a mandatory round-trip adds a failure mode to the loop we are trying to smooth.

## 5. Not in scope

No embeddings, no vector search, no automatic semantic deduplication, no
similarity scoring service. Structured metadata plus plain text the agent
interprets. Revisit only if duplicates survive at a volume that manual reading
cannot handle. At current volume (single-digit lessons), that is not the case.

## 6. Acceptance

Automated:

1. `context` on an empty library returns valid JSON with `recentLessons: []`
   and does not throw.
2. After importing three lessons, `context` lists all three, newest first.
3. `--recent 2` returns exactly two.
4. `citedPaths` on a repository lesson contains the cited file paths, deduped.
5. `questionSummaries` are truncated to the documented cap.
6. `reviewState.due`/`lapses` reflect real FSRS state after grading a card.
7. Output stays valid JSON with a set title containing quotes/newlines.

Manual:

8. Author a lesson on a file already covered by an earlier lesson; confirm the
   agent inspected context and either deepened the concept or explicitly said it
   was new rather than re-asking a near-identical question.
