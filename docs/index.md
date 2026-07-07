---
type: index
title: "MergeLearn Tutor Documentation"
description: "Open Knowledge Format bundle index for MergeLearn Tutor: product guides, references, and core design docs."
resource: docs/index.md
tags: [index, okf, documentation]
timestamp: 2026-07-02
---

# MergeLearn Tutor Documentation

This documentation bundle follows the Open Knowledge Format (OKF v0.1): a directory of
markdown files, each carrying YAML frontmatter (`type`, `title`, `description`, `resource`,
`tags`, `timestamp`). Readable in any editor, renderable on GitHub, indexable by any tool.

## Guides

- [User Manual](USER_MANUAL.md) - install, generate cards, run review sessions.
- [Review Session](REVIEW_SESSION.md) - the daily review flow.
- [Customization](CUSTOMIZATION.md) - configure planes, catalogs, generation.

## Reference

- [Privacy Model](PRIVACY.md) - local-first data guarantees.
- [Card Quality](CARD_QUALITY.md) - what defines a good flashcard.
- [Analyzers](ANALYZERS.md) - concept and evidence extraction.
- [Enrichment](ENRICHMENT.md) - concept metadata enrichment.
- [Corrections](CORRECTIONS.md) - suppress and pin cards.
- [Evaluation](EVALUATION.md) - how generation and outcomes are measured.
- [Lexicon](LEXICON.md) - shared vocabulary.
- [Roadmap](ROADMAP.md) - planned direction.

## Simplified platform (2026-07 redesign)

The **north-star** design after the 2026-07 simplification pivot: a model-free
local library + FSRS review shell, agent-authored learning sets, Quizlet-style
sets/folders/tags, a single agent-maintained tag taxonomy (no separate concept
graph), self-contained card backs, and a two-tab UI. The tutor authors nothing
and analyzes no code. Supersedes the LLM-sole-author direction below where they
conflict.

- **[Redesign Overview](design/redesign-2026-07/00-OVERVIEW.md)** — **Start here for the target.** North-star + the eight locked decisions.
- [Object Model](design/redesign-2026-07/01-OBJECT-MODEL.md) - CardSet/Card/CardBack/CardTag (taxonomy)/ReviewSession + exact old→new mapping.
- [Storage & Migration](design/redesign-2026-07/02-STORAGE-AND-MIGRATION.md) - `~/.mergelearn/` folder-per-set layout + clean-slate cutover.
- [Card Pipeline](design/redesign-2026-07/03-CARD-PIPELINE.md) - the AgentSetPatch authoring handshake; deterministic validation + freeze.
- [UI & UX](design/redesign-2026-07/04-UI-AND-UX.md) - two-tab IA, onboarding, honest progress, profile.
- [What Gets Deleted](design/redesign-2026-07/05-WHAT-GETS-DELETED.md) - the concrete surface-area reduction.

## Core design (2026-07-01)

The as-built design for the LLM-sole-author core. Reflects the current code
(main); superseded as a *direction* by the 2026-07 redesign above.

- **[Architecture](design/ARCHITECTURE.md)** — **Start here for what exists.** The platform as built: state model, provenancing pipeline, card creation paths, module map, CLI surface, and evaluation findings. Cross-referenced to real source files.
- [Core Platform Plan](design/CORE_PLATFORM_PLAN_2026_07_01.md) - near-term plan.
- [Platform Ideas Log](design/PLATFORM_IDEAS_LOG_2026_07_01.md) - ideas and backlog.
- [Design Set](design/design-core-2026-07-01/00-overview-and-simplification.md) - the six-doc set (00-05), overview through MoA review.
- [Session Handoff (2026-07-04)](agent/HANDOFF_2026-07-04.md) - what shipped: S10-S12 + platform evaluation.
