# MergeLearn Tutor - Core Platform Plan

Date: 2026-07-01
Status: the near-term, scheduled plan for making the CORE features excellent
Scope: card generation, review/repetition, knowledge representation, and the plumbing that makes them work well. Everything else (extra card types, Anki export, catalog templates, extra languages) is explicitly deferred - see the backlog in `PLATFORM_IDEAS_LOG_2026_07_01.md`.
Companion: `PLATFORM_IDEAS_LOG_2026_07_01.md` (full idea memory + reasoning)

## Purpose

Get the core loop - generate a good card, review it, represent what the user knows - as good as it can be, so it can be tested on real repos and refined. This plan enhances quality AND simplifies the architecture at the same time. The two goals are aligned here: the biggest simplification (delegating model access and repo tools to a host coding agent) is also what unlocks the biggest quality lever (any LLM, richer context).

## The simplification thesis

The platform currently has to own three hard things: an LLM client, repo-exploration tooling, and the learning logic. Only the third is its actual product. The plan offloads the first two.

- Model access -> delegated. Lead with a skill wrapping the existing CLI: the host coding agent (Claude Code, Cursor, etc.) supplies the user's chosen LLM. Standalone CLI keeps a configurable OpenAI-compatible endpoint (cloud or local) for users without an agent. Either way, MergeLearn stops shipping a hardcoded model. MCP is a later optional transport (see Core work area 4), not the starting point.
- Repo exploration -> delegated when hosted. When driven by a host agent, that agent already has grep/git/read; MergeLearn leans on those rather than reimplementing them. In standalone CLI mode, MergeLearn provides a minimal built-in tool set (ripgrep, read-range, local git).
- Learning logic -> owned and made excellent. Scheduling, the card model, the concept graph, history, progress, and the authoring/grading prompts. This is the product; this is where the effort goes.

Result: less code to maintain, a smaller dependency surface, and the model/tooling problem solved by delegation rather than by building.

## Core work area 1 - Card generation quality

The single biggest quality lever. The plan implements the research-backed authoring recipe (context + explicit Bloom-level target + few-shot exemplars).

- Make the LLM the sole author. Remove the deterministic question author; it produced snippet-ignoring filler. One author, one code path.
- Rewrite the authoring prompt. Structure per card: role framing (engineer + tutor), the material (snippet + file role + one neighbor + any git/issue evidence), the target (the named plane, its Bloom level, one sentence on what a good answer must do), 6-8 gold exemplars for that plane, constraints (cite the file, answerable from the material, prefer why/what-happens-if over what-is), and a strict JSON output contract.
- Ship gold exemplars as data. 6-8 hand-written cards, one per plane. The cheapest quality win; iterated as data, not code.
- Feed richer context via tools. The author gathers context before writing: grep for usages, read the surrounding range, `git log`/`blame`/`show` for the why. Git history and issues are the highest-signal source - bug-fix commits and review comments are pre-validated teachable moments.
- Personalize with a user profile (Idea 2). Optional `.skilltrace/profile.json` fingerprint (strengths, gaps, goals) derived from the user's own commits/PRs (local-git-only by default) plus one-time onboarding. Used to bias snippet selection toward untouched-but-depended-on code, tune the Bloom level to the user's level, and skip code they demonstrably wrote.

## Core work area 2 - Review, grading, and history

Close the loop so the difficulty signal is honest, and capture everything for later reflection.

- Save all answers to history (Idea 3, capture phase). Always-on, offline, cheap. Every review event stores: card, concept/plane, typed answer text if present, confidence rating always, self-grade, timestamp. Storing everything now makes history rich before any judge exists.
- Support confidence-only reviews. Many users will rate confidence without typing. That is a first-class, low-friction mode - do not force typing.
- LLM answer grading (when a typed answer exists). Send {question, reference, user answer, snippet} to the model for a correct/partial/incorrect verdict + the specific gap. Turns a binary self-grade into a tutor response. Falls back to self-grade offline.
- Deterministic verification guardrails. Before saving any LLM-authored card: citation check (path + range real), grounding check (quoted snippet actually exists there), schema check, anti-trivia heuristic, dedup check. This is the repurposed deterministic code - validator, not author - and it is what makes an LLM-only pipeline trustworthy.
- History judgment (Idea 3, judgment phase). On-demand LLM analysis of accumulated history: confidence calibration, gap clustering, weekly digest, next-session recommendation. User-requested or scheduled, never mid-review.

## Core work area 3 - Knowledge representation

Make "what I know / what I don't / how it relates" honest and legible.

- Typed concept graph. Formalize the existing id-array relationships into 3 typed edges to start: is_a, prereq_of, relates_to. The Map surface labels edges by kind; the Workbench colors concepts by state.
- Ready/blocked/mastered state. Per concept: mastered (score >= threshold), ready (all prereqs mastered), blocked (a prereq is not). This is the clear-progress view. Reuse the acyclic check so a prereq cycle cannot deadlock it.
- FSRS scheduler. Replace the hardcoded 2/7-day probes with FSRS (via `ts-fsrs`, pure TypeScript, no native build). Adopt it for the principled model, not for a near-term review-count win (that gain needs accumulated history). Keep 2/7 as the cold-start path for a card's first reviews.
- Feed the honest signal upward. The LLM grade (area 2) sets the review outcome; the outcome drives FSRS; FSRS + prereqs drive the state; the state drives what the author works on next. One coherent loop.

## Core work area 4 - Delivery: plug into any coding agent (Idea 1)

The simplification and the bring-your-own-LLM story. Lead with a skill over the existing CLI; treat MCP as a later optional transport. (Full rationale in `PLATFORM_IDEAS_LOG_2026_07_01.md`, Idea 1.)

- Skill + CLI mode (primary now). Ship a coding-agent skill that teaches the host how/when to drive the existing CLI: the daily-review loop, when to generate cards, how to request history judgment. The host agent supplies the user's chosen LLM and its own grep/git/read tools. This reuses what we already ship with zero new runtime, is local-first, and rides progressive disclosure (the host loads only the skill's name + description until it is needed). This is the "plug-and-play for LLM coding platforms" surface.
- Standalone CLI mode (existing, preserved). Configurable OpenAI-compatible endpoint (cloud or local: Ollama/LM Studio/llama.cpp) + a minimal built-in tool set (ripgrep, read-range, local git). Keeps the standalone and local-first stories whole for users without a coding agent.
- MCP server mode (deferred, add when triggered). Expose the same learning layer as MCP tools (`generate_cards`, `next_review`, `grade_answer`, `record_confidence`, `progress_report`, `analyze_history`). Add this only when a non-skill client (ChatGPT, some IDEs) needs to call MergeLearn, when typed/versioned contracts become valuable, or when the interaction turns stateful multi-step. Not part of the near-term core work.
- One shared core, swappable surface. Scheduling, storage, graph, card model, prompts are identical regardless of surface. Only the LLM source and, later, the transport (CLI vs MCP) differ. Never duplicate what the host provides.

## Suggested sequence

Reach a testable core fast, then iterate on real cards.

1. LLM-only author + endpoint config (cloud/local). Tool still runs end to end. (~2d)
2. Rewrite the authoring prompt + gold exemplars. First real quality test point. (~3d)
3. Context tools for the author: grep, read-range, local git. (~3-4d)
4. History capture (all answers + confidence, always on) + LLM answer grading + verification guardrails. Closes the loop. (~4d)
5. Typed graph (3 edges + state) and FSRS scheduler. Honest progress + scheduling. (~1wk)
6. Skill + CLI delivery: ship the coding-agent skill over the existing CLI. Bring-your-own-agent, bring-your-own-LLM. (~3-4d)
7. User profile + history judgment. Personalization + metacognition. (~4-5d)

MCP server mode is deferred: add it only when a trigger from Core work area 4 appears (a non-skill client, typed/versioned contracts, or stateful multi-step interaction). It is not on the near-term path.

After step 4 the core loop is testable and trustworthy. Test on a real repo (the tool's own codebase first; a mid-size public repo second), judge the cards, tune prompt + exemplars (data, not code), then proceed.
