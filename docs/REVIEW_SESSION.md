---
type: guide
title: "Review Session"
description: "The current browser Review flow, recovery behavior, and scheduling boundary."
resource: docs/REVIEW_SESSION.md
tags: [review, spaced-repetition]
timestamp: 2026-08-06
---

# Review sessions

Start the local UI with:

```bash
mergelearn serve
```

Open **Practice**, then choose **Review due**. A Review session is scheduled and graded; **Strengthen weak areas** and **External problems** are read-only views and never write FSRS state.

## Review flow

1. Read the prompt and complete the authored interaction.
2. Choose confidence from Guessing through Certain to submit and reveal.
3. Read deterministic feedback, the expected answer, explanation, and any supplied references.
4. Grade recall with `1` Again, `2` Hard, `3` Good, or `4` Easy.
5. Use **Undo last answer** when needed, or **End session** to stop the sitting.

Grades are persisted through an authoritative server-side session plan. The browser keeps unsent answers locally for recovery, retries mutation requests with stable request IDs, and resumes an unfinished session before starting conflicting practice.

## Scope

The Practice hub can scope Review by folder and tag. Multiple selections use union by default; intersection is available explicitly. The advertised due count and started session use the same filter. Explicit Set and Lesson launches replace browser-local Review scope.

## Recovery and safety

- Reloading resumes an unfinished session when the same server still owns it.
- After a server restart, the page reports that the prior session expired rather than recording a stale grade.
- A conflicting launch does not replace an unfinished session; the page announces which session was resumed.
- Read-only or disconnected clients disable server mutations.
- The server binds to `127.0.0.1`; session and review history remain under the selected local library.

The terminal equivalents are `mergelearn list due`, `mergelearn show <set/card>`, and `mergelearn grade <set/card> <1-4>`.
