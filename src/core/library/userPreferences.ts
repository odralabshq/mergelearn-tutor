import { libraryPaths } from './libraryStore.js';
import { readJson, writeJson } from './io.js';

export type QueueStrategy = 'overdue' | 'interleaved';
export type UserPreferences = { reviewSessionCap: number; queueStrategy: QueueStrategy };
type StoredPreferences = Partial<UserPreferences> & { dailyReviewCap?: number };

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  reviewSessionCap: 60,
  queueStrategy: 'interleaved',
};

function normalize(value?: StoredPreferences): UserPreferences {
  const cap = Number(value?.reviewSessionCap ?? value?.dailyReviewCap);
  return {
    reviewSessionCap: Number.isInteger(cap) && cap >= 0 ? cap : DEFAULT_USER_PREFERENCES.reviewSessionCap,
    queueStrategy: value?.queueStrategy === 'overdue' ? 'overdue' : 'interleaved',
  };
}

export async function loadUserPreferences(root: string): Promise<UserPreferences> {
  return normalize(await readJson<StoredPreferences>(libraryPaths(root).userFile));
}

export async function saveUserPreferences(root: string, value: UserPreferences): Promise<void> {
  await writeJson(libraryPaths(root).userFile, normalize(value));
}
