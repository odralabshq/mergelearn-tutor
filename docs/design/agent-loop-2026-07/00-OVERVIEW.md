---
title: "MergeLearn: Agent Workflow Loop (2026-07)"
description: "Make creating and opening a useful lesson one natural action inside the coding-agent workflow. Scope: create-and-open command, flexible authoring contract, agent-directed question generation, library inspection commands, minimal server lifecycle, one optimized agent integration, dogfood records, relicense. Deliberately excludes PR gates, GitHub Apps, risk engines and team features."
resource: docs/design/agent-loop-2026-07/00-OVERVIEW.md
tags: [design, agent-loop, workflow, 2026-07]
updated: 2026-07-28
status: design
---

# Agent Workflow Loop (2026-07)

## 1. Objective

Make creating and opening a useful lesson a **single, natural action** inside the
coding-agent workflow.

Today the developer must finish a task, remember MergeLearn exists, ask the agent
to author, run `mergelearn serve`, find the printed URL, and navigate to the
lesson. That will not become a habit. The target is:

> Finish a meaningful task → invoke one agent action → a short, relevant lesson
> opens in the browser → decide whether to answer now.

## 2. Division of responsibility

The coding agent decides:

- whether the completed work contains anything worth learning;
- what concepts should be tested;
- which question types fit the material;
- how the new lesson relates to previous lessons.

MergeLearn provides the **tools, context and storage** for the agent to decide
well. It does not infer learning structure and does not run a model. This is
continuous with `redesign-2026-07/00-OVERVIEW.md` §1.

Consequence for this workstream: we add no rule that mechanically accepts or
rejects a question. Guidance goes in the skill; validation stays structural.

## 3. As-built starting point (verified on main)

| Fact | Location |
|---|---|
| `import` is the only card-creation path | `src/libCli.ts` (`import` description) |
| `mergelearn context` already emits an `AuthoringContext` | `src/core/library/authoringContext.ts` (36 lines) |
| `AuthoringContext` = `{goal?, repo?, existingSets, existingTags, folderTree, targetSetId?}` | `src/core/library/types.ts` |
| Per-lesson deep link already routed: `GET /set/<setId>` | `src/session/server.ts` |
| `startReviewServer(root, port = 0)` → `{server, url, close}`, binds `127.0.0.1` | `src/session/server.ts` |
| No lockfile, no `/health`, no idle timeout, no SIGINT/SIGTERM cleanup | `src/session/server.ts` |
| `SourceRef` already carries `commit` + `status: fresh \| drifted \| missing \| orphaned_commit` | `src/core/library/types.ts` |
| `summarizeLesson()` is advisory only: never rejects, never changes card status | `src/core/library/lessonSummary.ts` |
| POST routes reject cross-origin requests | `src/session/server.ts` |
| Authoring skill | `skills/mergelearn-authoring/SKILL.md` (256 lines) |

Two consequences worth stating early:

1. **`create-and-open` is a wrapper, not a new pipeline.** It composes
   `importAgentSet()` + `summarizeLesson()` + server reuse + browser open. No new
   card-creation path is introduced.
2. **Commit binding is mostly already built.** `SourceRef.status` already models
   drift. The remaining work is surfacing staleness in the UI, not new plumbing.

## 4. Task index

| # | Doc | Task |
|---|---|---|
| 1 | `01-CREATE-AND-OPEN.md` | One command: validate, store, ensure server, open lesson URL |
| 2, 3 | `02-AUTHORING.md` | Flexible authoring contract + agent-directed question guidance |
| 4 | `03-LIBRARY-INSPECTION.md` | Machine-readable commands so the agent can read existing material |
| 5 | `04-SERVER-LIFECYCLE.md` | Lockfile, `/health`, reuse, idle timeout, keepalive, signal cleanup |
| 6, 7, 8 | `05-INTEGRATION-DOGFOOD-LICENSE.md` | One optimized agent, dogfood records, Apache 2.0 + repo cleanup |

Recommended build order: **04 → 01 → 02 → 03 → 05.** Server lifecycle first
because `create-and-open` depends on process reuse; authoring next because
quality is what makes the loop worth invoking; inspection after, because it
improves authoring rather than enabling it.

## 5. Non-negotiables for this workstream

- No mandatory lesson per task or per merge. Invocation stays explicit.
- The agent may author **zero** cards when a task holds nothing worth learning.
  A tool that manufactures filler gets uninstalled.
- No fixed question count, and no requirement that every lesson contain a
  causal or predictive question.
- No dependency on hidden chain-of-thought. Use only what the agent can state
  explicitly from the task, conversation, code and tool results.
- No new subsystem where an existing one can be extended.

## 6. Explicitly out of scope

Mandatory lessons or packets per task/merge; GitHub Checks; GitHub App; PR
comments; formal verification records; deterministic risk classification;
organization policy configuration; hosted accounts; centralized evidence
storage; team analytics, SSO, RBAC, audit exports; embeddings or semantic
search; equally deep support for all five agents; product rename.

Each of these remains reachable later without rework if 01-05 land cleanly.

## 7. Validation period

After the loop works, use MergeLearn for **ten real working days**. Evaluate:

- are lessons created regularly without excessive effort;
- does the developer voluntarily answer them;
- does the agent produce useful, progressively consistent material;
- why are lessons skipped or closed;
- does opening the lesson interrupt work more than it helps.

Do not expand the platform during this period unless a blocking defect prevents
the core workflow from being tested.

**Decision gate.** The signal is not quiz correctness. It is whether lessons are
still voluntarily opened and answered after the novelty is gone. If not, the
problem is the lesson, not the trigger and not the positioning.

## 8. Verification strategy

Every doc in this folder ends with an `Acceptance` section written so a second
person (or agent) can check it without reading the implementation. Rules:

- Unit/integration tests go in `tests/` and run under `vitest`.
- Anything involving a real browser, a real agent or process lifetime is a
  **manual** check with an explicit command and expected observation.
- Every acceptance item is objective. No "feels better" criteria, except in the
  dogfood log where subjective judgement is the actual data being collected.
