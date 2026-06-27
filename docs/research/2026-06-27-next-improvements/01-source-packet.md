# 01 Source packet

Use this file to give another researcher or agent exact context without making them rediscover the repo.

## Local source files to inspect

Core product and state:

- `src/cli.ts`
- `src/core/types.ts`
- `src/core/store.ts`
- `src/core/concepts.ts`
- `src/core/planner.ts`
- `src/core/questions.ts`
- `src/core/courses.ts`
- `src/core/evidenceTimeline.ts`
- `src/core/progress.ts`
- `src/core/preferences.ts`
- `src/core/ratings.ts`
- `src/session/server.ts`

Tests:

- `tests/session/server.test.ts`
- `tests/core/coursesQuestionsTimeline.test.ts`
- `tests/core/planner.test.ts`
- `tests/core/ratings.test.ts`
- `tests/core/preferences.test.ts`
- `tests/core/progress.test.ts`
- `tests/eval/evaluationHarness.test.ts`

Docs:

- `README.md`
- `docs/USER_MANUAL.md`
- `docs/CARD_QUALITY.md`
- `docs/CUSTOMIZATION.md`
- `docs/EVALUATION.md`
- `docs/PRIVACY.md`
- `docs/REVIEW_SESSION.md`
- `docs/ROADMAP.md`
- `docs/agent/CHANGELOG.md`

Current research packet screenshots:

- `docs/research/2026-06-27-next-improvements/screenshots/01-review.png`
- `docs/research/2026-06-27-next-improvements/screenshots/02-courses.png`
- `docs/research/2026-06-27-next-improvements/screenshots/03-questions.png`
- `docs/research/2026-06-27-next-improvements/screenshots/04-timeline.png`
- `docs/research/2026-06-27-next-improvements/screenshots/05-graph.png`
- `docs/research/2026-06-27-next-improvements/screenshots/06-history.png`
- `docs/research/2026-06-27-next-improvements/screenshots/07-progress.png`
- `docs/research/2026-06-27-next-improvements/screenshots/08-preferences.png`

## Local app endpoints to inspect

With the session server running:

```text
http://127.0.0.1:4197/
http://127.0.0.1:4197/courses
http://127.0.0.1:4197/questions
http://127.0.0.1:4197/timeline
http://127.0.0.1:4197/graph
http://127.0.0.1:4197/history
http://127.0.0.1:4197/progress
http://127.0.0.1:4197/preferences
http://127.0.0.1:4197/api/state
http://127.0.0.1:4197/api/courses
http://127.0.0.1:4197/api/questions
http://127.0.0.1:4197/api/evidence-graph
http://127.0.0.1:4197/api/progress
http://127.0.0.1:4197/api/cards/history
```

## Useful local commands

```bash
cd /home/adam/mergelearn-tutor
npm run check
npm test
npm run build
npm run smoke:package
node dist/cli.js --help
node dist/cli.js session --repo /tmp/mergelearn-full-demo --port 4197
```

Capture screenshots:

```bash
mkdir -p docs/research/2026-06-27-next-improvements/screenshots
npx --yes playwright@1.57.0 screenshot --browser chromium --full-page --viewport-size=1440,1000 \
  http://127.0.0.1:4197/graph \
  docs/research/2026-06-27-next-improvements/screenshots/05-graph.png
```

## External sources used for this packet

Learning science and flashcards:

- ScienceDirect/JACR systematic review result on spaced learning, interleaving, and retrieval practice in education: `https://www.sciencedirect.com/science/article/pii/S1546144023006464`
- Heuristica spaced repetition and flashcards overview: `https://www.heuristi.ca/posts/spaced-repetition-with-flashcards`
- Scholarly flashcard study techniques: `https://scholarly.so/blog/how-to-study-with-flashcards`
- InnerDrive retrieval practice/flashcards overview: `https://www.innerdrive.co.uk/blog/flashcards-retrieval-tool/`

UX and dashboard design:

- UXPin progressive disclosure: `https://www.uxpin.com/studio/blog/what-is-progressive-disclosure/`
- Interaction Design Foundation progressive disclosure topic: `https://ixdf.org/literature/topics/progressive-disclosure`
- UXPin dashboard design principles: `https://www.uxpin.com/studio/blog/dashboard-design-principles/`
- UXPilot dashboard design principles: `https://uxpilot.ai/blogs/dashboard-design-principles`

Knowledge graphs and learning analytics:

- ScienceDirect systematic literature review of knowledge graphs in education: `https://www.sciencedirect.com/science/article/pii/S2405844024014142`
- Neo4j knowledge graph overview: `https://neo4j.com/use-cases/knowledge-graph/`
- SmythOS overview of knowledge graphs in education: `https://smythos.com/managers/education/knowledge-graphs-in-education/`
- Learning analytics tools/LRS overview: `https://www.educate-me.co/blog/learning-analytics-tools`

## Tooling note

Perplexity deep research was attempted but unavailable due an invalid API key. This packet therefore uses local inspection, screenshot review, and Brave search results rather than Perplexity synthesis.
