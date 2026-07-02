# Core Redesign - Card Generation

Date: 2026-07-01
Author: Claude Opus 4.8 (via kiro)
Status: design, not yet implemented
Parent: `../CORE_PLATFORM_PLAN_2026_07_01.md`
REFINED: see `05-review-and-refinements.md`. The MoA review reversed the "cite-don't-reproduce" rule and added SHA-pinning, a teachability filter, a cost budget, and a tolerant-JSON author fallback. Where this doc and 05 differ, 05 wins. Inline corrections marked [REFINED].

## Goal

The LLM is the sole card author. It gathers context with tools, then writes a card that is grounded in real code, targets an explicit cognitive level, and follows worked exemplars. This is where the most careful time goes (5-7 days).

## Current state (grounded)

- `src/core/questions.ts` holds the deterministic author with the filler prompt `Using ${path}, explain ${label} from the ${plane} perspective.`. This path is deleted.
- `src/core/llmClient.ts` already speaks OpenAI-compatible `chat/completions` with `response_format: json_object` and a `completeJson<T>()` method. It defaults to `gpt-4o-mini` and reads `OPENAI_API_KEY`/`OPENAI_BASE_URL`/`OPENAI_MODEL`. This is the client the author uses; it needs no rewrite, only a config surface (doc 04).
- `src/core/git.ts` already collects commits with full diffs (`collectCommits`, `--unified=40`). This is the git-evidence source the author reads.
- `LearningItem` (types.ts:107-131) is the output type. It already has `snippet`, `prompt`, `explanationMarkdown`, `expectedFocus`, `questionPlane`, `evidence`, `quality`. No schema change needed for basic authoring.
- The filler default lives at store.ts:66-72 (the `code:` and `explanationMarkdown` fallbacks). Once the LLM always authors these, the fallback text stays only as a defensive default.

## The authoring pipeline (new)

A new module `src/core/author.ts` owns card authoring. One function, `authorCards(state, target, ctx)`, runs three phases per requested card:

1. Gather context (tools, see below). Assemble a context bundle for the target concept/snippet.
2. Author (one LLM call). Send the structured prompt; receive strict JSON.
3. Verify (deterministic, doc 02). Reject/repair before the card is saved.

The old `questions.ts` two-stage draft-then-accept flow is gone; the author writes directly into `learningItems`, and verification is the gate.

## The context bundle

Before writing, the author collects (bounded, token-budgeted):

- The primary snippet: the code the card is about, with its file path and a one-line file role.
- One neighbor: the nearest caller or callee (from a grep for the symbol), so the card can ask relational questions.
- Git evidence when present: the commit subject + the relevant diff hunk from `collectCommits`. Bug-fix commits and review comments are the highest-signal teachable moments; surface them, let the model judge.
- The concept metadata: label, kind, difficulty, and the target plane's Bloom level.

Rule: the tool surfaces evidence; the LLM decides what is teachable. Do not pre-filter for "meaningfulness" deterministically - that was the old pipeline's mistake.

## Context tools (shared with doc 04)

Three read-only tools, each a thin wrapper the author (and, in hosted mode, the host agent) can call:

- `grepRepo(pattern, opts)` - ripgrep over the repo, returns path:line:match. For finding usages/neighbors.
- `readRange(path, start, end)` - exact line range. For pulling the snippet and its surroundings.
- `gitContext(path)` - wraps the existing `src/core/git.ts` (log/blame/show for a path).

In standalone CLI mode these run locally. In hosted mode (doc 04) the host agent's equivalent tools are used instead - the author logic is identical, only the tool source differs.

## The authoring prompt (the quality lever)

The prompt is structured, not a one-liner. Per card it carries five blocks, in this order:

1. Role framing. "You are a senior engineer writing a spaced-repetition card to teach a colleague this codebase." One sentence.
2. The material. The context bundle rendered as: the snippet (fenced, with path), the file's role, the one neighbor, and any git evidence. This is the grounding - the card must be answerable from this and nothing else.
3. The target. The named plane, its Bloom level, and one sentence stating what a correct answer must demonstrate. Example: "Plane: architecture_flow (Bloom: Analyze). A correct answer must trace how data moves from X to Y and name the boundary."
4. Exemplars. 6-8 hand-written gold cards for that plane (see below). Few-shot is the single measurable lever for cognitive-level adherence.
5. Constraints + output contract. Must cite the file; must be answerable from the material; prefer why / what-happens-if over what-is; no trivia. Then the strict JSON schema (via the existing `schemaHint` mechanism in `llmClient.ts`).

## Gold exemplars as data (not code)

Ship `src/core/exemplars/<plane>.json` - 6-8 hand-written cards per `QuestionPlane` (there are 6 planes at types.ts:14). Each exemplar is a full `{snippet, prompt, expectedAnswer, expectedFocus}` object drawn from this repo's own code.

- These are DATA. Tuning card quality means editing these files and re-running, not changing TypeScript. This is the cheapest quality win and the main thing to iterate during the test buffer.
- Store them per-plane so the prompt only loads the exemplars for the target plane (token economy).

## Output contract

The LLM returns JSON matching a `CardDraft` shape: `{ prompt, snippetPath, snippetStartLine, snippetEndLine, expectedAnswer, expectedFocus[], explanationMarkdown, planeConfidence }`. [REFINED by doc 05: cite AND store, pinned to a SHA.] The author resolves the line range to real code via `readRange`, then STORES that fetched text immutably on the card together with the path, range, and the commit SHA it was authored against. This preserves the anti-hallucination goal (text comes from a real fetch, never from the model) AND fixes commit drift (the shown text is frozen at a known SHA; a separate background check re-resolves the symbol at HEAD and flags staleness rather than silently showing shifted lines). This reverses the earlier "cite-don't-reproduce, fetch at review time" wording.

## Time breakdown (5-7 days)

- `author.ts` skeleton + context bundle assembly: 1.5 days.
- The three context tools (`grepRepo`, `readRange`, `gitContext`): 1 day (git already exists).
- Prompt template + schema + cite-don't-reproduce snippet resolution: 1.5 days.
- Gold exemplars for all 6 planes: 1 day (data authoring).
- Wiring, deleting `questions.ts`, tests: 1-2 days.