import type { AuthoringContext, Card, RecentLesson, RecentSkip, RepoRef } from './types.js';
import { listDogfoodEvents } from './dogfood.js';
import { loadTags } from './tagStore.js';
import { listFolderPaths, listSetSummaries, loadSet } from './setStore.js';
import { loadCardsForSet } from './cardStore.js';
import { problemRefIdentity } from './problemRefs.js';

export type BuildContextOptions = {
  goal?: string;
  repo?: RepoRef;
  targetSetId?: string;
  recent?: number;
};

const QUESTION_LIMIT = 240;

function compactQuestion(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= QUESTION_LIMIT) return flat;
  // Truncate from the MIDDLE, not the tail. A well-formed prompt puts setup
  // first and the actual ask last (exactly as the authoring skill instructs),
  // so a plain slice() removes the interrogative - the one part that says what
  // the question is really testing. Keeping both ends preserves the ask.
  const budget = QUESTION_LIMIT - 3;
  const head = Math.floor(budget * 0.6);
  return `${flat.slice(0, head)}...${flat.slice(-(budget - head))}`;
}

function problemIdsOf(setRefs: Card['problemRefs'], cards: readonly Card[]): RecentLesson['problemRefs'] {
  const seen = new Set<string>();
  return [...(setRefs ?? []), ...cards.flatMap((card) => card.problemRefs ?? [])].flatMap((ref) => {
    const identity = problemRefIdentity(ref);
    if (!identity || seen.has(identity.key)) return [];
    seen.add(identity.key);
    return [{ sourceName: identity.sourceName, sourceId: identity.sourceId }];
  });
}

/** `path:start-end` per cited range, deduped and stable-sorted. */
function citedRangesOf(cards: readonly Card[]): string[] {
  const ranges = cards.flatMap((card) =>
    (card.sourceRefs ?? []).map((ref) => `${ref.path}:${ref.startLine}-${ref.endLine}`));
  return Array.from(new Set(ranges)).sort();
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
      citedRanges: citedRangesOf(cards),
      altitudes: Array.from(new Set(cards.flatMap((card) => (card.altitude ? [card.altitude] : [])))).sort(),
      problemRefs: problemIdsOf(set.problemRefs, cards),
      questionSummaries: cards.map((card) => compactQuestion(card.front.prompt)),
      reviewState: { cards: cards.length, due, lapses: cards.reduce((sum, card) => sum + card.fsrs.lapses, 0) },
    } satisfies RecentLesson;
  }));
  return entries
    .filter((entry): entry is RecentLesson => entry !== undefined)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

/** Newest-first `skip` decisions. Best-effort: the event log is append-only
 * JSONL and a malformed line is already skipped by the reader. */
async function recentSkips(root: string, limit: number): Promise<RecentSkip[]> {
  const events = await listDogfoodEvents(root);
  return events
    .flatMap((event) => (event.kind === 'skipped'
      ? [{ ts: event.ts, task: event.task, reason: event.reason }]
      : []))
    .sort((a, b) => b.ts.localeCompare(a.ts))
    .slice(0, limit);
}

export async function buildAuthoringContext(root: string, opts: BuildContextOptions): Promise<AuthoringContext> {
  const limit = Number.isFinite(opts.recent) ? Math.max(0, Math.min(Math.floor(opts.recent!), 50)) : 10;
  const [existingTags, existingSets, folderTree, lessons, skips] = await Promise.all([
    loadTags(root),
    listSetSummaries(root),
    listFolderPaths(root),
    recentLessons(root, limit),
    recentSkips(root, limit),
  ]);
  return {
    ...(opts.goal ? { goal: opts.goal } : {}),
    ...(opts.repo ? { repo: opts.repo } : {}),
    existingSets,
    existingTags,
    folderTree,
    ...(opts.targetSetId ? { targetSetId: opts.targetSetId } : {}),
    recentLessons: lessons,
    recentSkips: skips,
  };
}
