/**
 * Read-back over persisted review sessions (docs/design/redesign-2026-07/10 §9.2).
 *
 * Sessions are written per-day by session.ts (endSession) and incrementally by
 * the server (persistSession). Nothing read them back until lesson progress
 * needed it. This module walks profile/sessions/<day>/session_*.json and derives
 * durable, restart-safe lesson progress with no new storage or schema change.
 */

import { join } from 'node:path';

import type { ReviewSession } from '../types.js';
import { readJson, listDir } from '../io.js';
import { libraryPaths } from '../libraryStore.js';

/** Read every persisted session. Best-effort: a single unreadable or malformed
 * session file is skipped, never thrown, so one bad file can't blank progress. */
export async function listSessions(root: string): Promise<ReviewSession[]> {
  const base = libraryPaths(root).sessionsDir;
  const days = await listDir(base);
  const out: ReviewSession[] = [];
  for (const day of days) {
    const files = await listDir(join(base, day));
    for (const f of files) {
      if (!f.startsWith('session_') || !f.endsWith('.json')) continue;
      try {
        const s = await readJson<ReviewSession>(join(base, day, f));
        if (s && typeof s.id === 'string' && Array.isArray(s.events)) out.push(s);
      } catch {
        // Skip a corrupt/partial session file rather than failing the whole read.
      }
    }
  }
  return out;
}

/** Union of card ids attempted in LESSON sessions for one set. A card counts as
 * attempted once any lesson session for the set recorded a ReviewEvent for it.
 * Non-lesson sessions and other sets are ignored. */
export async function attemptedCardIds(root: string, setId: string): Promise<Set<string>> {
  return (await attemptedByLessonSet(root)).get(setId) ?? new Set<string>();
}

/** One walk over all sessions -> a map of setId -> attempted card ids, counting
 * lesson sessions only. Lets the Home page derive progress for every set from a
 * single read instead of re-walking the session tree once per set. */
export async function attemptedByLessonSet(root: string): Promise<Map<string, Set<string>>> {
  const sessions = await listSessions(root);
  const map = new Map<string, Set<string>>();
  for (const s of sessions) {
    if (s.mode !== 'lesson') continue;
    const setId = s.filter?.setIds?.[0];
    if (!setId) continue;
    let ids = map.get(setId);
    if (!ids) { ids = new Set<string>(); map.set(setId, ids); }
    for (const e of s.events) if (e?.cardId) ids.add(e.cardId);
  }
  return map;
}

export type LessonState = 'not_started' | 'in_progress' | 'completed';

export interface LessonProgress {
  attemptedCount: number;      // active cards attempted (capped at total)
  total: number;               // active cards in the set
  state: LessonState;
  resumeCardId: string | null; // first active card, authored order, not attempted
}

/** Derive lesson progress from the authored-order active card ids and the set
 * of attempted card ids. Pure: no IO, so it is trivial to unit test. */
export function computeLessonProgress(
  orderedActiveCardIds: string[],
  attempted: Set<string>,
): LessonProgress {
  const total = orderedActiveCardIds.length;
  let attemptedCount = 0;
  let resumeCardId: string | null = null;
  for (const id of orderedActiveCardIds) {
    if (attempted.has(id)) attemptedCount += 1;
    else if (resumeCardId === null) resumeCardId = id;
  }
  const state: LessonState =
    total > 0 && attemptedCount >= total ? 'completed'
    : attemptedCount === 0 ? 'not_started'
    : 'in_progress';
  return { attemptedCount, total, state, resumeCardId };
}
