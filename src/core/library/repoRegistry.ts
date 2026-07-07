/**
 * Repo registry (docs/design/redesign-2026-07/02 sec 4). OPTIONAL infra:
 * conceptual sets have no repo. Maps a stable repoId -> current path, so
 * repo-grounded cards stay anchored when a folder moves. Stored at
 * repos/registry.json.
 */

import type { RepoRef } from './types.js';
import { readJson, writeJson } from './io.js';
import { libraryPaths } from './libraryStore.js';
import { normalizeRepoPath, nowIso, stableId } from '../util.js';

type RegistryFile = { version: 1; repos: RepoRef[] };

export async function loadRepos(root: string): Promise<RepoRef[]> {
  const file = await readJson<RegistryFile>(libraryPaths(root).reposRegistry);
  return file?.repos ?? [];
}

export async function saveRepos(root: string, repos: RepoRef[]): Promise<void> {
  await writeJson(libraryPaths(root).reposRegistry, { version: 1, repos } satisfies RegistryFile);
}

/** Register (or refresh) a repo by path, returning its stable id. Idempotent. */
export async function registerRepo(root: string, repoPath: string, label?: string): Promise<RepoRef> {
  const normalizedPath = normalizeRepoPath(repoPath);
  const repos = await loadRepos(root);
  const existing = repos.find((r) => r.normalizedPath === normalizedPath);
  if (existing) {
    existing.lastSeenAt = nowIso();
    existing.status = 'active';
    if (label) existing.label = label;
    await saveRepos(root, repos);
    return existing;
  }
  const ref: RepoRef = {
    id: stableId('repo', normalizedPath),
    normalizedPath,
    label: label ?? normalizedPath.split('/').pop() ?? normalizedPath,
    status: 'active',
    createdAt: nowIso(),
    lastSeenAt: nowIso(),
  };
  await saveRepos(root, [...repos, ref]);
  return ref;
}

/** Resolve a repoId to its current path, or undefined if unknown/deleted. */
export async function resolveRepoPath(root: string, repoId: string): Promise<string | undefined> {
  const repo = (await loadRepos(root)).find((r) => r.id === repoId);
  return repo && repo.status !== 'deleted' ? repo.normalizedPath : undefined;
}
