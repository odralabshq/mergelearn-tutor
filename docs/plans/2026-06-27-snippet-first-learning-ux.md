# Snippet-First Learning UX Implementation Plan

> For Hermes: implement this directly in small dependency-safe slices, then verify and dogfood locally.

## Read this first

The current platform asks mostly concept-level questions like “Explain auth boundary.” The user wants the loop inverted: first show real snippets from code they worked on, then ask what is happening there, offer an explanation on demand, and sometimes ask related questions at different abstraction planes.

Recommended v1 shape:

- Every learning card becomes snippet-first: code evidence, file path, concept, then the question.
- Questions use a configurable plane taxonomy: syntax/language, function behavior, file role, architecture flow, testing/risk, and repo domain.
- Configuration lives in `.skilltrace/preferences.json`; CLI, local website, onboarding questions, and future LLM agents all use the same file and JSON endpoints.
- The website adds a Progress Map screen with hierarchy plus graph data, not just a raw Mermaid block.
- Keep the implementation local-first and dependency-light. Use simple HTML/SVG now; add a graph library later only if interaction needs exceed this.

This is a good product direction. It makes MergeLearn less like a quiz about labels and more like a personal code reading tutor. The main risk is overbuilding a graph UI before the snippet review loop feels right, so the first slice prioritizes card quality and API consistency.

## Research summary

External search found three useful patterns:

1. Programming education research repeatedly supports worked examples, code tracing, and active exploration of examples. For this product, that means the code snippet should be the primary object, not hidden behind an evidence dropdown.
2. Bloom-style CS assessment suggests questions should span recall, comprehension, application, analysis, and evaluation. For MergeLearn, those map cleanly to snippet planes rather than generic difficulty levels.
3. Cytoscape.js is a strong browser graph visualization option, but for v1 this repo has no frontend build pipeline and is local-first/offline. A static hierarchy plus SVG/JSON graph is cheaper and testable; Cytoscape can be added later behind the same graph JSON.

## Product model

A learning item should answer five questions in this order:

1. What code am I looking at?
2. What question am I answering about this code?
3. What plane is this question on?
4. What explanation can I reveal if I get stuck?
5. Can I quickly tune which kinds of questions I want next?

The card should not start with “you recently touched X.” It should start with a real snippet.

## Question planes

Use these v1 planes:

| Plane | Purpose | Example prompt |
|---|---|---|
| `language_mechanics` | Teach syntax, type system, runtime semantics | “What does this union type allow and reject?” |
| `local_behavior` | Understand what a function/block does | “What happens when `session` is undefined?” |
| `file_role` | Place the snippet inside the file/module | “What responsibility does this file have?” |
| `architecture_flow` | Trace how this code connects to other files | “What calls this boundary, and what depends on its result?” |
| `risk_and_tests` | Identify bugs, security, validation, regressions | “What test should fail if this behavior regresses?” |
| `repo_domain` | Learn repo-specific terms and concepts | “What does this repo mean by ‘review packet’ here?” |

Default plane selection:

- security/data/testing concepts prefer `risk_and_tests`
- language concepts prefer `language_mechanics`
- repo_architecture concepts prefer `architecture_flow`
- repo_domain concepts prefer `repo_domain` or `file_role`
- otherwise use `local_behavior`

## Configuration model

Create `.skilltrace/preferences.json`:

```json
{
  "version": 1,
  "review": {
    "mode": "snippet_first",
    "enabledPlanes": ["local_behavior", "language_mechanics", "risk_and_tests", "file_role", "architecture_flow", "repo_domain"],
    "defaultPlane": "local_behavior",
    "snippetLineCount": 14,
    "showExplanationsByDefault": false,
    "preferSourceOverDocs": true
  }
}
```

The CLI gets:

- `preferences show`
- `preferences set --planes ... --snippet-lines ... --show-explanations true|false`

The localhost server gets:

- `GET /api/state`
- `GET /api/preferences`
- `PUT /api/preferences`
- `GET /preferences` as a compact first-run/change-later page
- existing `/answer`, `/feedback`, `/correct` stay supported

This makes the platform LLM-operable because an agent can read/write stable JSON rather than scraping HTML.

## Progress map model

Add a derived progress model, not new mutable state:

```ts
type ProgressNode = {
  id: string;
  label: string;
  kind: ConceptKind | 'group';
  parentId?: string;
  mastery: number;
  confidence: number;
  exposureCount: number;
  activeRecallCount: number;
  status: 'new' | 'learning' | 'confident' | 'needs_review';
};
```

Edges come from:

- concept `parentIds`
- concept `prerequisiteIds`
- concept `relatedIds`
- implicit kind group -> concept edges

Website v1 should show:

1. Progress overview cards: new / learning / confident / needs review.
2. Hierarchy grouped by kind and parent relationship.
3. Lightweight SVG graph or JSON graph panel.
4. Clickable concept rows that list recent snippets/evidence.

Do not wait for Obsidian-style graph polish. The user needs progress visibility now; interaction can improve later.

## Dependency graph

A. Preferences store and API contract
   -> B. Snippet-first item model
      -> C. CLI review rendering
      -> D. Session website snippet cards
         -> E. Explain-on-demand interactions
   -> F. Progress model derivation
      -> G. Dashboard progress map
      -> H. Session `/progress` screen/API

## Implementation slices

### Slice 1: preferences and snippet-first model

Files:

- `src/core/preferences.ts` create
- `src/core/types.ts` modify
- `src/core/planner.ts` modify
- `src/core/render.ts` modify
- tests: `tests/core/preferences.test.ts`, `tests/core/planner.test.ts`, `tests/core/render.test.ts`

Tasks:

1. Add question plane and preferences types.
2. Load/save preferences with backward-safe defaults.
3. Add `snippet`, `questionPlane`, and `explanationMarkdown` to `LearningItem`.
4. Derive snippet from ranked evidence snippet first, fallback to path-only text.
5. Generate plane-specific prompts.
6. Render CLI review as snippet first.

### Slice 2: local website UX

Files:

- `src/session/server.ts`
- `src/dashboard/html.ts`
- tests: `tests/session/server.test.ts`, `tests/core/storeDashboard.test.ts`

Tasks:

1. Render snippet code block above the prompt.
2. Add plane label chips.
3. Add “Show explanation” details block.
4. Add `/api/state`, `/api/preferences`, and `PUT /api/preferences`.
5. Add `/preferences` with five short question-category choices and examples:
   - language mechanics
   - local behavior
   - file/module role
   - architecture/repo flow
   - risk and tests
6. Add links/tabs for Review, Preferences, and Progress.

### Slice 3: progress map

Files:

- `src/core/progress.ts` create
- `src/core/render.ts` modify
- `src/dashboard/html.ts` modify
- `src/session/server.ts` modify
- tests: `tests/core/progress.test.ts`, dashboard/session tests

Tasks:

1. Build progress nodes and edges from concepts/states.
2. Group hierarchy by kind and parent.
3. Render CLI `progress` command.
4. Render website Progress Map with hierarchy and SVG graph.
5. Expose `GET /api/progress`.

### Slice 4: docs and dogfood

Files:

- `README.md`
- `docs/REVIEW_SESSION.md`
- `docs/CARD_QUALITY.md`
- `docs/agent/PLATFORM_DEVELOPMENT_TRACKER.md`
- `docs/agent/CHANGELOG.md`

Tasks:

1. Document snippet-first cards and planes.
2. Document preferences file/API.
3. Dogfood on a fresh demo repo and `/home/adam/mergeLearn` scratch state.
4. Run full verification and commit.

## Verification

Run after implementation:

```bash
npm run check
npm test
npm run build
npm run eval
npm run smoke
npm run smoke:package
npm run eval:repos -- --fixtures --with-enrichment fake --out /tmp/mergelearn-tutor-snippet-ux-fixtures
```

Dogfood should verify:

- `today` shows snippets before questions.
- `review` includes question plane and explanation.
- local session page has code snippets and revealable explanation.
- `/api/preferences` can be read and updated.
- dashboard has a progress map/hierarchy.
- no network is used.

## Human decisions deferred

No human decision is required to implement this locally. Defaults are reversible. Later decisions:

- Whether to add Cytoscape.js or another graph library for richer interaction.
- Whether LLM customization should edit preferences directly or use a higher-level natural language command.
- Whether public beta should expose these settings in the website.
