# GitHub Push Readiness

This checklist prepares MergeLearn Tutor for a normal GitHub push. It does not approve npm publishing, public release, license changes, or remote LLM functionality.

## Current status

The repository is locally push-ready after the verification commands in this document pass.

Implemented product surfaces:

- CLI ingestion and review commands
- local browser review session
- active-recall cards
- card generation and regeneration with archived history
- courses and goals
- fake/local no-network question drafting
- accepted/rejected question bank
- evidence timeline and document lens
- graph projection and raw graph JSON
- summary-first history page
- progress and preferences pages
- screenshots and user manual

## Before pushing

Run from the repository root:

```bash
git status -sb
npm run check
npm test
npm run build
npm run eval
npm run smoke
npm run smoke:package
```

Optional full fixture evaluation:

```bash
npm run eval:repos -- --fixtures --with-enrichment fake --out /tmp/mergelearn-tutor-github-fixtures
```

Expected result:

- TypeScript check passes.
- Vitest suite passes.
- Build produces `dist/`.
- Local evaluation passes.
- CLI smoke passes.
- Packaged smoke passes.

## Recommended push commands

Use these only after reviewing the diff:

```bash
git status -sb
git log --oneline -5
git diff --stat origin/$(git branch --show-current)..HEAD 2>/dev/null || true
git push origin $(git branch --show-current)
```

If this is the first push for the branch:

```bash
git push -u origin $(git branch --show-current)
```

## Files that should be included

Documentation and screenshots:

```text
README.md
docs/USER_MANUAL.md
docs/GITHUB_PUSH_READY.md
docs/assets/screenshots/*.png
```

Core implementation and tests from the product batch:

```text
src/core/courses.ts
src/core/questions.ts
src/core/evidenceTimeline.ts
src/session/server.ts
tests/core/coursesQuestionsTimeline.test.ts
tests/session/server.test.ts
```

## Files that should not be pushed

The `.gitignore` already excludes normal local artifacts:

```text
node_modules/
dist/
coverage/
.skilltrace/
eval-runs/
.autoloop/
*.log
```

Before pushing, check for accidental local/demo artifacts:

```bash
git status --short
```

Do not push:

- target-repo `.skilltrace/` state
- local demo repos under `/tmp`
- generated tarballs
- build output under `dist/`
- screenshots outside `docs/assets/screenshots/`

## Public release blockers

The repo can be pushed to GitHub as a private or internal development repo, but public release still needs explicit human decisions.

Blockers:

- License: PolyForm Noncommercial 1.0.0 (see root LICENSE), aligned with odralabshq/mergelearn.
- `package.json` has `private: true`.
- `package.json` has `license: PolyForm-Noncommercial-1.0.0`.
- Root `LICENSE` matches odralabshq/mergelearn (Copyright 2026 Odra Labs).
- Distribution channel is undecided.
- Remote LLM mode is intentionally blocked until privacy policy and outbound preview behavior are approved.

Do not run `npm publish` or make the repo public until these are resolved.

## GitHub README quality checklist

- [x] The README explains what the tool does.
- [x] The README explains what it does not do.
- [x] The README has quick-start commands.
- [x] The README has screenshots.
- [x] The README links to a user manual.
- [x] The README has verification commands.
- [x] Privacy and no-network behavior are explicit.
- [x] Release blockers are explicit.

## Manual smoke after pushing

After pushing to GitHub, open the repository page and check:

1. README renders without broken screenshot links.
2. Screenshot tables are readable.
3. `docs/USER_MANUAL.md` opens from the README link.
4. `docs/GITHUB_PUSH_READY.md` opens from the README link.
5. GitHub does not show unexpected generated files in the diff.

If screenshots do not render, confirm the files exist under:

```text
docs/assets/screenshots/
```
