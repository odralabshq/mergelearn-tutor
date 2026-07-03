---
type: reference
title: "Corrections"
description: "The corrections mechanism for suppressing and pinning cards."
resource: docs/CORRECTIONS.md
tags: [corrections, feedback]
timestamp: 2026-07-02
---

# Corrections and Learner Events

MergeLearn Tutor must be correctable. If the tutor guesses wrong, the user should be able to fix the state instead of fighting the product.

## Commands

Record an explain-back answer:

```bash
mergelearn-tutor answer --repo . --item <learning-item-id> --answer "..." --correct
```

Mark card feedback:

```bash
mergelearn-tutor feedback --repo . --item <learning-item-id> --event marked_wrong --note "too generic"
mergelearn-tutor feedback --repo . --item <learning-item-id> --event marked_useful
mergelearn-tutor feedback --repo . --item <learning-item-id> --event marked_unsure
mergelearn-tutor feedback --repo . --item <learning-item-id> --event skipped
```

Correct a concept:

```bash
mergelearn-tutor correct --repo . --concept <concept-id> --type not_useful --note "hide this"
mergelearn-tutor correct --repo . --concept <concept-id> --type better_label --label "session authorization"
mergelearn-tutor correct --repo . --concept <concept-id> --type pin_important
```

## Event types

Supported review events:

- `shown`
- `answered`
- `skipped`
- `marked_unsure`
- `marked_wrong`
- `marked_correct`
- `marked_useful`
- `corrected`
- `deferred`

## Correction types

Supported corrections:

- `wrong_concept`
- `wrong_evidence`
- `duplicate`
- `better_label`
- `not_useful`
- `pin_important`

## Current behavior

- `marked_wrong` lowers mastery/confidence and makes the concept due sooner.
- `marked_useful` raises importance/relevance.
- `not_useful` and `wrong_concept` suppress future cards for that concept.
- `better_label` renames the concept and its card title.
- `pin_important` raises concept importance and relevance.
- Profile output shows correction count.
- Debt output shows the latest correction reason when relevant.

## Dogfood result

Batch 2 dogfood on `/home/adam/mergeLearn`:

```text
Recorded marked_wrong for item_f415d39ee4.
Recorded not_useful correction for security.auth_boundary.
Corrections: 1
corrected concept security.auth_boundary
last concept state security.auth_boundary
suppressed concept still has card False
```

Product correction made during dogfood:

- Suppressed concepts now re-sort below active concepts in the profile instead of staying at the top because of weakness/due priority.

## Remaining work

The current correction model is enough to make the tutor collaborative, but not complete.

Next improvements:

1. Add manual rating persistence for eval reports.
2. Add card-level evidence correction.
3. Add duplicate/merge semantics instead of just recording duplicate corrections.
4. Surface corrections in the future interactive review UI.
5. Add migration tests if the state schema version changes.
