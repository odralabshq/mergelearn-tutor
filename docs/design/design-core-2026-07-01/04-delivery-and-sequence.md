---
type: design
title: "Core Redesign: Delivery and Sequence"
description: "Skill-first delivery and the dependency-ordered master build sequence."
resource: docs/design/design-core-2026-07-01/04-delivery-and-sequence.md
tags: [design, core, delivery, sequence]
timestamp: 2026-07-01
---

# Core Redesign - Delivery and Sequence

Date: 2026-07-01
Author: Claude Opus 4.8 (via kiro)
Status: design, not yet implemented
Parent: `../CORE_PLATFORM_PLAN_2026_07_01.md`
REFINED: see `05-review-and-refinements.md`. The MoA review made the endpoint default LOCAL (privacy), forced verify/grounding to always run on built-in tools even in hosted mode, added a state-file lock, swapped the tune/context-tools order, and reconciled the budget upward (~6.5-8.5 weeks). Where this doc and 05 differ, 05 wins. Inline corrections marked [REFINED].

## Goal

Ship the core so any coding agent (and any LLM) can drive it, with the least new runtime. Skill-first over the existing CLI; MCP deferred. Time: 3-4 days. Then the master sequence for the whole redesign.

## Current state (grounded)

- `src/cli.ts` is the entry point; the tool already runs end to end as a CLI (ingest, generate, today, dashboard - confirmed by the passing `tests/cli/cli.test.ts`).
- `llmClient.ts` reads `OPENAI_API_KEY`/`OPENAI_BASE_URL`/`OPENAI_MODEL` from env - so a configurable endpoint is already 80% there; it just needs a config surface and docs.
- There is no MCP code in the repo (confirmed by search). Skill-first avoids adding any.

## Delivery mode: skill + CLI (primary now)

The bring-your-own-LLM story is a skill that teaches a host coding agent to drive the existing CLI. No new server, no new protocol.

- Endpoint config surface. [REFINED by doc 05: local default for privacy.] Expose `OPENAI_BASE_URL`/`OPENAI_MODEL`/`OPENAI_API_KEY` via a documented `mergelearn config` path or `.skilltrace/config.json`. The DEFAULT must be a LOCAL endpoint (Ollama/LM Studio/llama.cpp OpenAI-compatible); cloud (OpenAI, Anthropic-compat) is explicit opt-in behind a one-time consent prompt that names what leaves the machine (code snippets + diffs). Defaulting to a cloud key would contradict the tool's local/privacy-first identity. This is the "any LLM" promise done safely.
- The skill. A `SKILL.md` (shipped in the repo under `skill/`, installable into any agent) that documents the daily loop: when to run `mergelearn generate`, how to run `mergelearn today`, how to feed answers back, how to request history judgment. The host agent supplies the LLM and its own grep/git/read tools.
- Hosted-mode tool delegation. When a host agent drives MergeLearn, the author's context tools (doc 01) MAY defer to the host's grep/git/read for GATHERING context. [REFINED by doc 05: verification never delegates.] But the grounding path - the frozen-snippet fetch and `verify.ts` - ALWAYS runs on MergeLearn's built-in tools, even in hosted mode. Delegating verification to tools with different output contracts is exactly where grounding bugs hide, so the trust layer is never delegated. Detect hosted mode via an env flag the skill sets; fall back to built-in tools otherwise.

## MCP (deferred)

MCP server mode exposing the same learning layer (`generate_cards`, `next_review`, `grade_answer`, `record_confidence`, `progress_report`, `analyze_history`) is NOT part of this redesign. Add it only when triggered: a non-skill client (ChatGPT, some IDEs) needs to call MergeLearn, typed/versioned contracts become valuable, or the interaction turns stateful multi-step. The skill + CLI surface covers the near-term "plug into any coding agent" goal at a fraction of the maintenance cost.

## Time breakdown (3-4 days)

- Endpoint config surface (`.skilltrace/config.json` + docs): 1 day.
- `SKILL.md` + the daily-loop documentation: 1 day.
- Hosted-mode tool delegation flag + fallback: 1-1.5 days.

## Master sequence (the whole redesign)

[REFINED by doc 05: order and budget corrected.] Ordered by dependency so a testable core exists as early as possible AND so no data-destructive step runs before the new loop is validated. Each step ends green (full verification: `npm run check && npm test && npm run build`).

0. Simplification as NON-destructive code cleanup (doc 00). 2-3 days. Remove dead author paths and unused collections from NEW writes, but keep the old deterministic author + removed collections readable behind a feature flag / on a branch. No lossy migration yet.
1. LLM-only author skeleton + endpoint config, LOCAL default (doc 01 + doc 04). 2-3 days. Tool still runs end to end.
2. Context tools: grep, readRange, gitContext (doc 01). 2-3 days. [MOVED BEFORE tuning] - so the author has its real inputs when quality is judged.
3. Authoring prompt + exemplars + eval set + tune to threshold (doc 01 + doc 05 eval). 4-5 days. FIRST REAL QUALITY TEST POINT, now with the full author and a falsifiable metric (not eyeballing).
4. History + grading + answer-key validator + verify.ts + SHA-pin/drift (doc 02 + doc 05). 5-6 days. CORE LOOP IS NOW TESTABLE, TRUE, AND STABLE.
5. Typed graph (2 edges) + state machine + FSRS (custom steps, mastery formula) (doc 03 + doc 05). 6-8 days.
6. Skill + CLI delivery: local default, built-in verify path, file lock, tolerant JSON (doc 04 + doc 05). 4-5 days.
7. Real-repo test buffer against the eval set. 4-6 days.
8. Destructive v2 migration + fixture test (doc 00 + doc 05). 2 days. LAST - only after the new loop is validated. Seeds FSRS state from existing mastery (no cold-start herd); writes a v1 backup first.

Honest total: ~31-41 working days = 6.5-8.5 weeks (reconciled with the per-step sum; the earlier 4.5-6 weeks did not budget the answer-key validator or SHA-pinning).

After step 4 you can stop and test the loop on real repos before committing to steps 5-8. That is the intended checkpoint: the golden core (generate -> review -> grade -> represent) is complete, TRUE (independent answer-key validation), and STABLE (SHA-pinned snippets) at step 4. The destructive migration deliberately waits until step 8 so a failed bet is recoverable.

## What this redesign explicitly does NOT do

Per the parent plan's deferral: no extra card body types (cloze/MCQ/code-input), no Anki export, no question-catalog templates, no second-language pipelines. Multi-language is handled by the LLM-at-core being language-agnostic and tools degrading per file (universal tier: LLM + grep + read + git covers any repo). These are backlog, tracked in `../PLATFORM_IDEAS_LOG_2026_07_01.md`.