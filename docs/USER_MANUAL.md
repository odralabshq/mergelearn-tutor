# MergeLearn Tutor User Manual

This manual explains how to use MergeLearn Tutor from setup through daily review. It is written for a developer who wants a local tool that turns recent repository work into grounded learning material.

## 1. Mental model

MergeLearn Tutor builds a local learning loop:

1. Ingest git history and changed files.
2. Extract concepts from code, docs, tests, and path names.
3. Generate evidence-linked learning cards.
4. Review cards from memory.
5. Preserve answers, feedback, archived cards, courses, question drafts, and graph data in `.skilltrace/state.json`.

The tool is intentionally local-first. It does not run target repo code or call remote LLMs by default.

## 2. First run

From the MergeLearn Tutor repo:

```bash
npm install
npm run build
node dist/cli.js init --repo /path/to/your/repo
node dist/cli.js ingest --repo /path/to/your/repo --since 30d
node dist/cli.js cards generate --repo /path/to/your/repo --count 5 --mode more
node dist/cli.js session --repo /path/to/your/repo
```

Open the printed local URL in your browser.

The Review page also includes a `Start here` panel. Use it as the browser checklist from an empty repo to a useful learning queue:

1. Ingest repo evidence so concepts are extracted from recent commits and docs.
2. Create a course goal that names the material and docs you care about.
3. Draft fake/local questions and accept the useful ones.
4. Generate cards and review them from memory.

The checklist is state-aware: completed steps show current counts, while incomplete steps point to the next local CLI command or browser page.

## 3. Review page

![Review page](assets/screenshots/review.png)

Use the Review page for daily active recall.

What you see:

- active cards generated from recent repo evidence
- a real code or diff snippet
- the question plane, such as `risk_and_tests` or `repo_domain`
- an answer box
- a reveal button
- self-grade and card-quality feedback controls

How to use it:

1. Read the snippet.
2. Answer from memory before revealing anything.
3. Click `Reveal explanation`.
4. Choose `I knew it`, `Partly`, or `Missed it`.
5. Use `Bad card` or `Wrong evidence` when the tutor is wrong. These quality flags do not count as learner failure.

Queue controls:

- `Generate 5 more` adds cards without deleting the current queue.
- `Regenerate 5` archives the current active queue and creates a new focused queue.

Archived cards stay in history.

## 4. Courses page

![Courses page](assets/screenshots/courses.png)

Use Courses to define what you are trying to learn.

A course contains:

- course id
- title
- learning goal
- source material paths, such as `src/**` and `tests/**`
- documentation paths, such as `README.md` or `docs/**`
- enabled question planes
- focused concept ids

Create a course in the browser or CLI:

```bash
mergelearn-tutor course create \
  --repo . \
  --id learn-auth \
  --title "Learn auth" \
  --goal "Understand auth from source, tests, and docs" \
  --materials "src/**,tests/**" \
  --docs "docs/**"
```

Use Courses when you want the tutor to connect material, goals, and accepted questions instead of only reviewing the latest commits.

## 5. Questions page

![Questions page](assets/screenshots/questions.png)

Use Questions to manage the question bank.

What this page shows:

- draft questions
- accepted questions
- rejected questions
- provider metadata
- evidence paths
- expected answers hidden behind details
- whether network access was used

Draft questions locally:

```bash
mergelearn-tutor questions draft --repo . --course learn-auth --provider fake --count 5
```

Then review and accept useful drafts:

```bash
mergelearn-tutor questions list --repo . --course learn-auth
mergelearn-tutor questions accept --repo . --id <question-id>
```

Important: `fake` and `local` providers are no-network. Remote LLM question drafting is intentionally not enabled yet.

## 6. Timeline page

![Timeline page](assets/screenshots/timeline.png)

Use Timeline to inspect provenance.

The timeline answers:

- Which commits introduced learning evidence?
- Which source files and docs were touched?
- Which concepts were extracted?
- Which questions and cards came from that evidence?
- Which review events happened later?

The Document Lens highlights markdown and documentation material. This is how docs become first-class learning material rather than being hidden behind code diffs.

CLI equivalent:

```bash
mergelearn-tutor timeline --repo .
```

## 7. Graph page

![Graph page](assets/screenshots/graph.png)

Use Graph to inspect the local learning graph.

The graph groups nodes by type:

- commits
- files
- docs
- concepts
- courses
- question drafts
- card batches
- cards
- review events

The `Raw graph projection` panel exposes the underlying nodes and edges. This keeps the UI simple while making the data model transparent and ready for a future richer graph renderer.

API endpoint:

```text
/api/evidence-graph
```

## 8. History page

![History page](assets/screenshots/history.png)

Use History to audit what happened without reading every card at once.

The page is summary-first:

- active cards
- archived cards
- batches
- review events
- recent activity
- active card details
- archived card details collapsed by default

Use this page when you want to confirm that regeneration preserved old cards and events.

API endpoint:

```text
/api/cards/history
```

## 9. Progress page

![Progress page](assets/screenshots/progress.png)

Use Progress to inspect concept mastery.

The page groups concepts by type and shows review status. It is not the main habit loop; it is an inspection page for understanding what the tutor thinks you are learning.

CLI equivalent:

```bash
mergelearn-tutor progress --repo .
```

## 10. Preferences page

![Preferences page](assets/screenshots/preferences.png)

Use Preferences to choose question types.

Question planes:

- `language_mechanics` — syntax, types, runtime behavior
- `local_behavior` — what a function or block does
- `file_role` — why code belongs in a file
- `architecture_flow` — how code connects across files
- `risk_and_tests` — bugs, validation, security, regression tests
- `repo_domain` — project-specific vocabulary

Preferences are saved locally in `.skilltrace/preferences.json`.

CLI equivalent:

```bash
mergelearn-tutor preferences show --repo .
mergelearn-tutor preferences set --repo . --planes local_behavior,risk_and_tests --snippet-lines 12
```

## 11. Static dashboard

You can also generate a static HTML dashboard:

```bash
mergelearn-tutor dashboard --repo .
```

Open:

```text
/path/to/your/repo/.skilltrace/dashboard.html
```

The local browser session is more interactive, but the dashboard is useful when you want a portable HTML artifact.

## 12. Data files

MergeLearn Tutor writes local state under the target repository:

```text
.skilltrace/state.json
.skilltrace/preferences.json
.skilltrace/privacy.json
.skilltrace/lexicon.json
.skilltrace/dashboard.html
```

Delete `.skilltrace/` if you want to remove all tutor state from the target repository.

## 13. Recommended daily workflow

```bash
mergelearn-tutor ingest --repo . --since 7d
mergelearn-tutor cards generate --repo . --count 5 --mode more
mergelearn-tutor session --repo .
```

Then spend 3-5 minutes on the Review page.

## 14. Recommended weekly workflow

```bash
mergelearn-tutor ratings --repo .
mergelearn-tutor progress --repo .
mergelearn-tutor timeline --repo .
```

Use the results to decide whether the tutor is producing useful questions or if you should add a repo lexicon entry.

## 15. Troubleshooting

If no cards appear:

1. Run `mergelearn-tutor ingest --repo . --since 30d`.
2. Run `mergelearn-tutor cards generate --repo . --count 5 --mode more`.
3. Check that the target repo has git commits and changed files.

If questions look generic:

1. Add a concept to the local lexicon.
2. Add course material paths.
3. Prefer `risk_and_tests`, `local_behavior`, or `repo_domain` planes.

If the UI looks stale:

1. Stop the old session process.
2. Run `npm run build`.
3. Start `node dist/cli.js session --repo /path/to/repo` again.
4. Hard-refresh the browser tab.

## 16. What is intentionally not enabled yet

- remote LLM question generation
- cloud sync
- telemetry
- PR blocking
- IDE extension
- public SaaS dashboard

These are future product decisions, not hidden features.
