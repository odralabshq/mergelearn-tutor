import { libraryPaths } from './libraryStore.js';
import { readJson, writeJson } from './io.js';

export type QueueStrategy = 'overdue' | 'interleaved';
export type UserPreferences = { dailyReviewCap: number; queueStrategy: QueueStrategy };

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  dailyReviewCap: 60,
  queueStrategy: 'interleaved',
};

function normalize(value?: Partial<UserPreferences>): UserPreferences {
  const cap = Number(value?.dailyReviewCap);
  return {
    dailyReviewCap: Number.isInteger(cap) && cap >= 0 ? cap : DEFAULT_USER_PREFERENCES.dailyReviewCap,
    queueStrategy: value?.queueStrategy === 'overdue' ? 'overdue' : 'interleaved',
  };
}

export async function loadUserPreferences(root: string): Promise<UserPreferences> {
  return normalize(await readJson<Partial<UserPreferences>>(libraryPaths(root).userFile));
}

export async function saveUserPreferences(root: string, value: UserPreferences): Promise<void> {
  await writeJson(libraryPaths(root).userFile, normalize(value));
}
