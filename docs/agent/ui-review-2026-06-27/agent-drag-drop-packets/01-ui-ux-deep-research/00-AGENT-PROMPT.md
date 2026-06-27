# Prompt: MergeLearn Tutor UI/UX Deep Research

You are a senior product designer, UX researcher, frontend architect, and learning-science-aware interaction designer.

## Task

Analyze the attached MergeLearn Tutor UI screenshots and context files. Produce a concrete, implementation-oriented redesign strategy for making the platform more intuitive, visually polished, and functionally useful.

## Product context

MergeLearn Tutor is a local-first repo-aware learning tutor. It turns repository evidence into active-recall cards, confidence calibration, delayed recall probes, progress signals, study/control assignments, and provenance graphs.

The current UI has useful capabilities, but it is spread across many equally weighted pages. The desired outcome is a clearer learning workbench with better navigation, better information hierarchy, and higher-quality interactive visualizations.

## Evidence to use

Use the attached screenshots and Markdown files as primary evidence. Pay special attention to:

- `contact-sheet.png`
- `screenshot-index.tsv`
- `page-functionality.md`
- `frontend-review-packet.md`
- all screenshots in `screenshots/`
- `00-current-state-brief.md`

## Research questions

1. What should the top-level product information architecture become?
2. Which pages should merge, become modes, or become setup/audit drawers?
3. What should the default Workbench/home experience be?
4. How should active recall, delayed probes, calibration, progress, and provenance be visually connected?
5. Which interaction patterns from products like Obsidian, GitLens, Anki, Linear, and Duolingo are worth borrowing or avoiding?
6. Which interactive visualizations are viable and useful, not decorative?
7. What is the safest dependency-ordered implementation sequence?

## Constraints

- Keep the product local-first.
- Do not add telemetry or remote calls.
- Do not overclaim learning efficacy without evaluation evidence.
- Prefer a smaller number of clearer surfaces over more pages.
- Prefer visualizations that explain user actions and evidence provenance.
- Keep recommendations implementable in a TypeScript/HTML/CSS app.

## Required output

Follow `04-report-template.md`. Include page-by-page critique, recommended IA, component proposals, visualization recommendations, implementation slices, risks, and acceptance criteria.
