# Customization and API Surface

MergeLearn Tutor is designed so humans, CLI commands, the localhost website, and future LLM agents can all use the same local control surface.

## Local preference file

Preferences live at:

```text
.skilltrace/preferences.json
```

Default shape:

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

## Question planes

- `language_mechanics`: syntax, types, runtime semantics.
- `local_behavior`: what a snippet/function/block does.
- `file_role`: why the code belongs in this file or module.
- `architecture_flow`: how the snippet connects to surrounding program flow.
- `risk_and_tests`: bugs, validation, security, regressions, guardrails.
- `repo_domain`: repo-specific vocabulary and concepts.

## CLI

```bash
mergelearn-tutor preferences show --repo .
mergelearn-tutor preferences set --repo . --planes local_behavior,risk_and_tests --snippet-lines 12
mergelearn-tutor progress --repo .
```

## Local website preferences screen

Open the local review session and visit:

```text
/preferences
```

The page asks a short set of example-backed questions so the user can choose what categories to receive without reading raw JSON first.

## Local website API

The session server binds to `127.0.0.1` and exposes:

```text
GET  /api/state
GET  /api/progress
GET  /api/preferences
PUT  /api/preferences
POST /api/cards/generate
GET  /preferences
POST /answer
POST /feedback
POST /correct
```

`PUT /api/preferences` accepts partial preferences and normalizes invalid values fail-closed to safe defaults.

`POST /api/cards/generate` accepts `{ "count": 5, "mode": "more" }` or `{ "count": 5, "mode": "regenerate" }`. Regeneration archives old active cards instead of deleting them, so learning events and ratings remain attached to historical card IDs.

## LLM customization stance

For now, LLMs should edit preferences through JSON or the API, not by rewriting code. A good LLM workflow is:

1. Read `GET /api/preferences`.
2. Propose a small preference change.
3. Apply with `PUT /api/preferences`.
4. Read `GET /api/state` or `GET /api/progress` to verify the result.

This keeps customization consistent across CLI, website, and future UI settings.
