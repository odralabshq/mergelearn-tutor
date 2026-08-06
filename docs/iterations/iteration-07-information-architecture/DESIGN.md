---
type: design
title: "Iteration 07: Home, Library, and Practice Information Architecture"
description: "Target design for a task-oriented Home, object-oriented Library, and truthful Practice hub."
resource: docs/iterations/iteration-07-information-architecture/DESIGN.md
tags: [iteration, information-architecture, frontend, design]
timestamp: 2026-08-06
---

# Iteration 07 Design: Home, Library, and Practice

## Status and grounding

This is the target design. The current UI mixes objects, activities, and administration across Home, Practice, Prepare, and Manage. Home renders the full lesson collection and due review. Manage combines temporary practice scope with card search and mutation. Prepare combines retrieval evidence and external references. Practice is both a navigation destination and an immediately started session.

The redesign preserves the local server, server-rendered routes, current session and card mutation contracts, exact Set and card deep links, URL-driven filters, and browser recovery behavior. It adds no framework, account, sync service, readiness score, recommendation algorithm, saved search, or new durable entity.

## Research and review grounding

- Anki separates its deck and study entry from Browse, where cards and notes are searched and edited: https://docs.ankiweb.net/studying.html and https://docs.ankiweb.net/browsing.html
- RemNote describes Flashcard Home as the central location for progress and study prioritization: https://help.remnote.com/en/articles/7925835-the-flashcard-home
- The first Opus 5 consultation returned `MODIFY`: support separating activities from objects, reject two competing next-action dashboards, and keep graded Review visibly distinct from ungraded work.
- Source adjudication rejects Opus's proposed Settings destination. Existing folder and tag practice scope is temporary browser-local launch state, not a durable global preference. Calling it Settings would overstate its persistence.

## Core model

Each primary destination answers one question:

1. **Home:** What should I do next?
2. **Library:** What lessons and cards do I have?
3. **Practice:** How do I want to practise?

The top navigation is exactly `Home`, `Library`, and `Practice`. An active session is a focused state under Practice, not a fourth navigation concept.

## Home

Home is a compact dashboard, not the complete lesson catalogue. It renders these blocks in order:

1. **Review due:** due count, sitting count, backlog, and the only visually primary action. Copy states that completing review updates scheduling.
2. **In progress:** at most one in-progress lesson, ordered by Set id using code-unit comparison. If none is in progress, show a link to the lesson Library instead of manufacturing a recommendation.
3. **Needs attention:** at most three cards from the same weak-card projection and ordering used by Strengthen, plus a link to the full view. Copy states that opening these cards does not grade or change scheduling.
4. **Browse:** a GET card-search form targeting `/library/cards` and a link to all lessons.

When no cards are due, Review due is a caught-up status with no launch action. When scope enhancement is available, Home shows the active Review scope beside its counts and provides `Clear scope`; the displayed counts and launch both use that same scope.

Home does not render every lesson, rank lessons by an invented relevance score, or show external references as recommendations.

## Library

`/library` is the complete lesson collection. Every lesson row shows objective, progress, due count, and actions to open the lesson or view its cards.

`/library/cards` is card search and administration. It preserves text, Set, tag, learning-state, archived-state, pagination, copy-reference, edit, archive, restore, draft recovery, and snapshot-mismatch behavior. Search is visible at the top. Filters use a disclosure at narrow widths and active result counts remain textual.

The label `Manage` disappears from navigation and headings. Card administration remains available in Library because it operates on content objects. Temporary review scope does not live here.

## Practice

`/practice` is a mode-selection hub. It presents three unequal choices:

- **Review due:** primary and graded. Starts `/practice/session`; grading updates FSRS and review history.
- **Strengthen weak areas:** secondary and ungraded. Opens `/practice/strengthen`; exact-card links open Set detail without grading.
- **External problems:** secondary and ungraded. Opens `/practice/external`; safe links leave MergeLearn and no result is recorded.

When no cards are due, the Review card is a caught-up status with no launch action.

A `Review a selection` disclosure on the hub owns temporary folder and tag scope. JavaScript injects these controls only when browser-local persistence and scoped preview are available. Without JavaScript, the hub offers an ordinary unscoped Review link and no apparently operable scope controls.

The active scope applies to every scheduled Review launch, including Home and the Practice hub. Both enhanced launch surfaces show the same scope summary and counts and provide `Clear scope`. Scope remains browser-local, affects only Review membership, and does not archive or mutate cards.

`/practice/session` is the focused active runner. It keeps current answer, reveal, grade, undo, end, replay, draft, and writer-ownership contracts. A resumable session is unfinished. Ending or completing it clears resumability. If a resumable session exists, it always wins over a new or legacy launch intent: the runner resumes it, visibly explains that the requested launch was not started, and never replaces its answers, undo state, draft, or writer claim. A new session is created only when no resumable session exists.

Legacy `set` launches are explicit one-Set intents and ignore browser-local scope. Scope governs only Review launches from Home and the Practice hub. The runner requires JavaScript; every launch link states this visibly when scripting is unavailable.

The top navigation remains available with at least 4.5:1 text contrast; `End session` stays in the runner. Navigation is not dimmed using opacity alone.

## Routes and compatibility

Canonical routes:

- `/` for Home
- `/library` for lessons
- `/library/cards` for card search and administration
- `/practice` for mode selection and temporary Review scope
- `/practice/session` for the active graded runner
- `/practice/strengthen` for weak-card evidence
- `/practice/external` for author-supplied problem references
- `/set/:id` for lesson detail and exact card anchors

Compatibility routes use HTTP 302 and never redirect more than once:

- `/manage` redirects to `/library/cards` with the raw query string preserved. If legacy scope-only values are present, Library Cards states that Review scope moved to Practice.
- `/prepare` with one or more `source` values and no `set` or `tag` redirects to `/practice/external` with the raw query string preserved.
- Other `/prepare` requests redirect to `/practice/strengthen` with the raw query string preserved. If `source` is also present, Strengthen visibly states that source was not applied and links to External with the same raw query.
- `/practice?mode=lesson&set=...` and `/practice?set=...` redirect to `/practice/session` with the raw query string preserved. These are the only legacy launch predicates the product emits.
- `/practice` with unknown or unrelated query parameters renders the hub and ignores those parameters. It never starts a graded session merely because a query exists. Known incomplete launch keys such as `mode` or `tag` produce a visible ignored-intent notice.

No permanent redirect, client router, or query rename is introduced. Existing API routes and payloads are unchanged.

Route-to-navigation mapping is explicit: `/` maps to Home; `/library`, `/library/cards`, and `/set/:id` map to Library; `/practice` and every `/practice/*` route map to Practice. Exact destination matches use `aria-current="page"`; descendant routes use `aria-current="true"`. Exactly one top-level link is current.

## Responsive and accessible behavior

- The three navigation labels remain visible at 375 px; no hamburger menu is added.
- Dashboard and mode cards collapse to one column.
- Library exposes `Lessons` and `Cards` as ordinary links with `aria-current`, not JavaScript-only tabs.
- Card filters use a native disclosure on narrow screens and remain usable without JavaScript for initial query submission.
- Graded and ungraded behavior is expressed in visible text, not color alone.
- Focus moves to result status after filter submission or pagination errors.
- Interactive targets are at least 44 px high on narrow screens.

## Decisions and non-goals

- D1: Home and Practice have different roles. Home prioritizes concrete next actions; Practice explains and launches practice modes.
- D2: Scheduled Review is the only graded practice mode and always states that it updates scheduling.
- D3: Strengthen and External are separate views under Practice because their evidence, filters, and actions differ. Both always state that they do not grade, schedule, or assert readiness.
- D4: Library separates Lessons and Cards by route. It does not mix both object types in one result list.
- D5: Temporary Review scope remains browser-local and launch-time. No Settings page or durable preference is added.
- D6: Home uses only persisted facts. It does not infer recency, recommendation priority, readiness, or likely interview relevance.
- D7: Existing mutation and recovery interfaces stay unchanged. The redesign moves presentation and route entry points only.
- D8: Existing deep links remain usable through one temporary redirect with query preservation.

Non-goals include saved filters, session history, recommendation scores, full-text lesson search, global settings, archive confirmation redesign, persistent sidebar navigation, client-side routing, and visual-framework migration.

## Acceptance criteria

1. Top navigation exposes exactly Home, Library, and Practice with correct `aria-current` behavior on canonical and detail routes.
2. Home shows one Review action, at most one in-progress lesson, at most three weak cards, and no complete lesson catalogue.
3. Library Lessons exposes every lesson. Library Cards preserves complete paged card search and all existing card actions.
4. Practice visibly distinguishes graded Review from ungraded Strengthen and External before launch.
5. Compatibility routes return exactly one HTTP 302 before a 200 destination. Raw repeated and percent-encoded query values survive, while unknown Practice queries remain on the hub and never launch Review.
6. The same active scope summary, scoped due count, and clear control appear on enhanced Home and Practice. Both launch the same scoped Review membership. Without JavaScript, neither surface shows scope controls and Review is explicitly unscoped.
7. A resumable session always wins over a new launch intent. Opening a legacy launch link cannot replace its answers, draft, undo state, or writer ownership.
8. Viewing Home, Library, Cards, Strengthen, or External leaves card rows, FSRS state, and review history byte-identical.
9. Existing Set detail anchors, external-link validation, draft recovery, writer ownership, session replay, undo, end, and restart behavior remain intact.
10. Desktop and 375 px layouts expose all primary actions without horizontal scrolling or clipped navigation; narrow interactive targets are at least 44 px.
11. Pages remain meaningful without JavaScript. Progressive enhancement is required only for existing card mutations, live scoped counts, local scope persistence, and the active session runner.
12. Focus, labels, result counts, route-level `aria-current`, and graded or ungraded semantics are testable through rendered HTML and a built-browser journey.
