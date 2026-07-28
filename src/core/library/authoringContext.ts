import type { AuthoringContext, RecentLesson, RepoRef } from './types.js';
import { loadTags } from './tagStore.js';
import { listFolderPaths, listSetSummaries, loadSet } from './setStore.js';
import { loadCardsForSet } from './cardStore.js';

export type BuildContextOptions = {
  goal?: string;
  repo?: RepoRef;
  targetSetId?: string;
  recent?: number;
};

const QUESTION_LIMIT = 120;

function compactQuestion(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, QUESTION_LIMIT);
}

async function recentLessons(root: string, limit: number): Promise<RecentLesson[]> {
  const summaries = await listSetSummaries(root);
  const entries = await Promise.all(summaries.map(async (summary): Promise<RecentLesson | undefined> => {
    const [set, cards] = await Promise.all([loadSet(root, summary.id), loadCardsForSet(root, summary.id)]);
    if (!set) return undefined;
    const citedPaths = Array.from(new Set(cards.flatMap((card) => card.sourceRefs?.map((ref) => ref.path) ?? []))).sort();
    const due = cards.filter((card) => new Date(card.fsrs.due).getTime() <= Date.now()).length;
    return {
      setId: set.id,
      title: set.title,
      objective: set.objective,
      createdAt: set.createdAt,
      tagIds: set.tagIds,
      citedPaths,
      questionSummaries: cards.map((card) => compactQuestion(card.front.prompt)),
      reviewState: { cards: cards.length, due, lapses: cards.reduce((sum, card) => sum + card.fsrs.lapses, 0) },
    } satisfies RecentLesson;
  }));
  return entries
    .filter((entry): entry is RecentLesson => entry !== undefined)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export async function buildAuthoringContext(root: string, opts: BuildContextOptions): Promise<AuthoringContext> {
  const limit = Number.isFinite(opts.recent) ? Math.max(0, Math.min(Math.floor(opts.recent!), 50)) : 10;
  const [existingTags, existingSets, folderTree, lessons] = await Promise.all([
    loadTags(root),
    listSetSummaries(root),
    listFolderPaths(root),
    recentLessons(root, limit),
  ]);
  return {
    ...(opts.goal ? { goal: opts.goal } : {}),
    ...(opts.repo ? { repo: opts.repo } : {}),
    existingSets,
    existingTags,
    folderTree,
    ...(opts.targetSetId ? { targetSetId: opts.targetSetId } : {}),
    recentLessons: lessons,
  };
}
