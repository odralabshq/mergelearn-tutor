/**
 * Drift: has the code a card cites moved out from under it?
 *
 * Import freezes cited lines from disk at a known SHA (freezeSources.ts). That
 * snapshot is what keeps a lesson stable and reviewable — but it also means a
 * card can silently become a question about code that no longer exists. This
 * module re-checks frozen citations against the repo as it stands now, using
 * the same read primitives as the freeze path so both agree on what "the same
 * lines" means.
 *
 * Four outcomes, ordered by how badly they undermine the card:
 *   missing          the repo is unregistered, or the file/lines are gone
 *   orphaned_commit  the SHA no longer names a commit (rebase, amend, force-push)
 *   drifted          the lines still exist but no longer match the frozen text
 *   fresh            the citation still holds
 *
 * Read-only and never throws on a bad citation: a card whose source rotted is
 * still a card, and the learner decides whether to keep it. `check` reports;
 * `prune` acts.
 */

import { listSetIds } from './setStore.js';
import { loadCardsForSet } from './cardStore.js';
import { commitExists, readRange } from './repoRead.js';
import { resolveRepoPath } from './repoRegistry.js';
import type { Card, SourceRef, SourceRefStatus } from './types.js';

export type RefDrift = {
  path: string;
  startLine?: number;
  endLine?: number;
  commit: string;
  /** Status recorded at import time, kept so a caller can see what changed. */
  frozenStatus?: SourceRefStatus;
  status: SourceRefStatus;
  detail: string;
};

export type CardDrift = {
  setId: string;
  cardId: string;
  prompt: string;
  archived: boolean;
  /** The worst status across this card's citations. */
  status: Exclude<SourceRefStatus, 'fresh'>;
  refs: RefDrift[];
};

export type DriftReport = {
  /** Cards examined (grounded + conceptual). */
  cardsChecked: number;
  /** Cards that cite repo code; only these can drift. */
  groundedCards: number;
  /** Grounded cards with at least one non-fresh citation, worst first. */
  stale: CardDrift[];
};

export type DriftOptions = {
  /** Include archived cards. Default false — they are already out of the queue. */
  includeArchived?: boolean;
  /** Restrict to one set. */
  setId?: string;
};

/** Worse statuses sort first, so `check` leads with what is most broken. */
const SEVERITY: Record<SourceRefStatus, number> = {
  missing: 3,
  orphaned_commit: 2,
  drifted: 1,
  fresh: 0,
};

/** Per-run cache: several refs usually share a repo, and git spawns are not free. */
type RepoCache = {
  path: Map<string, string | undefined>;
  commit: Map<string, boolean>;
};

async function repoPathFor(root: string, repoId: string, cache: RepoCache): Promise<string | undefined> {
  if (!cache.path.has(repoId)) cache.path.set(repoId, await resolveRepoPath(root, repoId));
  return cache.path.get(repoId);
}

async function commitStillExists(repoPath: string, commit: string, cache: RepoCache): Promise<boolean> {
  const key = `${repoPath}@${commit}`;
  if (!cache.commit.has(key)) cache.commit.set(key, await commitExists(repoPath, commit));
  return cache.commit.get(key)!;
}

async function checkRef(root: string, ref: SourceRef, cache: RepoCache): Promise<RefDrift> {
  const base: Omit<RefDrift, 'status' | 'detail'> = {
    path: ref.path,
    startLine: ref.startLine,
    endLine: ref.endLine,
    commit: ref.commit,
    frozenStatus: ref.status,
  };

  const repoPath = await repoPathFor(root, ref.repoId, cache);
  if (!repoPath) {
    return { ...base, status: 'missing', detail: `repo ${ref.repoId} is not registered on this machine` };
  }

  // A citation whose commit is gone cannot be verified even if the file reads
  // the same today, so report it before comparing text.
  if (ref.commit && !(await commitStillExists(repoPath, ref.commit, cache))) {
    return { ...base, status: 'orphaned_commit', detail: `commit ${ref.commit.slice(0, 8)} no longer exists in the repo` };
  }

  let current: string;
  try {
    const range = await readRange(repoPath, ref.path, ref.startLine ?? 1, ref.endLine ?? ref.startLine ?? 1);
    current = range.text;
  } catch {
    return { ...base, status: 'missing', detail: `${ref.path} cannot be read at the cited lines` };
  }

  // Legacy refs carry no frozen text; existence is all we can honestly assert.
  if (ref.frozenText === undefined) {
    return { ...base, status: 'fresh', detail: 'no frozen text to compare; file and commit still resolve' };
  }

  if (current !== ref.frozenText) {
    return { ...base, status: 'drifted', detail: `${ref.path}:${ref.startLine}-${ref.endLine} no longer matches the frozen snippet` };
  }

  return { ...base, status: 'fresh', detail: 'matches the frozen snippet' };
}

function worst(refs: RefDrift[]): SourceRefStatus {
  return refs.reduce<SourceRefStatus>(
    (acc, ref) => (SEVERITY[ref.status] > SEVERITY[acc] ? ref.status : acc),
    'fresh',
  );
}

async function cardsToCheck(root: string, options: DriftOptions): Promise<Card[]> {
  const setIds = options.setId ? [options.setId] : await listSetIds(root);
  const cards: Card[] = [];
  for (const setId of setIds) cards.push(...(await loadCardsForSet(root, setId)));
  return options.includeArchived ? cards : cards.filter((card) => card.status !== 'archived');
}

/** Re-verify every frozen citation in the library against the repos on disk. */
export async function checkDrift(root: string, options: DriftOptions = {}): Promise<DriftReport> {
  const cards = await cardsToCheck(root, options);
  const cache: RepoCache = { path: new Map(), commit: new Map() };
  const stale: CardDrift[] = [];
  let groundedCards = 0;

  for (const card of cards) {
    const refs = card.sourceRefs ?? [];
    if (refs.length === 0) continue; // conceptual card: nothing to drift
    groundedCards += 1;

    const checked = await Promise.all(refs.map((ref) => checkRef(root, ref, cache)));
    const status = worst(checked);
    if (status === 'fresh') continue;

    stale.push({
      setId: card.setId,
      cardId: card.id,
      prompt: card.front.prompt,
      archived: card.status === 'archived',
      status,
      refs: checked.filter((ref) => ref.status !== 'fresh'),
    });
  }

  stale.sort((a, b) => SEVERITY[b.status] - SEVERITY[a.status]
    || a.setId.localeCompare(b.setId)
    || a.cardId.localeCompare(b.cardId));

  return { cardsChecked: cards.length, groundedCards, stale };
}
