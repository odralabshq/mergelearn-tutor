/**
 * Review sessions (docs/design/redesign-2026-07/01 sec 7, 04 Practice).
 *
 * A session is one review sitting. Grading advances a card's embedded FSRS
 * state (fsrs.ts), records a ReviewEvent, and — on end — persists the session
 * as a per-day file under profile/sessions/<YYYY-MM-DD>/session_<ts>.json.
 * History is grouped by sitting, never a single global log.
 */

import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import type {
  Card, Confidence, PlannedGradeResponse, PlannedUndoRequest, PlannedUndoResponse, ReviewAttempt, ReviewEvent,
  ReviewRating, ReviewSession, PlannedSessionState,
} from '../types.js';
import { gradeFsrs } from '../fsrs.js';
import { loadCard, saveCard } from '../cardStore.js';
import { libraryPaths } from '../libraryStore.js';
import { writeJson } from '../io.js';
import { stableId } from '../../util.js';
import { planRequeue } from '../../../session/requeue.js';

/** Begin an in-memory session. Persisted only on endSession. */
export function startSession(
  mode: ReviewSession['mode'],
  filter?: ReviewSession['filter'],
  now = new Date(),
): ReviewSession {
  const startedAt = now.toISOString();
  return {
    id: stableId('session', `${startedAt}:${Math.random()}`),
    startedAt,
    mode,
    filter,
    events: [],
    summary: { reviewedCount: 0, distinctCardCount: 0, again: 0, hard: 0, good: 0, easy: 0 },
  };
}

const MAX_PLANNED_CARDS = 128;

export type PlannedGradeRequest = {
  requestId: string;
  revision: number;
  entryId: string;
  setId: string;
  cardId: string;
  rating: ReviewRating;
  confidenceBeforeReveal?: Confidence;
  attempt?: ReviewAttempt;
};

export type PlannedGradeHooks = {
  afterIntent?: () => void | Promise<void>;
  afterCard?: () => void | Promise<void>;
  assertOwnership?: () => Promise<void>;
};

type WriteGuard = () => Promise<void>;
const unguardedWrite: WriteGuard = async () => {};

export class PlannedSessionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly session: ReviewSession,
  ) {
    super(message);
    this.name = 'PlannedSessionError';
  }
}

/** Create one immutable, bounded first-pass plan. Legacy sessions continue to
 * use startSession and therefore have no plan. */
export function startPlannedSession(
  mode: ReviewSession['mode'],
  planMode: NonNullable<ReviewSession['plan']>['mode'],
  cards: readonly Card[],
  filter?: ReviewSession['filter'],
  now = new Date(),
  sourceCount = cards.length,
): ReviewSession {
  const session = startSession(mode, filter, now);
  const seen = new Set<string>();
  const selected = cards.filter((card) => {
    const key = `${card.setId}/${card.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, MAX_PLANNED_CARDS);
  const entries = selected.map((card, index) => ({
    id: stableId('entry', `${session.id}:${index}:${card.setId}/${card.id}`),
    setId: card.setId,
    cardId: card.id,
    pass: 'first' as const,
  }));
  session.plan = {
    version: 1,
    mode: planMode,
    entries,
    revision: 0,
    ...(entries[0] ? { currentEntryId: entries[0].id } : {}),
    gradeLedger: [],
    undoLedger: [],
    requestBudget: 512,
    sourceCount,
    backlogCount: Math.max(0, sourceCount - entries.length),
    unresolvedEntryIds: [],
  };
  return session;
}

/** Advance missing or inactive entries without consuming a request identity. */
export async function advanceUnavailableEntries(
  root: string,
  session: ReviewSession,
  assertOwnership: WriteGuard = unguardedWrite,
): Promise<number> {
  if (session.pendingTransition) await recoverPendingGrade(root, session, assertOwnership);
  const plan = session.plan ? structuredClone(session.plan) : undefined;
  if (!plan || session.endedAt) return 0;
  let advanced = 0;
  while (plan.currentEntryId) {
    const index = plan.entries.findIndex((entry) => entry.id === plan.currentEntryId);
    if (index < 0) break;
    const entry = plan.entries[index];
    const card = await loadCard(root, entry.setId, entry.cardId);
    if (card?.status === 'active') break;
    const next = plan.entries[index + 1];
    if (next) plan.currentEntryId = next.id;
    else delete plan.currentEntryId;
    plan.revision += 1;
    plan.unresolvedEntryIds ??= [];
    if (entry.pass === 'first' && !plan.unresolvedEntryIds.includes(entry.id)) {
      plan.unresolvedEntryIds.push(entry.id);
    }
    advanced += 1;
  }
  if (advanced > 0) {
    const summary = recomputeSummary(session.events, plan.unresolvedEntryIds?.length ?? 0);
    await assertOwnership();
    await writeJson(plannedSessionPath(root, session), { ...session, plan, summary });
    session.plan = plan;
    session.summary = summary;
  }
  return advanced;
}

function semanticGradeKey(request: PlannedGradeRequest): string {
  return JSON.stringify([
    request.setId, request.cardId, request.rating, request.revision, request.entryId,
  ]);
}

function requestLedgerSize(plan: PlannedSessionState): number {
  return plan.gradeLedger.length + (plan.undoLedger?.length ?? 0);
}

function plannedSessionPath(root: string, session: ReviewSession): string {
  const day = session.startedAt.slice(0, 10);
  const stamp = session.startedAt.replace(/[:.]/g, '-');
  return join(libraryPaths(root).sessionDayDir(day), `session_${stamp}.json`);
}

function sameCardImage(left: Card, right: Card): boolean {
  return isDeepStrictEqual(left, right);
}

async function finalizePendingGrade(
  root: string,
  session: ReviewSession,
  assertOwnership: WriteGuard,
): Promise<void> {
  const pending = session.pendingTransition;
  if (!pending) return;
  const plan = structuredClone(pending.planAfter);
  const events = pending.kind === 'grade'
    ? [...session.events, structuredClone(pending.event)]
    : structuredClone(pending.eventsAfter);
  const summary = structuredClone(pending.summaryAfter);
  if (pending.kind === 'grade') {
    plan.gradeLedger.push({
      requestId: pending.requestId,
      semanticKey: pending.semanticKey,
      response: structuredClone(pending.response),
    });
  }
  const persisted = { ...session, plan, events, summary };
  delete persisted.pendingTransition;
  await assertOwnership();
  await writeJson(plannedSessionPath(root, session), persisted);
  session.plan = plan;
  session.events = events;
  session.summary = summary;
  delete session.pendingTransition;
}

async function recoverPendingGrade(
  root: string,
  session: ReviewSession,
  assertOwnership: WriteGuard,
): Promise<{ transition: NonNullable<ReviewSession['pendingTransition']>; diverged: boolean } | undefined> {
  const pending = session.pendingTransition;
  if (!pending) return undefined;
  const current = await loadCard(root, pending.beforeCard.setId, pending.beforeCard.id);
  if (!current || (!sameCardImage(current, pending.beforeCard) && !sameCardImage(current, pending.afterCard))) {
    const plan = session.plan ? structuredClone(session.plan) : undefined;
    if (pending.kind === 'grade') {
      plan?.gradeLedger.push({
        requestId: pending.requestId,
        semanticKey: pending.semanticKey,
        error: { code: 'transition_diverged' },
      });
    } else if (plan) {
      plan.undoLedger ??= [];
      if (!plan.undoLedger.some((item) => item.requestId === pending.requestId)) {
        plan.undoLedger.push({
          requestId: pending.requestId, semanticKey: pending.semanticKey,
          error: { code: 'transition_diverged' },
        });
      }
    }
    const persisted = { ...session, ...(plan ? { plan } : {}) };
    delete persisted.pendingTransition;
    await assertOwnership();
    await writeJson(plannedSessionPath(root, session), persisted);
    if (plan) session.plan = plan;
    delete session.pendingTransition;
    return { transition: pending, diverged: true };
  }
  if (sameCardImage(current, pending.beforeCard)) {
    await assertOwnership();
    await saveCard(root, pending.afterCard);
  }
  await finalizePendingGrade(root, session, assertOwnership);
  return { transition: pending, diverged: false };
}

/** Resolve prepared work before resume-time cursor traversal or projection. */
export async function recoverPlannedSession(
  root: string,
  session: ReviewSession,
  assertOwnership: WriteGuard = unguardedWrite,
): Promise<void> {
  await recoverPendingGrade(root, session, assertOwnership);
}

/** Admit and schedule one planned first-pass grade. Replay checks precede
 * revision admission so a lost response stays replayable after advancement. */
export async function gradePlannedSession(
  root: string,
  session: ReviewSession,
  request: PlannedGradeRequest,
  now = new Date(),
  hooks: PlannedGradeHooks = {},
): Promise<PlannedGradeResponse> {
  const assertOwnership = hooks.assertOwnership ?? unguardedWrite;
  const beforeRecoveryPlan = session.plan;
  if (!beforeRecoveryPlan) throw new PlannedSessionError('legacy_session', 'legacy session is end-only', session);
  const semanticKey = semanticGradeKey(request);
  if (session.endedAt) {
    const sameId = beforeRecoveryPlan.gradeLedger.find((item) => item.requestId === request.requestId);
    if (sameId) {
      if (sameId.error?.code === 'request_undone') {
        throw new PlannedSessionError('request_undone', 'the original grade was undone', session);
      }
      if (sameId.semanticKey !== semanticKey) {
        throw new PlannedSessionError('request_id_conflict', 'request id was already used for another grade', session);
      }
      if (sameId.error) {
        throw new PlannedSessionError(sameId.error.code, 'the original session transition did not complete', session);
      }
      return { ...sameId.response, replayed: true };
    }
    const sameGrade = beforeRecoveryPlan.gradeLedger.find((item) => item.semanticKey === semanticKey && item.response);
    if (sameGrade?.response) return { ...sameGrade.response, replayed: true };
    throw new PlannedSessionError('session_ended', 'session already ended', session);
  }
  await recoverPendingGrade(root, session, assertOwnership);
  const plan = session.plan;
  if (!plan) throw new PlannedSessionError('legacy_session', 'legacy session is end-only', session);
  const sameId = plan.gradeLedger.find((item) => item.requestId === request.requestId);
  if (sameId) {
    if (sameId.error?.code === 'request_undone') {
      throw new PlannedSessionError('request_undone', 'the original session transition was undone', session);
    }
    if (sameId.semanticKey !== semanticKey) {
      throw new PlannedSessionError('request_id_conflict', 'request id was already used for another grade', session);
    }
    if (sameId.error) {
      throw new PlannedSessionError(sameId.error.code, 'the original session transition did not complete', session);
    }
    return { ...sameId.response, replayed: true };
  }
  const sameGrade = plan.gradeLedger.find((item) => item.semanticKey === semanticKey && item.response);
  if (sameGrade?.response) return { ...sameGrade.response, replayed: true };
  if (requestLedgerSize(plan) >= plan.requestBudget) {
    const planAfter = structuredClone(plan);
    planAfter.terminalReason = 'request_budget_exhausted';
    delete planAfter.currentEntryId;
    const endedAt = now.toISOString();
    await assertOwnership();
    await writeJson(plannedSessionPath(root, session), { ...session, plan: planAfter, endedAt });
    session.plan = planAfter;
    session.endedAt = endedAt;
    throw new PlannedSessionError('request_budget_exhausted', 'session request budget exhausted', session);
  }
  if (request.revision !== plan.revision) {
    throw new PlannedSessionError('stale_revision', 'session revision changed', session);
  }
  const entry = plan.entries.find((item) => item.id === plan.currentEntryId);
  if (!entry || request.entryId !== entry.id) {
    throw new PlannedSessionError('stale_entry', 'session entry changed', session);
  }
  if (request.setId !== entry.setId || request.cardId !== entry.cardId) {
    throw new PlannedSessionError('entry_mismatch', 'card does not match the current entry', session);
  }
  const card = await loadCard(root, entry.setId, entry.cardId);
  if (!card || card.status !== 'active') {
    const planAfter = structuredClone(plan);
    const entryIndex = planAfter.entries.findIndex((item) => item.id === entry.id);
    const next = planAfter.entries[entryIndex + 1];
    planAfter.revision += 1;
    if (next) planAfter.currentEntryId = next.id;
    else delete planAfter.currentEntryId;
    planAfter.unresolvedEntryIds ??= [];
    if (entry.pass === 'first' && !planAfter.unresolvedEntryIds.includes(entry.id)) {
      planAfter.unresolvedEntryIds.push(entry.id);
    }
    const summary = recomputeSummary(session.events, planAfter.unresolvedEntryIds.length);
    await assertOwnership();
    await writeJson(plannedSessionPath(root, session), { ...session, plan: planAfter, summary });
    session.plan = planAfter;
    session.summary = summary;
    throw new PlannedSessionError('card_unavailable', 'card is no longer active', session);
  }
  const resultClass = entry.pass === 'first' ? 'scheduled' : 'evidence';
  const planAfter = structuredClone(plan);
  let requeued = false;
  if (request.rating === 1 && plan.mode !== 'study_once') {
    const revisitCount = planAfter.entries.filter((item) => item.setId === entry.setId
      && item.cardId === entry.cardId && item.pass === 'revisit').length;
    const entryIndex = planAfter.entries.findIndex((item) => item.id === entry.id);
    const requeue = planRequeue(planAfter.entries.length, entryIndex, revisitCount);
    if (requeue) {
      planAfter.entries.splice(requeue.insertAt, 0, {
        id: stableId('entry', `${session.id}:revisit:${entry.setId}/${entry.cardId}:${revisitCount + 1}`),
        setId: entry.setId, cardId: entry.cardId, pass: 'revisit',
      });
      requeued = true;
    }
  }
  planAfter.revision += 1;
  const next = planAfter.entries[planAfter.entries.findIndex((item) => item.id === entry.id) + 1];
  if (next) planAfter.currentEntryId = next.id;
  else delete planAfter.currentEntryId;

  if (entry.pass === 'first') {
    const nextFsrs = gradeFsrs(card.fsrs, request.rating, now);
    const afterCard: Card = { ...card, fsrs: nextFsrs, updatedAt: now.toISOString() };
    const event: ReviewEvent = {
      cardId: card.id, setId: card.setId,
      fsrsBefore: structuredClone(card.fsrs), fsrsAfter: structuredClone(nextFsrs),
      cardUpdatedAtBefore: card.updatedAt, rating: request.rating,
      ...(request.confidenceBeforeReveal !== undefined ? { confidenceBeforeReveal: request.confidenceBeforeReveal } : {}),
      ...(request.attempt !== undefined ? { attempt: request.attempt } : {}),
      stateBefore: card.fsrs.state, stabilityBefore: card.fsrs.stability,
      difficultyBefore: card.fsrs.difficulty, elapsedDays: nextFsrs.elapsedDays,
      scheduledDays: nextFsrs.scheduledDays, reviewedAt: now.toISOString(),
      sessionId: session.id, sessionMode: plan.mode, resultClass: 'scheduled',
      entryId: entry.id, requestId: request.requestId,
    };
    const response: PlannedGradeResponse = {
      ok: true, requestId: request.requestId, revision: planAfter.revision,
      entryId: entry.id, setId: entry.setId, cardId: entry.cardId,
      resultClass: 'scheduled', ...(next ? { currentEntryId: next.id } : {}),
      due: nextFsrs.due, ...(requeued ? { requeued: true } : {}),
    };
    const pendingTransition: NonNullable<ReviewSession['pendingTransition']> = {
      kind: 'grade', requestId: request.requestId, semanticKey,
      beforeCard: structuredClone(card), afterCard: structuredClone(afterCard),
      event, response, planAfter,
      summaryAfter: recomputeSummary([...session.events, event], session.summary.unresolved ?? 0),
    };
    await assertOwnership();
    await writeJson(plannedSessionPath(root, session), { ...session, pendingTransition });
    session.pendingTransition = pendingTransition;
    await hooks.afterIntent?.();
    await assertOwnership();
    const currentBeforeWrite = await loadCard(root, card.setId, card.id);
    if (!currentBeforeWrite || !sameCardImage(currentBeforeWrite, card)) {
      const recovered = await recoverPendingGrade(root, session, assertOwnership);
      if (recovered?.diverged) {
        throw new PlannedSessionError('transition_diverged', 'pending card changed independently', session);
      }
      return response;
    }
    await saveCard(root, afterCard);
    await hooks.afterCard?.();
    await finalizePendingGrade(root, session, assertOwnership);
    return response;
  }

  const event: ReviewEvent = {
    cardId: card.id, setId: card.setId, rating: request.rating,
    ...(request.confidenceBeforeReveal !== undefined ? { confidenceBeforeReveal: request.confidenceBeforeReveal } : {}),
    ...(request.attempt !== undefined ? { attempt: request.attempt } : {}),
    reviewedAt: now.toISOString(), sessionId: session.id, sessionMode: plan.mode,
    resultClass: 'evidence', entryId: entry.id, requestId: request.requestId,
  };
  const eventsAfter = [...session.events, event];
  const summaryAfter = recomputeSummary(eventsAfter, session.summary.unresolved ?? 0);
  const response: PlannedGradeResponse = {
    ok: true, requestId: request.requestId, revision: planAfter.revision,
    entryId: entry.id, setId: entry.setId, cardId: entry.cardId,
    resultClass, ...(next ? { currentEntryId: next.id } : {}),
    ...(requeued ? { requeued: true } : {}),
  };
  planAfter.gradeLedger.push({ requestId: request.requestId, semanticKey, response });
  await assertOwnership();
  await writeJson(plannedSessionPath(root, session), {
    ...session, events: eventsAfter, plan: planAfter, summary: summaryAfter,
  });
  session.events = eventsAfter;
  session.plan = planAfter;
  session.summary = summaryAfter;
  return response;
}

export type PlannedUndoHooks = {
  afterIntent?: () => void | Promise<void>;
  afterCard?: () => void | Promise<void>;
};

/** Undo the latest live scheduled planned grade. The original request becomes
 * a permanent tombstone and the restored card receives a fresh version. */
export async function undoPlannedGrade(
  root: string,
  session: ReviewSession,
  request: PlannedUndoRequest,
  now = new Date(),
  assertOwnership: WriteGuard = unguardedWrite,
  hooks: PlannedUndoHooks = {},
): Promise<PlannedUndoResponse> {
  const semanticKey = JSON.stringify([request.revision, request.entryId, request.gradeRequestId]);
  if (!session.plan) throw new PlannedSessionError('legacy_session', 'legacy session is end-only', session);
  const recovered = await recoverPendingGrade(root, session, assertOwnership);
  const plan = session.plan;
  if (!plan) throw new PlannedSessionError('legacy_session', 'legacy session is end-only', session);
  plan.undoLedger ??= [];
  const initialReplay = plan.undoLedger.find((item) => item.requestId === request.requestId);
  if (initialReplay) {
    if (initialReplay.semanticKey !== semanticKey) {
      throw new PlannedSessionError('request_id_conflict', 'request id was already used for another undo', session);
    }
    if (initialReplay.error) {
      throw new PlannedSessionError(initialReplay.error.code, 'the original undo did not complete', session);
    }
    return { ...initialReplay.response, replayed: true };
  }
  if (recovered?.transition.kind === 'grade' && recovered.diverged) {
    throw new PlannedSessionError('transition_diverged', 'pending card changed independently', session);
  }
  if (recovered?.transition.kind === 'undo') {
    if (recovered.diverged) {
      throw new PlannedSessionError('transition_diverged', 'pending card changed independently', session);
    }
    if (recovered.transition.requestId === request.requestId
      && recovered.transition.semanticKey === semanticKey) {
      return { ...recovered.transition.response, replayed: true };
    }
  }
  if (session.endedAt) throw new PlannedSessionError('session_ended', 'session already ended', session);
  if (requestLedgerSize(plan) >= plan.requestBudget) {
    const planAfter = structuredClone(plan);
    planAfter.terminalReason = 'request_budget_exhausted';
    delete planAfter.currentEntryId;
    const endedAt = now.toISOString();
    await assertOwnership();
    await writeJson(plannedSessionPath(root, session), { ...session, plan: planAfter, endedAt });
    session.plan = planAfter;
    session.endedAt = endedAt;
    throw new PlannedSessionError('request_budget_exhausted', 'session request budget exhausted', session);
  }
  if (request.revision !== plan.revision) {
    throw new PlannedSessionError('stale_revision', 'session revision changed', session);
  }
  const latestLedger = plan.gradeLedger.at(-1);
  const latestEventRequestId = session.events.at(-1)?.requestId;
  if (latestLedger?.error?.code === 'transition_diverged'
    && latestLedger.requestId !== latestEventRequestId) {
    throw new PlannedSessionError('transition_diverged', 'the latest grade could not complete safely', session);
  }
  const eventIndex = session.events.length - 1;
  const event = session.events[eventIndex];
  if (eventIndex < 0 || event?.resultClass !== 'scheduled' || !event.setId || !event.entryId || !event.requestId
    || !event.fsrsBefore || !event.fsrsAfter) {
    throw new PlannedSessionError('undo_unavailable', 'no scheduled planned grade to undo', session);
  }
  if (request.entryId !== event.entryId || request.gradeRequestId !== event.requestId) {
    throw new PlannedSessionError('stale_entry', 'latest scheduled grade changed', session);
  }

  const card = await loadCard(root, event.setId, event.cardId);
  if (!card || card.status !== 'active' || JSON.stringify(card.fsrs) !== JSON.stringify(event.fsrsAfter)) {
    throw new PlannedSessionError('undo_unavailable', 'card changed after this grade', session);
  }
  const restored: Card = {
    ...card,
    fsrs: structuredClone(event.fsrsBefore),
    updatedAt: now.toISOString(),
  };
  const eventsAfter = session.events.filter((_item, index) => index !== eventIndex);
  const planAfter = structuredClone(plan);
  planAfter.entries = planAfter.entries.filter((entry) => entry.pass !== 'revisit'
    || entry.setId !== event.setId || entry.cardId !== event.cardId);
  const retainedEntryIds = new Set(planAfter.entries.map((entry) => entry.id));
  planAfter.unresolvedEntryIds = (planAfter.unresolvedEntryIds ?? [])
    .filter((entryId) => retainedEntryIds.has(entryId));
  if (!planAfter.entries.some((entry) => entry.id === event.entryId)) {
    throw new PlannedSessionError('undo_unavailable', 'planned entry no longer exists', session);
  }
  planAfter.currentEntryId = event.entryId;
  planAfter.revision += 1;
  const ledgerIndex = planAfter.gradeLedger.findIndex((item) => item.requestId === event.requestId);
  if (ledgerIndex < 0) throw new PlannedSessionError('undo_unavailable', 'grade ledger entry is missing', session);
  const original = planAfter.gradeLedger[ledgerIndex];
  planAfter.gradeLedger[ledgerIndex] = {
    requestId: original.requestId,
    semanticKey: original.semanticKey,
    error: { code: 'request_undone' },
  };
  const response: PlannedUndoResponse = {
    ok: true, requestId: request.requestId, revision: planAfter.revision,
    entryId: event.entryId, gradeRequestId: event.requestId, currentEntryId: event.entryId,
    setId: event.setId, cardId: event.cardId,
  };
  planAfter.undoLedger ??= [];
  planAfter.undoLedger.push({ requestId: request.requestId, semanticKey, response });
  const pendingTransition: NonNullable<ReviewSession['pendingTransition']> = {
    kind: 'undo', requestId: request.requestId, semanticKey,
    beforeCard: structuredClone(card), afterCard: structuredClone(restored),
    planAfter, eventsAfter,
    summaryAfter: recomputeSummary(eventsAfter, planAfter.unresolvedEntryIds.length), response,
  };
  await assertOwnership();
  await writeJson(plannedSessionPath(root, session), { ...session, pendingTransition });
  session.pendingTransition = pendingTransition;
  await hooks.afterIntent?.();
  await assertOwnership();
  const currentBeforeWrite = await loadCard(root, card.setId, card.id);
  if (!currentBeforeWrite || !sameCardImage(currentBeforeWrite, card)) {
    const recovered = await recoverPendingGrade(root, session, assertOwnership);
    if (recovered?.diverged) {
      throw new PlannedSessionError('transition_diverged', 'pending card changed independently', session);
    }
    return response;
  }
  await saveCard(root, restored);
  await hooks.afterCard?.();
  await finalizePendingGrade(root, session, assertOwnership);
  return response;
}

const RATING_KEY: Record<ReviewRating, 'again' | 'hard' | 'good' | 'easy'> = {
  1: 'again', 2: 'hard', 3: 'good', 4: 'easy',
};

/**
 * Grade a card: capture the pre-review FSRS snapshot, advance the schedule,
 * persist the updated card, and append a ReviewEvent to the session. Returns
 * the updated card so callers can reflect the new due date immediately.
 */
export async function gradeCard(
  root: string,
  session: ReviewSession,
  card: Card,
  rating: ReviewRating,
  now = new Date(),
  confidenceBeforeReveal?: Confidence,
  attempt?: ReviewAttempt,
): Promise<Card> {
  if (session.endedAt) throw new UndoUnavailableError('session already ended');
  const before = card.fsrs;
  const nextFsrs = gradeFsrs(before, rating, now);
  const updated: Card = { ...card, fsrs: nextFsrs, updatedAt: now.toISOString() };
  await saveCard(root, updated);

  const event: ReviewEvent = {
    cardId: card.id,
    setId: card.setId,
    fsrsBefore: structuredClone(before),
    fsrsAfter: structuredClone(nextFsrs),
    cardUpdatedAtBefore: card.updatedAt,
    rating,
    ...(confidenceBeforeReveal !== undefined ? { confidenceBeforeReveal } : {}),
    ...(attempt !== undefined ? { attempt } : {}),
    stateBefore: before.state,
    stabilityBefore: before.stability,
    difficultyBefore: before.difficulty,
    elapsedDays: nextFsrs.elapsedDays,
    scheduledDays: nextFsrs.scheduledDays,
    reviewedAt: now.toISOString(),
  };
  session.events.push(event);
  session.summary = recomputeSummary(session.events);
  return updated;
}

export class UndoUnavailableError extends Error {
  constructor(message: string) { super(message); this.name = 'UndoUnavailableError'; }
}

export function recomputeSummary(events: ReviewEvent[], unresolved = 0): ReviewSession['summary'] {
  const summary: ReviewSession['summary'] = {
    reviewedCount: events.length,
    distinctCardCount: new Set(events.map((e) => `${e.setId ?? ''}/${e.cardId}`)).size,
    again: 0, hard: 0, good: 0, easy: 0, unresolved,
  };
  for (const event of events) summary[RATING_KEY[event.rating]] += 1;
  if (events.some((event) => event.resultClass !== undefined)) {
    const scheduled = events.filter((event) => event.resultClass !== 'evidence');
    const evidence = events.filter((event) => event.resultClass === 'evidence');
    summary.scheduledResults = scheduled.length;
    summary.evidenceAttempts = evidence.length;
    summary.firstPass = scheduled.length;
    summary.retried = new Set(evidence.map((event) => `${event.setId ?? ''}/${event.cardId}`)).size;
  }
  return summary;
}

/** Undo exactly one grade. Sessions from before exact snapshots were introduced
 * remain readable but cannot be reconstructed safely, so we refuse to guess. */
export async function undoLastGrade(root: string, session: ReviewSession): Promise<Card> {
  if (session.endedAt) throw new UndoUnavailableError('session already ended');
  const event = session.events.at(-1);
  if (!event) throw new UndoUnavailableError('nothing to undo');
  if (!event.setId || !event.fsrsBefore || !event.fsrsAfter || !event.cardUpdatedAtBefore) {
    throw new UndoUnavailableError('last grade predates exact undo snapshots');
  }
  const card = await loadCard(root, event.setId, event.cardId);
  if (!card) throw new UndoUnavailableError('graded card no longer exists');
  if (JSON.stringify(card.fsrs) !== JSON.stringify(event.fsrsAfter)) {
    throw new UndoUnavailableError('card changed after this grade; refusing stale undo');
  }
  const restored: Card = { ...card, fsrs: structuredClone(event.fsrsBefore), updatedAt: event.cardUpdatedAtBefore };
  await saveCard(root, restored);
  session.events.pop();
  session.summary = recomputeSummary(session.events);
  return restored;
}

/** Finalize a session and persist it as a per-day file. Returns the path. */
export async function endSession(
  root: string,
  session: ReviewSession,
  now = new Date(),
  assertOwnership: WriteGuard = unguardedWrite,
): Promise<string> {
  if (session.plan && session.pendingTransition) {
    await recoverPendingGrade(root, session, assertOwnership);
  }
  const endedAt = now.toISOString();
  const day = session.startedAt.slice(0, 10); // YYYY-MM-DD
  const stamp = session.startedAt.replace(/[:.]/g, '-');
  const path = join(libraryPaths(root).sessionDayDir(day), `session_${stamp}.json`);
  await assertOwnership();
  await writeJson(path, { ...session, endedAt });
  session.endedAt = endedAt;
  return path;
}
