# Card Quality Rules

MergeLearn Tutor should produce a small number of useful, answerable learning cards. Card quality matters more than card volume.

## Snippet-first rule

Cards should start from code, not from an abstract concept label. The user should first see a bounded snippet from a real evidence path, then answer a question about what is happening there.

Every new card should include:

- snippet path and code
- question plane (`language_mechanics`, `local_behavior`, `file_role`, `architecture_flow`, `risk_and_tests`, or `repo_domain`)
- question tied to that snippet
- explanation that can be revealed if the learner gets stuck
- evidence path list for auditability

## Current rules

1. No evidence, no card.
2. No snippet, no useful card; path-only fallback is allowed only for legacy evidence.
3. Every generated card includes why it appeared.
4. Evidence is ranked before prompting:
   - source files are preferred over docs
   - test files are preferred for testing concepts
   - `package.json` is preferred for workflow/dependency concepts
   - README/docs are deprioritized unless there is no better evidence
5. Prompts must ask for a concrete explanation tied to one evidence path.
6. Expected focus terms must include both conceptual requirements and evidence paths.
7. Regenerating cards archives/supersedes old active cards; it must not delete answer history, ratings, or events.
8. Website snippets should render as diff-like blocks with visible line numbers and add/delete markers.
9. Snippet extraction should preserve compact unified diff context: hunk headers, additions, deletions, and nearby context lines.
10. Card-quality feedback such as `marked_bad_card` or `marked_wrong_evidence` must not reduce learner mastery; only wrong answers should.

## Current card fields

Learning items include:

- `conceptId`
- `type`
- `questionPlane`
- `title`
- `snippet`
- `bodyMarkdown`
- `prompt`
- `explanationMarkdown`
- `expectedFocus`
- `whyShown`
- `evidence`
- `difficulty`
- `status`
- `batchId`
- `generation`
- `source`

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
3. Use correction history and manual ratings in prompt generation.
4. Add richer end-of-session UX metrics.
