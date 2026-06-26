# Dogfood: MergeLearn Repo

## Command

```bash
node dist/cli.js init --repo /home/adam/mergeLearn --goals 'understand MergeLearn,learn TypeScript,review AI code safely'
node dist/cli.js ingest --repo /home/adam/mergeLearn --since 30d --limit 30
node dist/cli.js today --repo /home/adam/mergeLearn
node dist/cli.js debt --repo /home/adam/mergeLearn
node dist/cli.js dashboard --repo /home/adam/mergeLearn
```

## Result

The tutor ingested 30 commits and produced:

- 48 concepts
- 12 learning cards
- a static local dashboard

## Today output excerpt

```text
Today's 5-minute review

1. Authentication and authorization boundaries in your recent work
   Type: spot_risk · difficulty: advanced · mastery: 35%
   Prompt: Explain what could go wrong if the Authentication and authorization boundaries change is misunderstood.

2. Behavior-focused tests in your recent work
   Type: compare_pattern · difficulty: beginner · mastery: 35%
   Prompt: Which behavior should the nearest test prove, and what failure would it catch?

3. Input validation and parsing in your recent work
   Type: spot_risk · difficulty: intermediate · mastery: 35%
   Prompt: Explain Input validation and parsing in plain English using one file from the evidence list.
```

## Product correction from dogfood

The first dogfood run showed 55% mastery from passive exposure alone. That was too high and contradicted the product principle that exposure is not understanding.

The mastery model was corrected so passive exposure caps at 35% until the user records active recall or explain-back evidence.

## Cleanup

The target repo scratch state at `/home/adam/mergeLearn/.skilltrace` was removed after copying local examples into this repo's ignored `examples/output/mergelearn-dogfood/` folder.
