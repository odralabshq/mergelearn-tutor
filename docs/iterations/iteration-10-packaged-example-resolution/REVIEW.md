---
type: review
reviewer: "Opus 5 via Kiro, source-grounded by Hermes"
review_cycles: 1
title: "Iteration 10: Packaged Example Resolution Review"
description: "Clean-install reproduction and correction of the published interview-example command."
resource: docs/iterations/iteration-10-packaged-example-resolution/REVIEW.md
tags: [iteration, packaging, cli, examples, review]
timestamp: 2026-08-06
---

# Iteration 10 Implementation Review

## Reviewed revision

Implementation commit: `f2ade3876e33ff1341ddd0ff900953655fd0af82`

The final review covered the exact two-file implementation tree later committed as this revision. The frozen diff contained 91 lines and 4,431 bytes.

## Observed defect

The README documents:

```bash
mergelearn apply --file examples/interview-pattern-lesson.json --open
```

The npm tarball contained the lesson, but a clean consumer project did not contain that repository-relative path. The documented command failed with `ENOENT`. A positive control using the lesson's absolute installed-package path validated the same five-card lesson successfully.

## TDD evidence

- Packaged smoke first ran the exact README-relative path from outside the extracted package directory.
- Before the fix, packaged smoke failed with the same `ENOENT` as the clean consumer project.
- The CLI now tries the caller-supplied path first.
- Only an `ENOENT` for the exact published path `examples/interview-pattern-lesson.json` falls back to the installed package copy.
- A valid caller-owned lesson at the same relative path takes precedence over the shipped lesson.
- An arbitrary missing path, `examples/not-shipped.json`, still exits nonzero with `ENOENT`.
- Package contents explicitly assert that the interview lesson is shipped.

## Clean-install evidence

A real `mergelearn-1.2.0.tgz` was installed into a repository-independent temporary npm project.

- The exact README command, including `--open`, succeeded.
- Set `interview-pattern-example` was imported with five cards.
- The stored Set and five card files were read back.
- The managed server health endpoint returned the matching instance ID.
- A harmless fixture replacing only the macOS opener captured the exact attributed URL ending in `/set/interview-pattern-example?source=apply-open`.
- The served lesson page contained the imported lesson title.
- The disposable managed server was terminated after verification.

## Repository evidence

- 393 tests passed across 42 files.
- TypeScript check passed.
- Build passed.
- Packaged smoke passed over 155 files.
- `git diff --check` passed.

## Opus review

Verdict: `NOT BLOCKED`

Test quality: `PASS`

Required before commit: None.

Opus confirmed that the fallback is narrowly guarded, caller-relative paths retain precedence, every other path preserves its prior error, and the built layout was verified empirically. Non-blocking observations were adjudicated as follows:

- The fallback is silent. This is acceptable for the single highly specific README filename and avoids adding CLI noise to the documented happy path.
- The package URL interpolates the allowlisted input. The only reachable value is an exact literal, so no traversal input reaches URL construction. Any future allowlist expansion requires review.
- Alternate spellings such as `./examples/...` do not fall back. This is intentional because the published command is exact.
- A README search confirmed there is no other published `apply --file examples/...` command.

## Implementation verdict

`NOT BLOCKED`

Iteration 10 is complete at implementation revision `f2ade3876e33ff1341ddd0ff900953655fd0af82`. The known package-relative publication prerequisite is resolved.