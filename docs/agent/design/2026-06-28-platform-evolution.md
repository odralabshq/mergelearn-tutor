# Platform Evolution Design — 2026-06-28

Brief design per phase: API shapes, UI behavior, data model changes.

## Phase 0 — Practice queue

### API

`GET /api/practice/queue?index=N&reviewed=id1,id2`

```json
{
  "items": [{ "id": "...", "title": "...", "batchId": "...", "courseId": "..." }],
  "index": 0,
  "total": 21,
  "reviewedInSession": ["item_a"]
}
```

### Sort

1. Items without global `answered` / grade outcome events first.
2. Within each group: batch `createdAt`, then item `createdAt`.

### UI

- Header progress bar: `(index + 1) / total`.
- Footer: Previous · position · Next.
- After successful `POST /answer` or grade `POST /feedback` → `location.href = /practice?index=index+1`.

## Phase 1 — Map & History

### Timeline

`buildEvidenceTimeline(state, { includeEvents?: boolean, courseId?: string })`

- Default `includeEvents: false` for map surfaces.
- `courseId` filters nodes/edges to course subgraph (course, linked concepts, questions, cards, evidence paths).

### Map

- Remove Events lane when events excluded.
- Graph node labels: `text-wrap` via CSS + `foreignObject` or truncated multi-line tspans.

### History

- Primary panel: chronological `learningEvents` list.
- Query: `?type=answered&limit=20&offset=0`.
- `GET /api/history/activity` JSON mirror.

## Phase 2 — LLM questions

### Privacy gate

Remote allowed when `privacy.json`: `network.enabled` + `consentToSend` + env `OPENAI_API_KEY`.

### `llmClient.ts`

```ts
completeJson<T>({ messages, schemaHint }): Promise<T>
```

OpenAI-compatible: `OPENAI_API_KEY`, optional `OPENAI_BASE_URL`.

### Question schema extension

```ts
QuestionBankEntry {
  shortAnswer?: string;
  deepExplanation?: string;
}
```

Remote draft prompt uses `createOutboundPreview` evidence context. Validate `questionPlane` against concept kind.

## Phase 3 — Agent skill

Document workflows: remote draft → rubric judge → `POST /api/questions/bulk-status` → `POST /api/cards/generate`.

New endpoints: `/api/practice/queue`, `/api/questions/candidates`, `/api/questions/bulk-status`, `/api/history/activity`.

## Phase 4 — Rich cards

### Card build

- `explanationMarkdown` = `shortAnswer` (reveal text).
- `bodyMarkdown` / details = `deepExplanation` (Learn more).

### UI

```html
<section class="reveal-panel">
  <p class="short-answer">...</p>
  <details class="learn-more"><summary>Learn more</summary><p>...</p></details>
</section>
```

### Quality

`cardQuality`: warn if `questionId` present and no non-empty `deepExplanation` on source question.
