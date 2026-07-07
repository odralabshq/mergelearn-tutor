/**
 * Build the AuthoringContext (docs/design/redesign-2026-07/03 sec 2) — the
 * tutor's half of the handshake. Emitted to the connected agent BEFORE it
 * authors, so it reuses existing tags/folders instead of inventing synonyms.
 * This is the mechanism that prevents blind tagging.
 */

import type { AuthoringContext, RepoRef } from './types.js';
import { loadTags } from './tagStore.js';
import { listSetSummaries, listFolderPaths } from './setStore.js';

export type BuildContextOptions = {
  goal: string;
  repo?: RepoRef;
  targetSetId?: string;
};

/** Assemble the context an agent needs to author a set patch coherently. */
export async function buildAuthoringContext(root: string, opts: BuildContextOptions): Promise<AuthoringContext> {
  const [existingTags, existingSets, folderTree] = await Promise.all([
    loadTags(root),
    listSetSummaries(root),
    listFolderPaths(root),
  ]);
  return {
    goal: opts.goal,
    repo: opts.repo,
    existingSets,
    existingTags,
    folderTree,
    targetSetId: opts.targetSetId,
  };
}
