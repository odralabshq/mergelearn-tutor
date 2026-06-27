# Agent matrix

## Required agent

Agent: UI/UX deep research agent
Recommended model: GPT Deep Research or equivalent deep web/product research model
Prompt: `prompts/01-ui-ux-deep-research.md`
Output file: `outputs/01-ui-ux-deep-research-report.md`

## Optional follow-up agent

Agent: implementation feasibility reviewer
Recommended model: GPT-5.5 or Opus-class coding/review model
Purpose: turn the UI research report into a dependency-ordered implementation plan for this TypeScript repo.
Output file: `outputs/02-implementation-feasibility-review.md`

## Why only one required deep research agent

The immediate blocker was that the packet lacked the launch prompt. One high-quality UI/UX research run is the fastest useful next step. A second implementation review is useful only after the first report exists.
