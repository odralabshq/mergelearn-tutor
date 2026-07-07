---
title: "MergeLearn Tutor — Card Pipeline (2026-07 Redesign)"
description: "Import-only, agent-authored pipeline built around an AgentSetPatch handshake: the tutor hands the agent the existing taxonomy as context, the agent returns cards plus tag/graph extensions, and the tutor validates structure and freezes any cited code from disk. No bundled model, no answer-key oracle, no QuestionPlane, no deterministic tag extraction."
resource: docs/design/redesign-2026-07/03-CARD-PIPELINE.md
tags: [architecture, pipeline, authoring, redesign]
updated: 2026-07-07
status: design
---

# Card Pipeline

The platform authors nothing and analyzes no code. It hands the agent the
current library state as context, the agent returns a complete set patch, and
the tutor validates and stores it. This is the direct consequence of the
locked decisions: zero model runtime, no deterministic structure inference,
and one agent-maintained taxonomy.

---

## 1. Before vs after

| | Before (as-built) | After (redesign) |
|---|---|---|
| `cards generate` (LLM sole author) | live | **removed** |
| deterministic question pipeline | live | **removed** |
| deterministic concept/tag extraction | live (`concepts.ts`) | **removed** |
| bundled author runtime (`author`, `llmClient`, `endpoint`, `budget`, `exemplars`) | shipped | **removed** |
| answer-key oracle (`answerKey.ts`) | needs endpoint | **removed from core** |
| `QuestionPlane` taxonomy | load-bearing | **removed** (card type is a tag) |
| `cards import` (agent drafts) | `AgentCardDraft[]` | **`AgentSetPatch`, the only path** |

The single creation path is: the agent submits an `AgentSetPatch`, the tutor
imports it.

---

## 2. The authoring handshake (two steps, not one)

The old import was one-way: the agent guessed cards blind. The new flow is a
handshake, because the agent must SEE the existing taxonomy before extending
it — otherwise it re-invents tags the library already has ("errors" vs
"error-handling" vs "exceptions"), which is exactly the blind-tagging failure
this redesign forbids.

```
STEP 1  tutor -> agent   AuthoringContext
        (existing sets, the full tag taxonomy, folder tree, the goal)
              |
        agent authors against real context: reuses tags where they exist,
        proposes new tags/edges only where genuinely needed
              |
STEP 2  agent -> tutor   AgentSetPatch
        (set + cards + tag uses + proposed tags + graph edges + order)
              |
        tutor validates + freezes cited code + writes files
```

The tutor **commissions**; it never authors. But it is not a passive
sink — it supplies context in step 1 so the agent extends the taxonomy
intelligently, and it validates in step 2 so the agent cannot corrupt it.

```ts
export type AuthoringContext = {
  goal: string;                 // "teach the auth flow", "TypeScript unions"
  repo?: RepoRef;               // present only for repo-grounded sets
  existingSets: SetSummary[];   // titles + folder paths + card counts
  existingTags: CardTag[];      // THE taxonomy the agent must reuse/extend
  folderTree: string[];         // existing folder paths
  targetSetId?: string;         // when adding to an existing set
};
```

---

## 3. AgentSetPatch — the submission (replaces AgentCardDraft[])

The old contract was a flat array of card drafts. That could not express tag
reuse or taxonomy growth. The `AgentSetPatch` is set-centric: it declares the
set, which existing tags it reuses, which new tags/edges it proposes, the card
order, and the cards themselves.

```ts
export type AgentSetPatch = {
  version: 1;
  set: {
    id?: string;                // omit to create; present to update
    title: string;
    description?: string;
    folderPath?: string;
    tagIds: string[];           // set-level tags (must resolve after tag patch)
  };
  tagPatch: {
    reuse: string[];            // ids of existing tags the cards use
    add: ProposedTag[];         // NEW tags, with parent/related into the taxonomy
  };
  order: string[];              // agent-authored card sequence (localId or id)
  orderNote?: string;           // why this sequence (pedagogical rationale)
  cards: AgentCardDraft[];
};

export type ProposedTag = {
  localId: string;              // referenced by cards in this patch
  label: string;
  kind?: string;
  description?: string;
  aliases?: string[];
  parentIds?: string[];         // existing tag ids OR other localIds in this patch
  relatedIds?: string[];
};
```

---

## 4. AgentCardDraft — the per-card payload

Each card carries a self-contained front/back (doc 01 sec 3) and OPTIONAL
source references. It carries NO snippet text for provenance — the tutor
freezes that from disk. Any code in `back.examples` is illustrative, authored
by the agent, and never trust-checked.

```ts
export type AgentCardDraft = {
  localId: string;              // unique within the patch; used by order + tags
  id?: string;                  // present when updating an existing card
  folderPath?: string;          // optional override within the set
  tagRefs: string[];            // existing tag ids OR ProposedTag localIds

  front: {
    prompt: string;
    contextMarkdown?: string;
  };
  back: {
    shortAnswer: string;
    explanationMarkdown: string;
    examples?: { label?: string; language?: string; code?: string; note?: string }[];
    commonMistakes?: string[];
    sourceNotes?: string[];
  };

  sourceRefs?: {                // OPTIONAL — omit for pure conceptual cards
    repoId: string;
    path: string;
    startLine: number;
    endLine: number;
  }[];
};
```

---

## 5. Import pipeline — validate, freeze, write

All deterministic, all model-free. This is why the platform runs with zero
bundled model.

```
receive AgentSetPatch
      |
validateTagPatch     no cycles, no dangling parents, no dup labels/aliases;
                     reuse[] ids all resolve; localIds unique
      |
validateStructure    every card: prompt/shortAnswer/explanation non-empty;
                     prompt != shortAnswer (anti-trivia); tagRefs resolve;
                     order[] covers exactly the patch's cards
      |
freezeSources        for cards WITH sourceRefs: readRange re-reads cited lines
                     at HEAD SHA; agent text discarded; frozenText + commit pinned
                     (cards without sourceRefs skip this step)
      |
dedupeCards          near-duplicate prompt detection within the target set
      |
decideStatus         active (all pass) | needs_review (soft issue) | blocked
      |
commit               write tags.json patch, set.json, order.json, cards/*.json,
                     and one ImportRecord
```

**What changed from as-built:** `verifyFormat` and `checkSnippetDrift` survive
(now structure + freeze). `teachability.ts` is **downgraded**: the substantive-
code-line floor only applies to cards that HAVE source refs. A conceptual card
teaching TypeScript unions has no snippet to score, so quality rests on the
schema (non-empty short answer + explanation), not a code-density heuristic.
`answerKey.ts` and `staging.ts`'s oracle branch are gone.

---

## 6. ImportRecord — provenance of each patch

Replaces `CardBatch`. One record per applied `AgentSetPatch`, so every card
traces back to the import that created it (and the agent/model behind it).

```ts
export type ImportRecord = {
  id: string;
  setId: string;
  agentName?: string;
  agentModel?: string;
  cardIds: string[];          // cards created/updated by this patch
  tagIdsAdded: string[];      // taxonomy growth from this patch
  createdAt: string;
};
```

---

## 7. Ordering is agent-owned; git chronology is only a hint

The set's card sequence lives in `order.json`, authored by the agent, with a
rationale in `orderNote`. The tutor does not compute ordering.

```json
{
  "version": 1,
  "strategy": "agent_authored",
  "cardIds": ["variables", "types", "unions", "narrowing", "throws"],
  "note": "Syntax first, then type reasoning, then error handling."
}
```

For repo-grounded sets, the `AuthoringContext` may *suggest* git-chronological
order as one signal ("teach roughly in the order the code was built"), but it
is a soft recommendation the agent can override for pedagogy — never a default
the tutor imposes.

---

## 8. Onboarding commissions a full patch, not just cards

Onboarding (doc 04) collects a short brief — repo (or "no repo, a topic"),
focus, depth, set name — and turns it into the `goal` + `repo` fields of the
`AuthoringContext`. The agent returns one `AgentSetPatch`: a set, its tags,
its order, and its cards. Because authoring is not instant, the UI shows an
honest "authoring your set..." state; there is no pre-baked demo set in v1.

---

## 9. Why this is safe

The trust boundary is intact: for any card that cites code, the agent's
snippet text is discarded and re-frozen from disk. Removing the bundled author
and the answer-key oracle does not weaken a guarantee — it deletes the
components the platform evaluation flagged as the quality bottleneck (the local
author failed answer_correct ~44%). Quality now rests on a frontier agent the
user already trusts, and the tutor's job narrows to what it can do
deterministically and perfectly: validate structure, freeze provenance, and
protect the taxonomy.
