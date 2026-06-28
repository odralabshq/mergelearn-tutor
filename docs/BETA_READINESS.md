# MergeLearn Tutor Beta Readiness

## Current gate

MergeLearn Tutor is locally usable, but it is **not ready for public release or publishing** until a human decides the product name, license, and distribution channel.

This document is the local-only beta checklist. It prepares the package and verification path without pushing, publishing, deploying, or enabling remote LLM/network enrichment.

## What is ready locally

- Local CLI over git history.
- Deterministic concept extraction with TypeScript AST support.
- Correctable learner state in `.skilltrace/state.json`.
- Local repo lexicon in `.skilltrace/lexicon.json`.
- Local browser review session with review, courses, questions, timeline, graph, history, progress, and preferences pages.
- Evaluation harness and fixture reports.
- Offline privacy preview and redaction.
- Fake/local enrichment experiment that rejects remote providers.
- Package smoke that checks the installable tarball shape.

## Release blockers

These require human approval before any public beta:

1. Product name: keep `MergeLearn Tutor` or rename before publishing.
2. License: PolyForm Noncommercial 1.0.0; package remains `private: true`.
3. Distribution: npm package, GitHub release, install script, or private archive.
4. Positioning: personal AI-era learning companion vs. onboarding tool.
5. Remote enrichment: still blocked unless explicitly approved separately.

## Package shape

`package.json` intentionally points to built files only:

- `main`: `dist/index.js`
- `types`: `dist/index.d.ts`
- `bin.mergelearn-tutor`: `./dist/cli.js`
- packaged files: `dist/`, `README.md`, `package.json`, top-level public docs under `docs/*.md`, and screenshots under `docs/assets/screenshots/*.png`

The package intentionally excludes:

- source TypeScript files
- `.autoloop/` state
- `.skilltrace/` scratch state
- `eval-runs/`
- agent tracker/changelog docs
- imported research reports under `docs/reserach/`

## Local verification commands

Run from the repository root:

```bash
npm run check
npm test
npm run build
npm run eval
npm run smoke
npm run smoke:package
npm run eval:repos -- --fixtures --with-enrichment fake --out /tmp/mergelearn-tutor-beta-fixtures
```

`npm run smoke:package` builds the project, creates an npm tarball in `/tmp`, verifies the tarball contents, extracts it, and runs the packaged CLI help. It deletes its temporary files afterward.

## Clean-clone style verification

Before public release, verify from a fresh local clone without using any machine-local build artifacts:

```bash
tmpdir=$(mktemp -d)
git clone /home/adam/mergelearn-tutor "$tmpdir/mergelearn-tutor"
cd "$tmpdir/mergelearn-tutor"
npm ci
npm run check
npm test
npm run build
npm run eval
npm run smoke
npm run smoke:package
npm run eval:repos -- --fixtures --with-enrichment fake --out /tmp/mergelearn-tutor-clean-fixtures
```

Do not run `npm publish`, push, create releases, or enable remote providers from this checklist.

## Dogfood checklist

For the sibling repo:

```bash
node dist/cli.js init --repo /home/adam/mergeLearn
node dist/cli.js ingest --repo /home/adam/mergeLearn --since 30d --limit 30
node dist/cli.js privacy init --repo /home/adam/mergeLearn --ignore-path docs/idea2-design.md --redact OpenAI
node dist/cli.js today --repo /home/adam/mergeLearn
node dist/cli.js enrich --repo /home/adam/mergeLearn --provider fake --limit 2
npm run eval:repos -- --repo /home/adam/mergeLearn --since 30d --limit 30 --with-enrichment fake --out /tmp/mergelearn-tutor-beta-dogfood
rm -rf /home/adam/mergeLearn/.skilltrace
```

Acceptance:

- output remains local and no-network
- top cards cite real repo evidence
- fake enrichment is clearly labeled as enrichment
- scratch `.skilltrace` state is removed after dogfood unless intentionally kept

## Public beta readiness checklist

- [x] Evaluation harness exists.
- [x] Correction loop exists.
- [x] Privacy docs exist.
- [x] Local review UX exists.
- [x] Package tarball shape is mechanically checked.
- [x] README states no telemetry and no target code execution.
- [x] README has screenshots and a page-by-page user manual.
- [ ] Human approved name.
- [x] License aligned with mergelearn (PolyForm Noncommercial 1.0.0).
- [ ] Human approved distribution channel.
- [ ] Clean-clone verification run immediately before release.
- [ ] At least one human-rated dogfood report confirms cards are useful and grounded.
