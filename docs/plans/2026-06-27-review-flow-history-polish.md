# Review Flow, History, and Design Polish Plan

## Read this first

This batch turns the local website from a polished card list into a complete review demo. The goal is still repo-aware tutoring, not a generic GitLens clone.

What should work by the end:

- Review cards use an active-recall flow: answer first, reveal explanation, self-grade.
- "Bad card" is card-quality feedback and does not reduce learner mastery.
- Snippets preserve compact unified diff context, including hunk headers and deletions.
- History pages show active/archived cards, batches, answers, and quality events.
- Progress and preferences share the same visual design as the main review page.
- Buttons visibly respond on hover/focus and the demo can be judged in a browser.

## Design principles

1. Every page must answer: what should I understand from my repo activity?
2. Card correctness and card quality are separate concepts.
3. History must preserve old cards and answer evidence instead of rewriting the past.
4. Keep dependency-light server-rendered HTML for this slice.
5. Use screenshots and browser interaction checks before calling the UI done.

## Elements to design and evaluate

### Review card

- Header: card index, question plane, difficulty, generation.
- Evidence: file path plus diff snippet.
- Prompt: primary active recall question.
- Answer area: disabled grading until answer/reveal.
- Reveal panel: explanation and expected focus.
- Grade actions: Knew it, Partly, Missed it, Bad card.
- Completed state: visible badge and softer card styling.

Acceptance:
- The learner cannot accidentally mark an empty hidden-answer card as correct.
- The card-quality path is visually distinct from wrong answer.

### History page

- Summary metrics: active cards, archived cards, batches, answers/events.
- Batch list: mode, created count, archived count, created at.
- Card table/cards: title, status, generation, source, last events.
- Per-card history details: answers and feedback events.

Acceptance:
- A user can see old generated cards and why/how they were superseded.

### Progress page

- Same hero/card/pill/button design as review page.
- Summary metrics and concept mastery bars.
- Raw progress remains available for transparency.

Acceptance:
- The page is scannable without reading a raw pre block first.

### Preferences page

- Same shell and button styling.
- Hover/focus states on all controls.
- Clear explanation of question planes.

Acceptance:
- It feels like product configuration, not debug HTML.

### Snippet extraction

- Keep compact unified diff snippets: @@ headers, + additions, - deletions, nearby context.
- Remove noisy git file headers where possible.
- Attach snippets to repo-domain/path-inferred concepts too.

Acceptance:
- A real root commit and a follow-up edit show actual diff context in tests.
