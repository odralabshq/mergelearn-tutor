---
title: "MergeLearn Tutor — UI & UX (2026-07 Redesign)"
description: "Two-tab information architecture (Home + Practice) with sets, folders, and tags as first-class navigation. Agent-commissioned onboarding with an honest authoring state, never-0% honest progress, soft non-punitive streaks, and a calm profile that feeds the agent's weak-card review."
resource: docs/design/redesign-2026-07/04-UI-AND-UX.md
tags: [architecture, ui, ux, onboarding, redesign]
updated: 2026-07-07
status: design
---

# UI & UX

The current surface exposes today, review, serve, a concept map, a dashboard,
and several research/legacy views. The redesign collapses this to **two tabs**
plus a short onboarding, adapting the research's Duolingo/Quizlet patterns to a
personal, self-directed developer tool.

---

## 1. Two-tab information architecture

Everything lives in **Home** or **Practice**. The concept map, audit views,
setup subtabs, study-harness, and ratings screens are dropped. Navigation is
by **set, folder, and tag** — the three organizing structures from doc 01.

### Home
- **Due overview + Resume** — count of cards due, one-click resume of the last
  session. The primary next action.
- **Library** — browse by folder tree, set, or tag. Each set shows an honest
  progress indicator (sec 3). This is where sets/folders/tags are first-class.
- **Profile snippet** — calm summary: sets, cards, FSRS mastery bands,
  weak-area insights. Links to the full profile.
- **(Optional) activity heatmap** — 30-day practice calendar, not a fragile
  streak counter.

### Practice
1. Session config (pre-filled if launched from Home): recommended session, a
   chosen set/folder, or a tag-filtered mix. Default = recommended.
2. Review loop: single card -> reveal short answer -> reveal full explanation
   -> self-grade (Again/Hard/Good/Easy, mapped to FSRS). Minimal chrome, a
   small "3 / 10" progress bar.
3. Session summary: cards reviewed, rating spread, weak cards flagged, gentle
   next actions ("refine weak cards", "author more for this set"). No guilt copy.

The two-step reveal (short answer, then full explanation) mirrors the
`CardBack` layers in doc 01: answer the question, then understand it deeply.

---

## 2. Onboarding — commission a full set, don't generate

MergeLearn authors nothing, so onboarding **commissions** a complete set from
the connected agent (doc 03). Flow:

1. 3-4 questions with smart defaults:
   - Source? (This repo [default] / Another repo / No repo — just a topic)
   - Focus? (Architecture tour [default] / Recent changes / Risky paths /
     Custom — or, for a topic, a free-text subject like "TypeScript generics")
   - Depth? (Starter ~8 [default] / Standard ~20 / Deep ~40)
   - (Optional) name the set.
2. The tutor builds an `AuthoringContext` (goal + optional repo + existing
   taxonomy) and hands it to the agent. The agent returns one `AgentSetPatch`.
3. **Honest "authoring your set..." state** while the agent works. No instant-
   value promise and no pre-baked demo set in v1 (future maybe).
4. On import + validation, drop the user into the first card of their new set.
5. Invite a small edit — rename the set, tweak a tag (ownership effect).

The "No repo — just a topic" option is what makes conceptual learning
first-class: onboarding does not assume a codebase.

---

## 3. Honest progress (never fake)

- **Never show 0%.** Use earned milestone markers ("first set created", "first
  session done"), not synthetic percentages.
- Progress bars map to real completed sessions/cards only. The goal-gradient
  effect is used honestly; no fabricated head-start.

---

## 4. Streaks & gamification — soft, optional, non-punitive

- Default surface is an **activity heatmap** ("days practiced in last 30"), not
  a breakable streak number.
- An optional streak may live in the profile, never on the Home header, and a
  missed day resets quietly.
- **No loss-aversion framing.** No "you'll lose your streak", no guilt visuals —
  for a personal tool these drive abandonment. A deliberate override of the
  generic UX "loss aversion" principle.
- Encouraging microcopy: "Nice to see you back — pick up where you left off."

---

## 5. Profile — calm reflection + substrate for agent review

The profile is both a human-facing summary and the structured history the
agent reads to refine weak cards.

**Shows:**
- Learning summary: active sets, total cards, FSRS mastery bands
  (Stable / Learning / New), folder/repo coverage.
- Activity: days practiced (30/90), last N sessions.
- **Weak-area insights by tag and folder** — the tag taxonomy is the rollup
  axis (doc 01 sec 4). "You struggle with `error-handling` and
  `typescript/types/narrowing`" is more actionable than a card list, and it
  maps directly to what the agent can target.

**Feeds the agent:** the per-session review history (doc 01 sec 7) lets the
connected agent identify consistently-failed cards, propose edits or
replacements, and retire over-easy cards — the "LLM review of card history"
capability, now performed by the user's own agent, not a bundled model. It is
delivered as a follow-up `AgentSetPatch` (updating existing cards by id).

---

## 6. Applying the six UX-psychology principles

| Principle | Verdict | How |
|---|---|---|
| Smart defaults | Strong yes | this repo, architecture focus, 8-card starter, pre-filled set name |
| Goal gradient | Yes, honestly | never-0%, milestone-based real progress |
| Reciprocity | Strong yes | a commissioned set + useful profile insights before asking for effort |
| IKEA / endowment | Yes, gently | user names/tweaks the set after the first session |
| Loss aversion | Mostly skip | factual warnings only ("deleting loses review history"); no guilt |
| Contrast | Partial | session-size/time comparisons for prioritization, never upsell |
