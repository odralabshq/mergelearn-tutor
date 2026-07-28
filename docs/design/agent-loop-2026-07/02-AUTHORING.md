---
title: "MergeLearn: Flexible Authoring Contract"
description: "Let the agent author from the task it just completed using optional context sources, and keep question generation agent-directed. Guidance lives in the skill; validation stays structural. No new schema, no fixed question count, and the agent may decline to create a lesson."
resource: docs/design/agent-loop-2026-07/02-AUTHORING.md
tags: [design, authoring, skill, 2026-07]
updated: 2026-07-28
status: design
---

# Flexible Authoring Contract

Tasks 2 and 3. This is primarily a change to
`skills/mergelearn-authoring/SKILL.md`; the persisted lesson schema stays
unchanged.

## 1. The failure being fixed

The earlier attempt (`odralabshq/mergelearn`, abandoned) produced repetitive,
weak, diff-level questions. Diagnosis: questions were generated **outside** the
working agent's context, by a separate process reconstructing intent from a diff.

A diff shows what changed. It cannot show what was considered and rejected, what
the agent was unsure about, or why one approach won. That material is the most
valuable thing in a lesson and it exists only in the authoring agent's working
context.

So: the agent that did the work authors the lesson, in the same session, while
that context is still live.

## 2. Context sources: optional, never mandatory

When relevant and genuinely known, the agent may draw on:

- task objective;
- behaviour introduced or changed;
- important implementation decisions;
- rejected alternatives and their trade-offs;
- assumptions and uncertainties;
- important failure cases;
- verification or testing performed;
- relevant files, symbols and commit references.

**These are sources of context, not required fields.** Hard rule for both the
skill text and any validation: the agent must never invent rejected alternatives,
uncertainties or failure cases to satisfy a schema. A fabricated trade-off is
worse than an absent one because it teaches something untrue.

No dependency on hidden chain-of-thought. Use only what the agent can state
explicitly from the task, conversation, code and tool results. Agents expose
their reasoning inconsistently; a contract that assumes otherwise breaks on four
of the five supported agents.

## 3. No persisted task-context schema yet

Do not add `taskContext` to `AgentSetPatch` or `CardSet` in this workstream. The
requirement is that the working agent **uses** its task context to author better
cards, not that MergeLearn stores an account of the agent's reasoning.

Persist only through fields that already have a learner-facing purpose:

- `set.objective` and `set.description` for the lesson's purpose;
- card prompts, explanations and examples for decisions and trade-offs worth
  teaching;
- `sourceRefs` for file and commit grounding;
- `orderNote` only when ordering itself needs explanation.

This avoids creating metadata that no current screen or workflow consumes. If
real users later ask to inspect task decisions separately from the lesson, add a
schema then, with a concrete reader and migration path.

`summarizeLesson()` stays advisory and unchanged.

## 4. Question generation stays agent-directed (task 3)

The existing skill currently says a lesson has 6-10 activities and should mix
specific interaction types. That conflicts with this design and must be removed
in the same implementation change. Replace it with the priorities below; do not
leave both sets of guidance in the packaged skill.

No mechanical rules decide which questions are permitted. Guidance goes in the
skill as **priorities**, not gates:

- prioritise questions that improve understanding of the implementation;
- prefer behaviour, reasoning, trade-offs, interactions and failure cases over
  trivial recall;
- use filenames, functions and code excerpts wherever they ground the question;
- avoid questions whose only value is recalling something directly visible;
- any supported interaction type is allowed if it fits the concept;
- one question, several, or **no lesson at all** are all valid outcomes.

Explicitly **not** enforced: a fixed question count, and a requirement that every
lesson contain a causal or predictive question. Both were considered and rejected:
a quota manufactures filler, and filler is what gets a tool uninstalled. The agent
judges what suits the task.

## 5. Acceptance

Automated:

1. Existing `AgentSetPatch` fixtures import unchanged. This task adds no required
   patch field and no migration.
2. A single-card lesson imports cleanly. A zero-card patch remains structurally
   invalid under `validateSetPatchStructure`; "no lesson" means the agent does
   not invoke `create-and-open`.
3. `summarizeLesson()` remains unchanged; this task adds guidance, not a new
   validation gate or persisted metadata.
4. The packaged `skills/mergelearn-authoring/SKILL.md` contains the optional
   context sources and permission to create no lesson; it no longer mandates
   6-10 activities or a fixed interaction mix.

Manual, and this is the real test:

5. Complete a genuine coding task with the agent, author a lesson in the **same
   session**, and confirm at least one question references a decision or
   trade-off that is **not** visible in the diff alone. This is the single check
   that distinguishes this from the abandoned attempt.
6. Complete a trivial task (typo fix, version bump) and confirm the agent
   declines to author a lesson rather than producing filler.
7. Inspect three consecutive lessons: no question is answerable purely by
   reading the filename or the visible snippet.
