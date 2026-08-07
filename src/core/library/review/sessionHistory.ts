/**
 * Read-back over persisted review sessions (docs/design/redesign-2026-07/10 §9.2).
 *
 * Sessions are written per-day by session.ts (endSession) and incrementally by
 * the server (persistSession). Nothing read them back until lesson progress
 * needed it. This module walks profile/sessions/<day>/session_*.json and derives
 * durable, restart-safe lesson progress with no new storage or schema change.
 */

import { join } from 'node:path';

import type { ReviewEvent, ReviewSession } from '../types.js';
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

export type LessonEvidenceClass = 'self_assessed' | 'deterministic';
export type LessonEvidence = Map<string, LessonEvidenceClass>;

function classifyLessonEvent(event: ReviewEvent): LessonEvidenceClass | null {
  if (event.resultClass === 'evidence' || event.rating === 1) return null;
  if (event.attempt?.correct !== undefined) {
    return event.attempt.correct ? 'deterministic' : null;
  }
  return event.rating >= 2 && event.rating <= 4 ? 'self_assessed' : null;
}

/** Derive each card's strongest live evidence from persisted lesson sessions. */
export async function lessonEvidenceBySet(root: string): Promise<Map<string, LessonEvidence>> {
  const map = new Map<string, LessonEvidence>();
  for (const session of await listSessions(root)) {
    if (session.mode !== 'lesson') continue;
    const setId = session.filter?.setIds?.[0];
    if (!setId) continue;
    const tombstones = new Set((session.plan?.gradeLedger ?? [])
      .filter((entry) => entry.error?.code === 'request_undone').map((entry) => entry.requestId));
    let evidence = map.get(setId);
    if (!evidence) { evidence = new Map(); map.set(setId, evidence); }
    for (const event of session.events) {
      if (!event?.cardId || (event.requestId && tombstones.has(event.requestId))) continue;
      if (event.resultClass !== undefined
        ? event.resultClass !== 'scheduled'
        : session.plan !== undefined) continue;
      const next = classifyLessonEvent(event);
      if (!next || evidence.get(event.cardId) === 'deterministic') continue;
      evidence.set(event.cardId, next);
    }
  }
  return map;
}

export async function lessonEvidenceForSet(root: string, setId: string): Promise<LessonEvidence> {
  return (await lessonEvidenceBySet(root)).get(setId) ?? new Map();
}

export type LessonState = 'not_started' | 'in_progress' | 'completed';

export interface LessonProgress {
  passedCount: number;
  deterministicCount: number;
  selfAssessedCount: number;
  total: number;
  state: LessonState;
  resumeCardId: string | null;
}

/** Derive lesson progress from authored-order active card ids and strongest evidence. */
export function computeLessonProgress(
  orderedActiveCardIds: string[],
  evidence: LessonEvidence,
): LessonProgress {
  const total = orderedActiveCardIds.length;
  let deterministicCount = 0;
  let selfAssessedCount = 0;
  let resumeCardId: string | null = null;
  for (const id of orderedActiveCardIds) {
    const evidenceClass = evidence.get(id);
    if (evidenceClass === 'deterministic') deterministicCount += 1;
    else if (evidenceClass === 'self_assessed') selfAssessedCount += 1;
    else if (resumeCardId === null) resumeCardId = id;
  }
  const passedCount = deterministicCount + selfAssessedCount;
  const state: LessonState =
    total > 0 && passedCount >= total ? 'completed'
    : passedCount === 0 ? 'not_started'
    : 'in_progress';
  return { passedCount, deterministicCount, selfAssessedCount, total, state, resumeCardId };
}
