---
name: mergelearn-authoring
description: >-
  Author MergeLearn Tutor flashcards with a capable coding agent instead of a
  small local model. Use when the user wants to generate learning cards for a
  repo using their own agent (Claude, GPT, etc.). The agent picks teachable code
  ranges and writes card drafts; the tutor freezes the real snippet from disk,
  verifies format, optionally answer-key-checks, and schedules survivors. This
  replaces the local-model author the platform evaluation found to be the
  quality bottleneck (semantic correctness failed ~44% of the time).
---

# Authoring MergeLearn cards with a coding agent

You (the coding agent) are the AUTHOR. The tutor still owns provenance and
gating: it re-fetches every cited snippet from disk (your snippet text is never
trusted), runs deterministic format checks, and stages only cards that pass. Your
job is to pick strong targets and write correct drafts.

## The one rule that determines quality

CITE LINE NUMBERS EXACTLY. The tutor freezes whatever `startLine`-`endLine` you
cite and pins it to HEAD. If your line numbers are off, the card asks about code
X while showing code Y, and with no oracle running that mismatch ships silently.
Open the file, count the lines, verify the range contains the code your question
is about. This is the single most common failure.

## Workflow

1. Pick targets. Read the repo. Choose 5-15 code ranges worth learning.
2. Write drafts to a JSON file (array of the schema below).
3. Import: `mergelearn-tutor cards import --repo <path> --file drafts.json`
   Add `--oracle` only if a usable LLM endpoint is configured (see below).
4. Report the import summary. Cards in `needs_review` were rejected - fix and
   re-import, or drop them.

## Draft schema (each array element)

```json
{
  "conceptLabel": "short human label, e.g. 'Queue.dequeue FIFO semantics'",
  "plane": "local_behavior",
  "path": "src/queue.ts",
  "startLine": 6,
  "endLine": 8,
  "prompt": "A real question ending in '?' - must NOT contain its own answer.",
  "expectedAnswer": "The correct answer, derivable from the cited snippet alone.",
  "expectedFocus": ["key", "terms", "a", "good", "answer", "hits"],
  "explanationMarkdown": "optional deeper explanation shown after reveal",
  "planeConfidence": 0.8
}
```

## Choosing the plane (biggest quality lever)

The evaluation showed target/plane choice moves quality ~1.7 points - roughly 5x
the effect of model size. Prefer planes that sit on real logic:

- `architecture_flow` (best, ~4.4 avg): how a function fits the larger flow,
  what calls it, what it enables. Cite a function body with real behavior.
- `local_behavior` (~3.6): what this code does when run, edge cases, return
  values. Cite the executable lines, not the signature.
- `risk_and_tests`: what breaks this, what a test must cover.
- `file_role` / `repo_domain`: what this file/module is responsible for.
- `language_mechanics` (weakest, ~2.7): reserve for genuinely subtle syntax.
  Do NOT point it at a bare getter or an import - that yields trivia.

Avoid citing comment blocks, import lists, closing braces, or bare type
signatures. They score 1.6-2.4 because there is nothing to reason about.

## What the tutor rejects (so don't do it)

- Prompt with no `?` -> `format:not_a_question`.
- Prompt that contains the answer verbatim -> `format:trivia`.
- Empty prompt / answer / focus / snippet -> `format:empty_*`.
- Answer the snippet does not support -> caught by `--oracle` (if enabled) as
  `answer_key:disagree`; without an oracle it is your responsibility.
- A range that is mostly comments, imports, or lone braces -> `teachability:low_signal`.
  This is a deterministic content gate (runs with or without an oracle): a cited
  range must be at least ~1/3 substantive code lines. Cite executable logic, not
  header comments or import blocks. This directly enforces the plane guidance above.

## Answer-key oracle (optional, recommended when available)

The oracle blind-derives an answer from the snippet in a SEPARATE context and
checks it against yours. It needs a usable endpoint:

- Local: run an OpenAI-compatible server and leave defaults (127.0.0.1:11434).
- Cloud: set `OPENAI_BASE_URL`, `OPENAI_MODEL`, `OPENAI_API_KEY`, and
  `MERGELEARN_ALLOW_CLOUD=1` (consent: authoring sends snippets to the endpoint).

With no oracle, `cards import` still runs and prints an honest NOTE that answer
truth was not independently checked. It never fakes a verdict.

## Pitfalls

- Off-by-one line ranges are the #1 defect. Re-read the file and count.
- One concept per card. If a range needs two questions, cite it twice with
  different planes.
- Re-importing the same range is idempotent on concepts (no duplicates), but
  makes a fresh card each run - regenerate deliberately, not by accident.
