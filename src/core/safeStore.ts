/**
 * Concurrency-safe state persistence (S8a, doc 05 - concurrent-writer corruption).
 *
 * The base saveState does a plain writeFile: two runs (a scheduled review and a
 * background authoring pass) can interleave and clobber each other, or leave a
 * half-written state.json if the process dies mid-write. This module adds:
 *
 *  1. atomicWriteJson - write to a unique temp file in the same dir, then rename
 *     over the target. rename(2) is atomic on POSIX, so a reader never sees a
 *     partial file and a crash leaves the old state intact.
 *  2. saveStateSafe   - optimistic concurrency: the caller passes the updatedAt
 *     it loaded; if the on-disk updatedAt has moved on, the write is refused with
 *     StateConflictError instead of silently overwriting a concurrent change.
 *
 * Non-destructive: the base store is unchanged; callers opt into the safe path.
 */

import { mkdir, writeFile, rename, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { stateDir, statePath } from './store.js';
import type { TutorState } from './types.js';
import { nowIso } from './util.js';

export class StateConflictError extends Error {
  constructor(public expected: string | undefined, public actual: string | undefined) {
    super(`state changed on disk (expected updatedAt=${expected}, found ${actual}); reload and retry`);
    this.name = 'StateConflictError';
  }
}

/** Atomically write JSON: temp file in the same dir, then rename over target. */
export async function atomicWriteJson(targetPath: string, value: unknown): Promise<void> {
  const dir = targetPath.slice(0, targetPath.lastIndexOf('/')) || '.';
  await mkdir(dir, { recursive: true });
  const tmp = join(dir, `.tmp-${process.pid}-${Math.random().toString(36).slice(2)}.json`);
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`);
  await rename(tmp, targetPath);
}

/** Read the on-disk updatedAt without fully normalizing (used for the version check). */
async function diskUpdatedAt(repoPath: string): Promise<string | undefined> {
  try {
    const parsed = JSON.parse(await readFile(statePath(repoPath), 'utf8')) as Partial<TutorState>;
    return parsed.updatedAt;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

/**
 * Save state with optimistic concurrency + atomic write.
 * `expectedUpdatedAt` is the updatedAt the caller observed when it loaded state.
 * If the on-disk value has since changed, another writer won the race and we
 * throw StateConflictError rather than clobber it. On success the state's
 * updatedAt is stamped fresh and written atomically.
 */
export async function saveStateSafe(
  repoPath: string,
  state: TutorState,
  expectedUpdatedAt: string | undefined,
): Promise<TutorState> {
  await mkdir(stateDir(repoPath), { recursive: true });
  const actual = await diskUpdatedAt(repoPath);
  if (actual !== expectedUpdatedAt) {
    throw new StateConflictError(expectedUpdatedAt, actual);
  }
  const next = { ...state, updatedAt: nowIso() };
  await atomicWriteJson(statePath(repoPath), next);
  return next;
}
