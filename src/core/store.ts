import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { DEFAULT_PREFERENCES } from './preferences.js';
import type { LearningItem, TutorState } from './types.js';
import { nowIso, normalizeRepoPath } from './util.js';

export function stateDir(repoPath: string): string {
  return path.join(repoPath, '.skilltrace');
}

export function statePath(repoPath: string): string {
  return path.join(stateDir(repoPath), 'state.json');
}

export function createEmptyState(repoPath: string, goals: string[] = []): TutorState {
  const now = nowIso();
  return {
    version: 1,
    repoPath: normalizeRepoPath(repoPath),
    goals,
    createdAt: now,
    updatedAt: now,
    artifacts: [],
    concepts: [],
    conceptStates: [],
    learningItems: [],
    cardBatches: [],
    courses: [],
    questionBank: [],
    questionDraftBatches: [],
    learningEvents: [],
    delayedProbes: [],
    studyAssignments: [],
    corrections: [],
    manualRatings: [],
  };
}

function normalizeState(state: TutorState): TutorState {
  return {
    ...state,
    artifacts: state.artifacts ?? [],
    concepts: state.concepts ?? [],
    conceptStates: state.conceptStates ?? [],
    learningItems: (state.learningItems ?? []).map(normalizeLearningItem),
    cardBatches: state.cardBatches ?? [],
    courses: state.courses ?? [],
    questionBank: state.questionBank ?? [],
    questionDraftBatches: state.questionDraftBatches ?? [],
    learningEvents: state.learningEvents ?? [],
    delayedProbes: state.delayedProbes ?? [],
    studyAssignments: state.studyAssignments ?? [],
    corrections: state.corrections ?? [],
    manualRatings: state.manualRatings ?? [],
  };
}

function normalizeLearningItem(item: LearningItem): LearningItem {
  const firstEvidence = item.evidence?.[0];
  const questionPlane = item.questionPlane ?? DEFAULT_PREFERENCES.review.defaultPlane;
  const snippet = item.snippet ?? {
    path: firstEvidence?.path ?? 'unknown',
    label: firstEvidence?.label ?? item.title,
    commit: firstEvidence?.commit,
    code: firstEvidence?.snippet ?? `// Evidence path: ${firstEvidence?.path ?? 'unknown'}\n// ${item.prompt}`,
  };
  return {
    ...item,
    questionPlane,
    snippet,
    explanationMarkdown: item.explanationMarkdown ?? 'Read the snippet carefully, identify the behavior, then connect it to the concept on this card.',
    status: item.status ?? 'active',
    generation: item.generation ?? 1,
    source: item.source ?? 'ingest',
  };
}

export async function loadState(repoPath: string): Promise<TutorState> {
  try {
    return normalizeState(JSON.parse(await readFile(statePath(repoPath), 'utf8')) as TutorState);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return createEmptyState(repoPath);
    throw error;
  }
}

export async function saveState(repoPath: string, state: TutorState): Promise<void> {
  await mkdir(stateDir(repoPath), { recursive: true });
  state.updatedAt = nowIso();
  await writeFile(statePath(repoPath), `${JSON.stringify(state, null, 2)}
`);
}

export async function initState(repoPath: string, goals: string[]): Promise<TutorState> {
  const state = createEmptyState(repoPath, goals);
  await saveState(repoPath, state);
  return state;
}
