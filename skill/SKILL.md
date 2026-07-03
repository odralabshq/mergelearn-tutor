---
name: mergelearn-tutor
description: >-
  Drive MergeLearn Tutor, a local-first repo-aware spaced-repetition tutor that
  turns a codebase and its git history into daily learning cards. Use when the
  user wants to learn/onboard onto a TypeScript (or any git) repository, review
  what changed, or practise recalling how the code works. All processing is
  local; the tool never sends code anywhere unless the user explicitly enables
  and consents to a network provider.
---

# MergeLearn Tutor

MergeLearn Tutor builds a personal skill graph from a repo's commits and serves
short daily review sessions. State lives in `.skilltrace/state.json` inside the
target repo and is fully inspectable.

## The one rule that matters

When you drive this tool, the tool is the oracle. Do NOT substitute your own
behaviour for its built-in pipeline:

- Do NOT grep/read the repo yourself to answer a card, then mark it right. The
  tutor grades against the pinned code snippet (code-as-oracle) - let it.
- Do NOT judge the learner's answer with your own model. Use `answer` /
  `feedback` and let the tutor's grading and answer-key validation decide.
- Do NOT hand-edit `.skilltrace/state.json`. Every change goes through a command
  so provenance, scheduling, and the audit trail stay intact.

Your job is to run the right commands, surface their output, and explain the
code the tutor points at - not to replace its grading or verification.

## Invocation

Run via the built binary (`mergelearn-tutor`) or, in this repo, `npm run cli --`.
Every command takes `-r, --repo <path>` (defaults to the current directory).
All commands are read-only unless they clearly mutate state (init/ingest/answer/
feedback/cards generate).

## First-run workflow

1. `mergelearn-tutor init --repo <path> --goals "understand this repo,learn TypeScript"`
   Creates `.skilltrace/state.json` (a transparent local profile).
2. `mergelearn-tutor ingest --repo <path> --since 30d --limit 80`
   Reads recent commits and builds the skill graph. Re-run to pick up new work.
3. `mergelearn-tutor today --repo <path>`
   The 3-5 minute session: what to review now.

## Daily loop

- `today` - the short session. `review -n 5` - fuller cards with evidence.
- `answer --item <id> --answer "<plain English>"` - record an explain-back.
  Add `--correct` only if you are recording a self-mark; prefer letting grading
  decide. Never mark correctness from your own repo inspection.
- `feedback --item <id> --event marked_useful|marked_bad_card|marked_wrong_evidence`
  - signal card quality. This is how the deck improves; use it liberally.

## Inspect & explain

- `profile` - the skill ledger. `debt` - weak-but-important concepts.
- `progress` - progress by concept. `map` - a Mermaid graph.
- `explain-last-commit` - concepts touched by the latest commit.
- `dashboard` - writes a static local HTML dashboard.
- `session --port 0` - a local interactive review server (stable local URL).

## Privacy (local-first, always)

Processing is offline by default. Before any optional enrichment:
- `privacy init` writes an offline-by-default config.
- `privacy preview` shows EXACTLY what a provider would receive and sends nothing.
Only enable a network provider after the user explicitly consents. When unsure,
stay offline and say so.

## Pitfalls

- No cards? You probably skipped `ingest`, or `--since` is too narrow - widen it.
- A wrong/confusing card is a signal, not a failure: record `feedback`, move on.
- State is per-repo under `.skilltrace/`; running from the wrong `--repo` looks
  like "lost progress" but is just the wrong directory.
