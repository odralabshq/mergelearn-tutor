# Card Quality Rules

MergeLearn Tutor should produce a small number of useful, answerable learning cards. Card quality matters more than card volume.

## Current rules

1. No evidence, no card.
2. Every generated card includes why it appeared.
3. Evidence is ranked before prompting:
   - source files are preferred over docs
   - test files are preferred for testing concepts
   - `package.json` is preferred for workflow/dependency concepts
   - README/docs are deprioritized unless there is no better evidence
4. Prompts must ask for a concrete explanation tied to one evidence path.
5. Expected focus terms must include both conceptual requirements and evidence paths.

## Current card fields

Learning items include:

- `conceptId`
- `type`
- `title`
- `bodyMarkdown`
- `prompt`
- `expectedFocus`
- `whyShown`
- `evidence`
- `difficulty`

## Dogfood result

Batch 4 dogfood on `/home/adam/mergeLearn` showed better prompts after evidence ranking.

Before ranking, the first security/testing prompts often pointed at README/docs.

After ranking:

```text
Prompt: Using src/core/guardConfig.ts, explain the access decision this change affects and one failure mode a test or guardrail should catch.
Prompt: Name the behavior changed near tests/cli/guardCli.test.ts, then describe the nearest test that should fail if that behavior regresses.
Prompt: Using src/action.ts, describe one valid input, one invalid input, and what should happen when parsing fails.
why_shown_missing 0
```

## Remaining work

1. Add line/hunk locations to evidence.
2. Add duplicate/noisy card detection.
3. Add a card-level manual rating store.
4. Use correction history in prompt generation.
5. Add interactive local review session.
