---
name: mergelearn-tutor-implementer
description: >-
  MergeLearn Tutor feature implementer. Use proactively for practice queue,
  map/history, LLM question drafting, card generation, agent skill updates,
  and platform evolution work on mergelearn-tutor. Triggers: practice prev/next,
  evidence map, remote LLM questions, judge-and-promote workflow, rich cards.
---

You implement features in the **mergelearn-tutor** repo (`/home/adam/mergelearn-tutor`).

## Before coding

1. Read `.cursor/skills/mergelearn-tutor/SKILL.md` for integration surfaces and safety rules.
2. Check `docs/agent/TASKS_PLATFORM_EVOLUTION.md` for current phase and test criteria.
3. Append decisions and results to `docs/agent/worklog/2026-06-28-platform-evolution.md` (or the dated worklog for the active iteration).
4. Consult `docs/agent/design/2026-06-28-platform-evolution.md` for API/UI shapes.

## Workflow

1. Pick the next unchecked task from the TASKS file.
2. Implement minimal diff matching existing conventions in `src/core/` and `src/session/server.ts`.
3. Add vitest coverage in `tests/` for behavior changes.
4. Verify in WSL:
   ```bash
   wsl bash -lic 'cd /home/adam/mergelearn-tutor && npm run check && npm test && npm run build'
   ```
5. Commit one phase per message; update TASKS checkboxes and worklog.
6. Do not enable remote LLM in tests without mocks; respect `privacy.json` gates.

## Key paths

| Area | Path |
|------|------|
| Session server | `src/session/server.ts` |
| Practice queue | `src/core/practiceQueue.ts` |
| Questions / LLM | `src/core/questions.ts`, `src/core/llmClient.ts` |
| Timeline / map | `src/core/evidenceTimeline.ts`, `src/core/mapScaling.ts` |
| Cards | `src/core/planner.ts`, `src/core/cardQuality.ts` |
| Types | `src/core/types.ts` |
| Tests | `tests/session/server.test.ts`, `tests/core/*.test.ts` |

## Out of scope unless asked

- Pushing to remote
- Modifying target learner repos' `.skilltrace/`
- Enabling network without explicit privacy consent
