/**
 * Freeze cited code from disk (docs/design/redesign-2026-07/03 sec 5).
 *
 * THE TRUST BOUNDARY. For any card that cites repo code, the agent's own text
 * is discarded and the exact lines are re-read from disk at the current HEAD
 * SHA. Cards without sourceRefs (pure conceptual cards) skip this entirely.
 *
 * Reuses the existing readRange (tools.ts) and getLastCommitSha (git.ts); adds
 * no new dependency. Never throws on a bad ref — it records a status so the
 * card stays reviewable on whatever text it has.
 */

import { readRange } from '../tools.js';
import { getLastCommitSha } from '../git.js';
import { resolveRepoPath } from './repoRegistry.js';
import type { SourceRef } from './types.js';

export type DraftSourceRef = { repoId: string; path: string; startLine: number; endLine: number };

/** Freeze one draft ref. Resolves the repo, reads the SHA, re-reads the lines. */
export async function freezeSourceRef(root: string, ref: DraftSourceRef): Promise<SourceRef> {
  const repoPath = await resolveRepoPath(root, ref.repoId);
  if (!repoPath) {
    return { repoId: ref.repoId, path: ref.path, startLine: ref.startLine, endLine: ref.endLine, commit: '', status: 'missing' };
  }
  let commit = '';
  try {
    commit = await getLastCommitSha(repoPath);
  } catch {
    commit = '';
  }
  try {
    const range = await readRange(repoPath, ref.path, ref.startLine, ref.endLine);
    return {
      repoId: ref.repoId, path: ref.path,
      startLine: range.startLine, endLine: range.endLine,
      commit, frozenText: range.text, status: 'fresh',
    };
  } catch {
    return { repoId: ref.repoId, path: ref.path, startLine: ref.startLine, endLine: ref.endLine, commit, status: 'missing' };
  }
}

/** Freeze all refs on a draft. Empty/undefined input -> [] (conceptual card). */
export async function freezeSourceRefs(root: string, refs?: DraftSourceRef[]): Promise<SourceRef[]> {
  if (!refs || refs.length === 0) return [];
  return Promise.all(refs.map((r) => freezeSourceRef(root, r)));
}
