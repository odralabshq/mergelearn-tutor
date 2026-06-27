# 02 Research prompts

Use these prompts with independent research agents, manual research, or future autonomous runs. Give each agent `00-current-state-brief.md`, `01-source-packet.md`, screenshots, and the relevant source files.

## Prompt 1: Product strategy and feature pruning

You are a senior product strategist for developer tools and learning products.

Task:

Evaluate MergeLearn Tutor’s current product shape and recommend what should be kept, changed, renamed, consolidated, or removed.

Focus questions:

- Are Courses the right abstraction, or should the product use Plans, Tracks, Goals, or Focus Areas?
- Is the current page structure too broad?
- What is the clearest core workflow?
- What should be the primary habit loop?
- Which features risk distracting from the core value?

Output:

- Top 5 product recommendations.
- Rename/consolidation proposal.
- Features to keep, modify, pivot, remove.
- 2-week implementation roadmap.

## Prompt 2: Flashcard quality and learning science

You are a learning-science researcher and Anki-style flashcard expert.

Task:

Design a quality rubric for developer flashcards generated from git diffs, source files, docs, and accepted questions.

Focus questions:

- What makes a code flashcard answerable and useful?
- How should active recall, spaced repetition, interleaving, and feedback shape the product?
- What quality gates should run before a card enters review?
- How should user feedback improve future cards?
- What should be scored deterministically without remote LLMs?

Output:

- Card quality rubric.
- Question quality rubric.
- Bad-card taxonomy.
- Deterministic scoring proposal.
- Minimal data model additions.
- Test fixture examples.

## Prompt 3: Repo/source configuration and multi-repo workflow

You are a developer tooling architect.

Task:

Design the source configuration model for MergeLearn Tutor.

Focus questions:

- Should state remain per repo?
- Should there be a workspace-level repo index?
- How should a user target repos, languages, paths, docs, branches, or commit ranges?
- Should the product support multi-repo learning plans?
- How can it plug into git without surprising the user?

Output:

- Recommended architecture.
- Data model proposal.
- CLI commands.
- Browser UI proposal.
- Security/privacy risks.
- Migration path from current `.skilltrace/` state.

## Prompt 4: Professional UI and design system

You are a senior product designer for developer tools.

Task:

Turn the current screenshots into a professional, coherent app design direction.

Focus questions:

- What should the app shell look like?
- Which pages should be merged or renamed?
- What is the right visual density for review vs setup vs evidence audit?
- Which reusable components should exist?
- How should empty states and progressive disclosure work?

Output:

- App shell proposal.
- Page IA proposal.
- Design tokens.
- Component inventory.
- Two concrete mockup descriptions: Plan Builder and One-card Review.
- Visual risks in current screenshots.

## Prompt 5: Graph/timeline/evidence UX

You are an information-visualization and knowledge-graph product expert.

Task:

Evaluate the current Timeline and Graph pages and recommend the next graph/evidence features.

Focus questions:

- What user questions should the graph answer?
- What filters/focus modes are necessary?
- Should a graph library be added now or later?
- What node/edge model changes are needed?
- How should card/question provenance be displayed?

Output:

- Graph user tasks.
- Filter/focus mode proposal.
- Node detail drawer design.
- Data model gaps.
- Recommendation on whether to add Cytoscape/vis-network/D3 now.

## Prompt 6: Implementation synthesis

You are the implementation lead.

Task:

Read all research reports and select the best next 3 implementation slices for `autonomous-platform-polish`.

Constraints:

- Work in small reviewable commits.
- Do not push or merge to main.
- Keep local-first privacy.
- No remote LLM calls unless explicitly approved.
- Add tests and screenshot evidence.

Output:

- Decision matrix.
- Selected next slice.
- Rejected/deferred ideas and why.
- File-level implementation plan.
- Verification commands.
- Screenshot plan.
