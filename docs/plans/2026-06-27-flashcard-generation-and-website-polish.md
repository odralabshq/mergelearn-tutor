# Flashcard Generation and Website Polish Plan

## Read this first

Goal: make the website feel like a real local-first learning app, not a raw CLI dump.

Recommended shape:

- Add a card lifecycle: active cards, archived/superseded cards, and generation batches.
- Add `generate 5` and `regenerate 5` flows that preserve answer/history statistics.
- Render snippets as git-diff style blocks with line markers and addition/deletion colors.
- Redesign the website around a polished review workspace: hero, queue controls, stats, cards, progress, preferences.
- Keep everything local, dependency-light, and usable through CLI + JSON API + website.

## Product decisions made

1. Do not delete old flashcards. Archive/supersede them so historical answers and ratings remain auditable.
2. `generate more` adds new active cards without archiving current active cards.
3. `regenerate` archives current active cards and creates a new focused batch.
4. Card generation should pick due/weak/high-importance concepts and rotate question planes, not randomize blindly.
5. The website can use custom HTML/CSS diff rendering now; a frontend diff package is not worth adding before a build pipeline exists.

## Implementation slices

### Slice 1: card lifecycle

- Extend `LearningItem` with `status`, `batchId`, `generation`, `source`, `archivedAt`, `supersededBy`.
- Add `CardBatch` to state.
- Normalize old states as active cards.
- Add helpers for active cards and generation summaries.

### Slice 2: generate/regenerate

- Add core `generateCardBatch(state, preferences, { count, mode })`.
- Add CLI: `cards generate --count 5 --mode more|regenerate`.
- Add API: `POST /api/cards/generate`.
- Add website buttons.

### Slice 3: diff rendering

- Add `src/core/diffView.ts`.
- Render `+`, `-`, and context lines with separate classes.
- Use it in session UI and dashboard.
- Keep CLI output text-based.

### Slice 4: website polish

- Redesign review page visually.
- Add queue stats, batch metadata, sticky nav, stronger card hierarchy.
- Screenshot-review at least two iterations.

### Slice 5: golden features

Implement only high-value local features:

- Card queue controls.
- Session summary panel.
- Better preferences entrypoint.
- Progress preview on review page.
