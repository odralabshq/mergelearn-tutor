import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { QuestionPlane, UserPreferences } from './types.js';

export type PreferencesInput = Omit<Partial<UserPreferences>, 'review'> & {
  review?: Partial<UserPreferences['review']>;
};

export const DEFAULT_ENABLED_PLANES: QuestionPlane[] = [
  'local_behavior',
  'language_mechanics',
  'risk_and_tests',
  'file_role',
  'architecture_flow',
  'repo_domain',
];

export const DEFAULT_PREFERENCES: UserPreferences = {
  version: 1,
  review: {
    mode: 'snippet_first',
    enabledPlanes: DEFAULT_ENABLED_PLANES,
    defaultPlane: 'local_behavior',
    snippetLineCount: 14,
    showExplanationsByDefault: false,
    preferSourceOverDocs: true,
  },
};

export function preferencesPath(repoPath: string): string {
  return path.join(repoPath, '.skilltrace', 'preferences.json');
}

export function normalizePreferences(input: PreferencesInput | undefined): UserPreferences {
  const review: Partial<UserPreferences['review']> = input?.review ?? {};
  const enabledPlanes = (review.enabledPlanes ?? DEFAULT_ENABLED_PLANES).filter(isQuestionPlane);
  return {
    version: 1,
    review: {
      mode: review.mode === 'concept_first' ? 'concept_first' : 'snippet_first',
      enabledPlanes: enabledPlanes.length ? enabledPlanes : DEFAULT_ENABLED_PLANES,
      defaultPlane: isQuestionPlane(review.defaultPlane) ? review.defaultPlane : 'local_behavior',
      snippetLineCount: clampInt(review.snippetLineCount, 4, 40, 14),
      showExplanationsByDefault: Boolean(review.showExplanationsByDefault),
      preferSourceOverDocs: review.preferSourceOverDocs !== false,
    },
  };
}

export async function loadPreferences(repoPath: string): Promise<UserPreferences> {
  try {
    return normalizePreferences(JSON.parse(await readFile(preferencesPath(repoPath), 'utf8')) as Partial<UserPreferences>);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return DEFAULT_PREFERENCES;
    throw error;
  }
}

export async function savePreferences(repoPath: string, preferences: UserPreferences): Promise<void> {
  const normalized = normalizePreferences(preferences);
  await mkdir(path.dirname(preferencesPath(repoPath)), { recursive: true });
  await writeFile(preferencesPath(repoPath), `${JSON.stringify(normalized, null, 2)}\n`);
}

export function isQuestionPlane(value: unknown): value is QuestionPlane {
  return typeof value === 'string' && DEFAULT_ENABLED_PLANES.includes(value as QuestionPlane);
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}
