# MergeLearn Tutor - Platform Ideas Log

Date: 2026-07-01
Status: durable idea capture - not all of these are scheduled; this is the "don't forget" record
Companion: `CORE_PLATFORM_PLAN_2026_07_01.md` (the focused near-term plan derived from these ideas)

This document records every design idea discussed for the platform so far, with enough detail to act on later. It is organized as: core direction, the three newest ideas, and the deferred backlog. The near-term plan lives in the companion file; this file is the full memory.

## Core direction (decided)

The platform is moving from a deterministic card pipeline to an LLM-at-the-core author. The deterministic code stops being the author and becomes (a) instruments the LLM uses to understand the repo and (b) guardrails that verify what the LLM produced.

- LLM-only card authoring. Drop the deterministic question author entirely; it produced generic filler. The LLM picks the snippet and writes the card.
- Local-first must not become cloud-only. Support user-chosen LLMs (see Idea 1). The privacy promise depends on this.
- Keep typed cards only for now. No cloze/MCQ/code-input yet; perfect the core loop first.
- Improved prompt is the biggest quality lever. Context + explicit Bloom-level target + few-shot exemplars.
- Highest-signal sources are git history and issues/PRs. Bug-fix commits and review comments are pre-validated teachable moments.
- Typed concept graph for knowledge representation. 3 edge types to start (is_a, prereq_of, relates_to) + ready/blocked/mastered state.
- FSRS scheduler to replace hardcoded 2/7-day intervals.
- Multi-language via tiered degradation, not per-language pipelines. Universal tools (LLM, grep, git) cover any repo; structural depth attenuates per file.
- Close the loop with LLM answer grading + deterministic verification guardrails.

Full reasoning for the above is in `/tmp/MLT_CORE_MECHANISM_DESIGN_2026_07_01.md` (research note, not in repo).

## Idea 1 - Plug into any coding agent (bring-your-own-LLM): skill-first, MCP later

The goal: let a user use any LLM they want, plug-and-play, by making MergeLearn plug into coding-agent platforms rather than shipping its own model integration.

Decision (updated 2026-07-01 after skills-vs-MCP research): lead with a SKILL wrapping the existing CLI. Treat MCP as an optional later layer, not the starting point. This reverses the earlier MCP-primary framing.

Why skill-first wins here (the research):
- Skills and MCP are not competitors - they answer different questions. A skill is procedural knowledge (teaches the agent HOW and WHEN: the review loop, when to generate, how to read output). MCP is a connection protocol (typed, callable actions over JSON-RPC). Anthropic explicitly frames skills as complementary to MCP - a skill can sit on top of and call an MCP server or a CLI.
- We already have a CLI. A skill that documents "run `mergelearn generate`, then `mergelearn today`, feed answers back like this" reuses what we already ship with zero new runtime. MCP would mean building and maintaining a JSON-RPC server for capability that already exists.
- Progressive disclosure. At startup the host agent loads only each skill's name + description (~30-100 tokens); the full body loads only when relevant. So we can ship several skills (generate, review, history-judgment) without bloating context. MCP tools traditionally load all-at-once, so more tools = more permanent context cost.
- Local-first match. Skills are local-first and file-based, matching MergeLearn's identity. MCP shines for standardization, versioning, and team sharing - not the current priority.
- Portability today. Any skill-supporting agent picks it up from a folder, no server lifecycle to manage.

The one tradeoff against skills: no central registry or easy versioned-update path (MCP has that). For a personal/local tool this is a non-issue today.

Context on MCP (still true, kept for the later decision): MCP is the de-facto universal plug for AI coding agents - supported by Claude Code, Cursor, Windsurf, VS Code, Cline, Continue, and OpenAI's Agents SDK. When MergeLearn eventually runs as an MCP server, the host supplies the LLM and its own grep/git/read tools, so MergeLearn exposes only the learning layer. That is worth doing later, for the reasons below.

When to add MCP (revisit triggers):
- A client that does not support skills (e.g. ChatGPT, some IDEs) needs to call MergeLearn.
- Strict typed schemas / versioned contracts for the actions become valuable.
- The interaction turns stateful and multi-step rather than "run a command, read output."

Two delivery modes, both over one shared core:
1. Skill + CLI mode (primary now). Ship a coding-agent skill that drives the existing CLI. The host agent supplies the user's chosen LLM. Bring your own agent, bring your own LLM, no MCP server to run.
2. Standalone CLI mode (existing). Configurable OpenAI-compatible endpoint (cloud or local: Ollama, LM Studio, llama.cpp) for users without a coding agent. Preserves the standalone and local-first story.

Design rule: the learning core (scheduling, storage, graph, card model) is identical regardless of surface. Only the LLM source and, later, the transport (CLI vs MCP) differ. Do not duplicate what the host agent already provides.

## Idea 2 - Build a user profile to personalize question generation

The goal: raise question quality by making the author aware of who the user is and what they already know, not just what the code says.

What we already have: progress is partially tracked (per-concept mastery, review events). That is the behavioral half of a learner model. The adaptive-learning literature (PMC9568945 "architectural learner model"; ScienceDirect S2666920X21000114 survey) frames a learner model around three questions: what to model, how to model it, how to use it. We already model performance; the opportunity is to model the person.

New signals worth capturing (LLM-derived, opt-in):
- From the user's own commits/PRs: what parts of the codebase they authored vs never touched, which languages/patterns they use fluently, what they tend to get wrong (reverted or fixed-forward commits). An LLM pass over `git log --author=<user>` can infer a rough skill fingerprint.
- From their review comments: topics they raise (tells you what they care about / know) vs topics others correct them on (tells you gaps).
- From explicit onboarding: a one-time "what do you want to learn / what's your level" prompt.

How to use it in the prompt (this is the payoff):
- Skip or lower-priority cards for code the user demonstrably authored and understands.
- Raise the Bloom level for areas of strength; keep it foundational for areas of weakness.
- Bias snippet selection toward code the user has NOT touched but depends on (the real knowledge gaps in a vibe-coded repo).
- Personalize framing: reference concepts the user already knows when explaining new ones.

Storage: a `.skilltrace/profile.json` - a compact, human-readable, user-editable fingerprint (strengths, gaps, goals, languages, preferences). Regenerated on request, never silently. Keep it small so it fits in the authoring prompt.

Caveat: privacy and consent. Analyzing the user's own commits is local-git-only and safe by default; anything touching remote PRs/issues is opt-in behind the network/consent gate. The profile is the user's data, stored locally, editable and deletable by them.

## Idea 3 - Save all answers to history; let an LLM judge later

The goal: capture every review interaction and let an LLM draw conclusions from the accumulated history - especially for users who only rate their confidence instead of typing an answer.

The reality to design for: many users will not type a full answer. They will look at the card, self-rate confidence ("knew it / shaky / blanked"), and move on. That is a legitimate, low-friction review mode. But a raw confidence number is a weak signal (LLM-as-judge and calibration research: verbal confidence is a real self-evaluation signal but poorly calibrated on its own). The fix is not to force typing - it is to capture everything and judge it in aggregate later.

The design (two-phase, decoupled):
1. Capture phase (always on, cheap, offline). Every review writes a full history event: the card, the plane/concept, whether the user typed an answer (and its text) or only gave a confidence rating, the confidence level, the self-grade, and the timestamp. This already partially exists (review events); extend it to always store answer text when present and confidence always. No LLM needed here - just faithful logging.
2. Judgment phase (on demand or user-requested). An LLM reads a slice of history and draws conclusions: where is the user over-confident (rated high, but spacing shows they keep forgetting)? Which concepts are shaky despite repeated review? What themes connect their weak areas? This is the metacognitive layer - the tool tells the user something they cannot see themselves.

Most straightforward and useful use cases for the judgment phase:
- Weekly review digest: "This week you were reliably strong on the auth flow, but you rated the caching layer high three times and still missed it each time - it is your biggest blind spot. Here are the two concepts to focus on."
- Confidence calibration check: compare stated confidence against actual retention over time and tell the user where their self-assessment is miscalibrated (the single most useful metacognitive feedback a spaced-repetition tool can give).
- Gap clustering: group weak concepts into themes ("your gaps cluster around async error handling") so the user sees a pattern, not 20 disconnected misses.
- Answer-quality trend (for users who type): judge whether typed answers are getting more precise over time on a concept, independent of the self-grade.
- Next-session recommendation: "Start tomorrow with these 3 cards" based on the history, not just the schedule.

Where it lives: this is a natural MCP tool / skill action (`analyze_history()` / `progress_report(depth=deep)`) and also a CLI command the user runs explicitly. It should be user-requested or scheduled, never forced mid-review - it is reflection, not part of the tight review loop. Because it operates on already-stored local history, it needs no new capture machinery once the history schema is complete - just the judgment prompt.

Why decoupling capture from judgment matters: capture must be cheap, always-on, and offline so no data is ever lost; judgment is expensive and LLM-dependent so it must be optional and on-demand. Storing everything now, even before the judge exists, means the history is already rich whenever the user first asks for analysis.

## Deferred backlog (captured, not scheduled)

These are agreed-good but explicitly out of scope for the near-term core work. Recorded so they are not lost.

- Additional card body types: cloze, multiple-choice, then interactive code-input (LeetCode-style). High value, but only after the typed-card core is excellent. Grade code cards by shelling out to the user's own toolchain, NOT an embedded sandbox (isolated-vm is in maintenance mode and imports a wrong threat model for a local single-user tool).
- Question-catalog templates as the offline author: parameterized templates aligned to the user's code by matching concept evidence, distilled from the best cards the LLM produces once there is usage data. The eventual pure-offline fallback. Phase 3+.
- Anki export (.txt first, .apkg only on demand): portability escape hatch, outside the core loop.
- Second-language depth analyzers beyond TypeScript: add a tree-sitter grammar + optional depth analyzer per language only when a real target repo needs it. The universal tier already works without them.
- Expanded concept graph (beyond 3 edge types): add edge types (part_of, targets, from_commit, etc.) when a feature actually needs them, not speculatively.

Priorities can change; this backlog is memory, not a commitment. The near-term plan in the companion file is what is actually scheduled.
