---
title: "MergeLearn: One Integration, Dogfood Records, Relicense"
description: "Make one coding-agent workflow reliable end to end, record ten days of usage including deliberate non-invocations, and move to Apache 2.0 before any company testing. Explicitly excludes automatic triggering and equally deep support for all agents."
resource: docs/design/agent-loop-2026-07/05-INTEGRATION-DOGFOOD-LICENSE.md
tags: [design, integration, dogfood, license, 2026-07]
updated: 2026-07-28
status: design
---

# One Integration, Dogfood Records, Relicense

Tasks 6, 7, 8.

## 1. Optimize one agent (task 6)

For this implementation, optimize **Cursor** first. It is already supported by
`AGENT_ADAPTERS` and is the only supported coding-agent CLI installed on this
machine. Acceptance must exercise the project-installed Cursor skill, not merely
copy it into `.cursor/skills`.

If Kiro is actually the daily coding surface, replace this choice with one Kiro
adapter before implementation. Do not deepen both integrations in this workstream.

1. finish a meaningful coding task;
2. decide whether it holds worthwhile learning material;
3. inspect existing lessons when useful (`context --recent 10`);
4. author a lesson from current task context;
5. invoke `mergelearn create-and-open`;
6. correct the lesson if validation fails, using `--json` errors.

Step 6 is the one most likely to be skipped and the one that most affects
perceived quality. An agent that silently gives up on a rejected patch looks
like a broken tool.

`setup-agent` keeps installing to all detected agents; `AGENT_ADAPTERS` is
untouched. We simply do not invest in making all five equally deep yet.

**No automatic triggering.** Invocation stays an explicit command or agent
action. Do not fire after every task. Automatic or suggested triggering is
evaluated only after the manual loop proves useful; otherwise we are tuning
trigger heuristics for a lesson nobody wanted.

## 2. Dogfood records (task 7)

Append-only JSONL at `<root>/dogfood.jsonl`. Record events MergeLearn does not
already persist; derive answers from existing review sessions rather than writing
a second source of truth.

```jsonc
{"ts":"2026-07-29T10:12:00Z","kind":"opened","setId":"auth-01",
 "source":"create-and-open"}
{"ts":"2026-07-29T10:18:00Z","kind":"feedback","setId":"auth-01",
 "worthAnswering":true,"note":"caught the ordering bug"}
{"ts":"2026-07-29T11:00:00Z","kind":"deferred","setId":"queues-01"}
{"ts":"2026-07-29T14:02:00Z","kind":"skipped","task":"bump deps","reason":"nothing to learn"}
```

- `opened` is appended by the server when `GET /set/<setId>` succeeds. Preserve
  the optional `?source=create-and-open` value; a later open without that value is
  a stronger voluntary-return signal. Launching the browser alone proves neither.
- `feedback` comes from explicit Worth it / Not worth it controls, with an
  optional note. Do not infer value from a grade.
- `deferred` comes only from an explicit Not now action on the lesson page.
- `skipped` records a meaningful completed task for which the developer
  deliberately created no lesson.
- `answered` and completion state are derived from existing lesson-mode sessions
  via `sessionHistory.ts`. Do not duplicate them in JSONL.

Do not emit `closed` from `pagehide`; refresh and navigation produce the same
signal. In the day-ten summary, classify an open with no later session, feedback,
or deferral as `abandoned/closed`. Keep that label explicitly derived, not a raw
browser event.

The `skipped` records matter as much as the lessons. Manual invocation might yield
only a handful of lessons in ten days, which is thin evidence on its own.
Consistent non-invocation is itself the answer to the whole question, and without
these records it is invisible and just looks like a quiet fortnight.

Show a Not now action on lesson entry, and feedback controls after the learner
answers at least one activity and again at completion. Do not intercept tab close
or navigation. Capture `skipped` via a one-liner, for example:
`mergelearn skipped --task "bump deps" --reason "nothing to learn"`.

Keep the events local, plaintext and trivially greppable. A small read-only
`mergelearn dogfood-summary --json` may join events with existing sessions for
the day-ten review; no dashboard or new learning-state schema.

## 3. Relicense and repo cleanup (task 8)

This section supersedes only the PolyForm decision in
`redesign-2026-07/12-PUBLIC-BETA-AND-FIRST-VALUE.md` §3. That document remains
historically accurate for the 0.1.0 release; Apache 2.0 is the target now.

Move from PolyForm-Noncommercial-1.0.0 to **Apache-2.0** before testing inside any
company.

Why now: PolyForm Noncommercial forbids company use, which blocks a pilot at the
builder's own employer, the most accessible feedback source and the most likely
first buyer. At 0 stars there is nothing to protect, and adoption plus feedback is
the current goal. Apache 2.0 permits commercial use and carries an explicit patent
grant, while leaving a paid hosted layer available later.

Relicensing is clean here: `mergelearn-tutor` has exactly **one** contributor
(`feilaz`), so there is no third-party consent problem. Verify with
`gh api repos/odralabshq/mergelearn-tutor/contributors` before committing.

Checklist:

1. Replace `LICENSE` with the Apache 2.0 text.
2. `package.json` → `"license": "Apache-2.0"`.
3. Update the README licence line and the npm package description, which
   currently reads "Source-available for noncommercial use; commercial use
   requires permission from Odra Labs".
4. Grep for stray "noncommercial" / "PolyForm" references in `docs/`, `skills/`
   and `examples/`.
5. Publish a new npm version so the registry metadata matches the repo. The
   published `0.1.0` carries the old licence string.
6. Archive `odralabshq/mergelearn` (the abandoned earlier attempt) and put a
   one-line README pointer to `mergelearn-tutor`. Two similarly named public
   repos, one dead, confuses anyone who finds the project.

No open-core split, no dual licensing, no CLA. A DCO is sufficient if contribution
policy is wanted at all. General product and licensing information, not legal
advice.

## 4. Acceptance

Automated:

1. `opened`, `feedback`, `deferred`, and `skipped` events each append one valid
   JSON line; the file remains parseable line by line.
2. Malformed input is rejected without corrupting existing lines.
3. Missing `dogfood.jsonl` is created on first write.
4. `opened` is emitted only after a successful lesson-page response, not when the
   platform opener is invoked; it preserves auto-open versus voluntary-return
   provenance from the optional `source` query parameter.
5. Day-ten summary derives answered/completed state from existing review sessions
   and does not write duplicate outcome fields to JSONL.
6. `setup-agent --agent cursor --scope project` installs the revised skill into
   an injected temporary project, and the packed artifact carries that revision.
7. `package.json` reports `Apache-2.0`; the packed artifact contains the Apache
   license and no live noncommercial package metadata.

Manual:

8. In Cursor, complete one meaningful task, inspect context, author, recover from
   one deliberately invalid patch, and open the corrected lesson end to end.
9. Ten working days of real use with `opened`, `feedback`, `deferred`, and
   `skipped` events, plus existing review sessions for answered/completed state.
10. `npm view mergelearn license` reports `Apache-2.0` after republish.
11. `odralabshq/mergelearn` shows as archived with a pointer to the active repo.

## 5. Review the gate, then decide

At day ten, read `dogfood.jsonl` and answer one question: **are lessons still
voluntarily opened and answered once the novelty is gone?**

If yes → proceed to external sessions (ten developers, gate: at least three
unprompted second uses). If no → the problem is the lesson, not the trigger and
not the positioning, and no marketing or mission work fixes it.

Do not expand the platform during the ten days unless a blocking defect prevents
the core workflow from being tested.
