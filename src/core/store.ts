import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { TutorState } from './types.js';
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
    learningEvents: [],
    corrections: [],
  };
}

function normalizeState(state: TutorState): TutorState {
  return {
    ...state,
    artifacts: state.artifacts ?? [],
    concepts: state.concepts ?? [],
    conceptStates: state.conceptStates ?? [],
    learningItems: state.learningItems ?? [],
    learningEvents: state.learningEvents ?? [],
    corrections: state.corrections ?? [],
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
