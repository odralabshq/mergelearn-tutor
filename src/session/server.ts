/**
 * Local review GUI (docs/design/redesign-2026-07/04). Two surfaces only:
 * Home (sets + what's due) and Practice (one card: answer -> reveal -> grade).
 *
 * Model-free and offline: reads the v2 library, serves localhost, no network.
 * Cut down from the old 5-surface browser server; keeps its visual language
 * and the answer/reveal/grade interaction, drops the dead concept-era plumbing.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';

import {
  getActiveCardsInAuthoredOrder, getDueCards, selectDueCards, type DueFilter,
} from '../core/library/review/dueQueue.js';
import { orderDueQueue, spaceSiblingCards } from '../core/library/review/interleave.js';
import { loadUserPreferences } from '../core/library/userPreferences.js';
import { archiveCard, deleteCard, editCard, unarchiveCard, CardLifecycleError, type CardEdit } from '../core/library/cardLifecycle.js';
import { searchCardsPage } from '../core/library/searchCards.js';
import {
  startPlannedSession, gradePlannedSession, undoPlannedGrade, advanceUnavailableEntries,
  recoverPlannedSession, PlannedSessionError, endSession, recomputeSummary,
} from '../core/library/review/session.js';
import { listSetSummaries, loadSet, loadOrder, saveSet } from '../core/library/setStore.js';
import { installSampleLesson } from '../core/library/sampleLesson.js';
import { loadCard, loadCardsForSet } from '../core/library/cardStore.js';
import {
  problemRefIdentity, safeStoredObservedOn, safeStoredProblemText,
} from '../core/library/problemRefs.js';
import { loadMasteryReport, type ProgressStats } from '../core/library/mastery.js';
import { loadPrepareWorkflow, type ExternalRow } from '../core/library/prepareWorkflow.js';
import {
  lessonEvidenceBySet,
  lessonEvidenceForSet,
  computeLessonProgress,
  type LessonEvidence, type LessonProgress,
} from '../core/library/review/sessionHistory.js';
import type {
  Card, CardSet, Confidence, ExternalProblemRef, Interaction, PlannedSessionState,
  ReviewAttempt, ReviewRating, ReviewSession, SetOrder, SetSummary,
} from '../core/library/types.js';
import { libraryPaths } from '../core/library/libraryStore.js';
import { writeJson, readJson as readJsonIO } from '../core/library/io.js';
import { appendDogfoodEvent, listDogfoodEvents } from '../core/library/dogfood.js';
import { join } from 'node:path';
import { createConnectionController } from './connectionController.js';
import {
  decideManageDraft, decidePracticeDraft, manageDraftKey, practiceDraftKey,
} from './draftRecovery.js';
import {
  acquireSessionWriter, SessionWriterError, type SessionWriterClaim,
} from './writerClaim.js';

export type ReviewServer = { server: Server; url: string; close: () => Promise<void> };

export type ReviewServerOptions = {
  instanceId?: string;
  managed?: boolean;
  onActivity?: () => void;
  onLessonOpen?: (setId: string, source?: string) => void | Promise<void>;
  dogfoodControls?: boolean;
  sessionWriter?: SessionWriterClaim;
};

type ResolvedReviewServerOptions = ReviewServerOptions & {
  instanceId: string;
  sessionWriter: SessionWriterClaim;
};

export async function startReviewServer(root: string, port = 0, options: ReviewServerOptions = {}): Promise<ReviewServer> {
  const instanceId = options.instanceId ?? randomUUID();
  const sessionWriter = options.sessionWriter ?? await acquireSessionWriter(root, instanceId);
  const resolvedOptions: ResolvedReviewServerOptions = { ...options, instanceId, sessionWriter };
  const server = createServer(async (req, res) => {
    try {
      await handleRequest(root, req, res, resolvedOptions);
    } catch (error) {
      sendText(res, 500, `session error: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  });
  try { await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve)); }
  catch (error) { await sessionWriter.release(); throw error; }
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('could not determine server address');
  const url = `http://127.0.0.1:${address.port}`;
  const close = async (): Promise<void> => {
    await new Promise<void>((resolve, reject) => {
      server.closeIdleConnections?.();
      server.closeAllConnections?.();
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await sessionWriter.release();
  };
  return { server, url, close };
}

async function handleRequest(root: string, req: IncomingMessage, res: ServerResponse, options: ResolvedReviewServerOptions): Promise<void> {
  const method = req.method ?? 'GET';
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  if (method === 'GET' && url.pathname === '/health') {
    if (options.sessionWriter.owned) {
      try { await options.sessionWriter.assertOwnership(); }
      catch (error) { if (!(error instanceof SessionWriterError)) throw error; }
    }
    return sendJson(res, 200, {
      ok: true, instanceId: options.instanceId, managed: !!options.managed,
      sessionWriter: options.sessionWriter.owned ? 'owner' : 'read_only',
      ...(!options.sessionWriter.owned && options.sessionWriter.reasonCode
        ? { sessionWriterReason: options.sessionWriter.reasonCode } : {}),
    });
  }
  if (method === 'GET' && url.pathname === '/api/keepalive') {
    options.onActivity?.();
    return sendJson(res, 200, { ok: true });
  }
  options.onActivity?.();
  if (method === 'POST') {
    const origin = req.headers.origin;
    if (origin && origin !== `http://${req.headers.host}`) return sendJson(res, 403, { ok: false, error: 'cross-origin request rejected' });
  }
  if (method === 'GET' && url.pathname === '/') return sendHtml(res, 200, await renderHome(root, options.instanceId!));
  if (method === 'GET' && url.pathname === '/library') {
    return sendHtml(res, 200, await renderLibrary(root, options.instanceId!));
  }
  if (method === 'GET' && url.pathname === '/library/cards') {
    return sendHtml(res, 200, await renderManage(root, url, options.instanceId!));
  }
  if (method === 'GET' && url.pathname === '/practice') {
    const legacyLesson = url.searchParams.get('mode') === 'lesson' && url.searchParams.has('set');
    const legacySetReview = url.searchParams.has('set') && !url.searchParams.has('mode');
    if (legacyLesson || legacySetReview) return sendRedirect(res, `/practice/session${url.search}`);
    return sendHtml(res, 200, await renderPracticeHub(root, url, options.instanceId!));
  }
  if (method === 'GET' && url.pathname === '/practice/session') {
    return sendHtml(res, 200, renderPractice(url, options.instanceId!));
  }
  if (method === 'GET' && (url.pathname === '/practice/strengthen' || url.pathname === '/practice/external')) {
    const lane = url.pathname.endsWith('/external') ? 'external' : 'strengthen';
    return sendHtml(res, 200, await renderPrepare(root, url, options.instanceId!, lane));
  }
  if (method === 'GET' && url.pathname === '/prepare') {
    const sourceOnly = url.searchParams.has('source') && !url.searchParams.has('set') && !url.searchParams.has('tag');
    return sendRedirect(res, `${sourceOnly ? '/practice/external' : '/practice/strengthen'}${url.search}`);
  }
  if (method === 'GET' && url.pathname === '/manage') {
    return sendRedirect(res, `/library/cards${url.search}`);
  }
  if (method === 'GET' && url.pathname.startsWith('/set/')) {
    const setId = decodeURIComponent(url.pathname.slice('/set/'.length));
    // Do not count a typo or deleted lesson as an open in dogfood evidence.
    if (await loadSet(root, setId)) {
      await options.onLessonOpen?.(setId, url.searchParams.get('source') ?? undefined);
    }
    const showDogfood = options.dogfoodControls ?? process.env.MERGELEARN_DOGFOOD_CONTROLS !== '0';
    return sendHtml(res, 200, await renderSetBrowser(root, setId, showDogfood, options.instanceId!));
  }
  // /api/due accepts both GET (no filter) and POST (JSON DueFilter body).
  // Empty body / empty object both mean "everything due."
  if (url.pathname === '/api/due') return dueData(root, req, res, url);
  if (method === 'GET' && url.pathname === '/api/cards') return cardsApi(root, res, url);
  if (method === 'POST' && url.pathname.startsWith('/api/card/')) {
    return cardActionApi(root, req, res, url.pathname.slice('/api/card/'.length), options.sessionWriter);
  }
  // Learn mode: every active card in one set, in authored order, independent of FSRS due state.
  if (method === 'GET' && url.pathname === '/api/lesson') return lessonData(root, res, url);
  // Per-sitting session lifecycle (doc 06 addendum A2): start -> grade* -> end.
  if (method === 'POST' && url.pathname === '/api/session/start') return sessionStartApi(root, req, res, options.sessionWriter);
  if (method === 'GET' && url.pathname.startsWith('/api/session/')) {
    return sessionGetApi(
      root, res, decodeURIComponent(url.pathname.slice('/api/session/'.length)), options.sessionWriter,
    );
  }
  if (method === 'POST' && url.pathname === '/api/session/grade') return sessionGradeApi(root, req, res, options.sessionWriter);
  if (method === 'POST' && url.pathname === '/api/session/undo') return sessionUndoApi(root, req, res, options.sessionWriter);
  if (method === 'POST' && url.pathname === '/api/session/end') return sessionEndApi(root, req, res, options.sessionWriter);
  // Opt-in sample lesson: the empty-state button POSTs here, then redirects.
  if (method === 'POST' && url.pathname === '/api/sample') return sampleApi(root, res, options.sessionWriter);
  if (method === 'POST' && url.pathname === '/api/dogfood/feedback') {
    return dogfoodFeedbackApi(root, req, res, options.sessionWriter);
  }
  if (method === 'POST' && url.pathname === '/api/dogfood/defer') {
    return dogfoodDeferApi(root, req, res, options.sessionWriter);
  }
  if (method === 'POST' && url.pathname === '/api/set/spaced-repetition') {
    return setSpacedRepetitionApi(root, req, res, options.sessionWriter);
  }
  return sendText(res, 404, 'not found\n');
}

// ---- API ----

/** In-memory map of active review sessions (id -> session). Persisted
 * incrementally on each grade and explicitly on /api/session/end. See doc 06
 * addendum A2. */
const activeSessions = new Map<string, ReviewSession>();
const sessionLocks = new Map<string, Promise<void>>();
const cardLocks = new Map<string, Promise<void>>();

async function withLock<T>(locks: Map<string, Promise<void>>, key: string, work: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.then(() => current);
  locks.set(key, queued);
  await previous;
  try { return await work(); }
  finally {
    release();
    if (locks.get(key) === queued) locks.delete(key);
  }
}

function withSessionLock<T>(sessionId: string, work: () => Promise<T>): Promise<T> {
  return withLock(sessionLocks, sessionId, work);
}

function withCardLock<T>(setId: string, cardId: string, work: () => Promise<T>): Promise<T> {
  return withLock(cardLocks, `${setId}/${cardId}`, work);
}

async function recoverSessionUnderCardLock(
  root: string, session: ReviewSession, writer: SessionWriterClaim,
): Promise<void> {
  const pending = session.pendingTransition;
  if (!pending) return;
  await withCardLock(pending.beforeCard.setId, pending.beforeCard.id, () =>
    recoverPlannedSession(root, session, writer.assertOwnership));
}

/** Validate that a value is a string[] (or undefined) — guard against the
 * client sending arbitrary JSON in the DueFilter body. */
function isStringArray(v: unknown): v is string[] | undefined {
  return v === undefined || (Array.isArray(v) && v.every((x) => typeof x === 'string'));
}

/** Normalize a parsed JSON body into a DueFilter (or undefined for empty). */
function asFilter(v: unknown): DueFilter | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const f: DueFilter = {};
  if (isStringArray(o.setIds)) f.setIds = o.setIds;
  if (isStringArray(o.tagIds)) f.tagIds = o.tagIds;
  if (isStringArray(o.folderPaths)) f.folderPaths = o.folderPaths;
  if (o.combinator === 'union' || o.combinator === 'intersection') f.combinator = o.combinator;
  // A combinator alone is not a constraint — require at least one dimension.
  const hasDimension = !!(f.setIds?.length || f.tagIds?.length || f.folderPaths?.length);
  return hasDimension ? f : undefined;
}

function startIntentKey(
  planMode: PlannedSessionState['mode'], lessonSetId: string | undefined, filter: DueFilter | undefined,
): string {
  const sorted = (values?: string[]) => [...(values ?? [])].sort();
  return JSON.stringify({
    mode: planMode,
    lesson: !!lessonSetId,
    filter: {
      setIds: sorted(lessonSetId ? [lessonSetId] : filter?.setIds),
      folderPaths: sorted(filter?.folderPaths),
      tagIds: sorted(filter?.tagIds),
      combinator: filter?.combinator ?? 'union',
    },
  });
}

const INTERACTION_TYPES = new Set<Interaction['type']>(['flashcard', 'self_response', 'choice', 'parsons']);

/** Normalize an untrusted grade-body `attempt` into a ReviewAttempt (or
 * undefined). Evidence only — never affects FSRS — so we coerce leniently and
 * drop anything malformed rather than rejecting the whole grade. */
function asAttempt(v: unknown): ReviewAttempt | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  if (typeof o.interaction !== 'string' || !INTERACTION_TYPES.has(o.interaction as Interaction['type'])) return undefined;
  const a: ReviewAttempt = { interaction: o.interaction as Interaction['type'] };
  if (typeof o.responseText === 'string') a.responseText = o.responseText.slice(0, 4000);
  if (Array.isArray(o.selectedOptionIds) && o.selectedOptionIds.every((x) => typeof x === 'string')) {
    a.selectedOptionIds = o.selectedOptionIds as string[];
  }
  if (Array.isArray(o.orderedBlockIds) && o.orderedBlockIds.every((x) => typeof x === 'string')) {
    a.orderedBlockIds = o.orderedBlockIds as string[];
  }
  if (typeof o.correct === 'boolean') a.correct = o.correct;
  if (typeof o.revealedFull === 'boolean') a.revealedFull = o.revealedFull;
  if (typeof o.elapsedMs === 'number' && Number.isFinite(o.elapsedMs) && o.elapsedMs >= 0) a.elapsedMs = o.elapsedMs;
  return a;
}

async function dogfoodFeedbackApi(
  root: string, req: IncomingMessage, res: ServerResponse, writer: SessionWriterClaim,
): Promise<void> {
  if (!await requireWriter(writer, res)) return;
  let body: Record<string, unknown>;
  try { body = await readJson(req) as Record<string, unknown>; }
  catch { return sendJson(res, 400, { ok: false, error: 'invalid JSON body' }); }
  if (typeof body.setId !== 'string' || (typeof body.worthAnswering !== 'boolean' && body.worthAnswering !== null)) {
    return sendJson(res, 400, { ok: false, error: 'setId and worthAnswering (boolean or null) are required' });
  }
  const worthAnswering = body.worthAnswering as boolean | null;
  const note = typeof body.note === 'string' ? body.note.slice(0, 1000) : undefined;
  if (!await requireWriter(writer, res)) return;
  const event = await appendDogfoodEvent(root, { kind: 'feedback', setId: body.setId, worthAnswering, ...(note ? { note } : {}) });
  return sendJson(res, 200, { ok: true, event });
}

async function dogfoodDeferApi(
  root: string, req: IncomingMessage, res: ServerResponse, writer: SessionWriterClaim,
): Promise<void> {
  if (!await requireWriter(writer, res)) return;
  let body: Record<string, unknown>;
  try { body = await readJson(req) as Record<string, unknown>; }
  catch { return sendJson(res, 400, { ok: false, error: 'invalid JSON body' }); }
  if (typeof body.setId !== 'string') return sendJson(res, 400, { ok: false, error: 'setId is required' });
  if (!await requireWriter(writer, res)) return;
  const event = await appendDogfoodEvent(root, { kind: 'deferred', setId: body.setId });
  return sendJson(res, 200, { ok: true, event });
}

async function setSpacedRepetitionApi(
  root: string, req: IncomingMessage, res: ServerResponse, writer: SessionWriterClaim,
): Promise<void> {
  if (!await requireWriter(writer, res)) return;
  let body: Record<string, unknown>;
  try { body = await readJson(req) as Record<string, unknown>; }
  catch { return sendJson(res, 400, { ok: false, error: 'invalid JSON body' }); }
  if (typeof body.setId !== 'string' || typeof body.enabled !== 'boolean') {
    return sendJson(res, 400, { ok: false, error: 'setId and enabled are required' });
  }
  const set = await loadSet(root, body.setId);
  if (!set) return sendJson(res, 404, { ok: false, error: 'set not found' });
  if (!await requireWriter(writer, res)) return;
  await saveSet(root, { ...set, spacedRepetition: body.enabled, updatedAt: new Date().toISOString() });
  return sendJson(res, 200, { ok: true, enabled: body.enabled });
}

/** /api/due accepts both GET (no filter) and POST (JSON DueFilter body).
 * Empty body / empty object both mean "everything due." */
async function dueData(root: string, req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  let filter: DueFilter | undefined;
  if ((req.method ?? 'GET') === 'POST') {
    let body: unknown;
    try { body = await readJson(req); }
    catch { return sendJson(res, 400, { error: 'invalid JSON body' }); }
    try { filter = asFilter(body); }
    catch (e) { return sendJson(res, 400, { error: (e as Error).message }); }
  } else {
    // Legacy GET single-value params still supported for CLI/scripts.
    filter = {
      setIds: url.searchParams.get('set') ? [url.searchParams.get('set')!] : undefined,
      tagIds: url.searchParams.get('tag') ? [url.searchParams.get('tag')!] : undefined,
      folderPaths: url.searchParams.get('folder') ? [url.searchParams.get('folder')!] : undefined,
    };
    if (!filter.setIds && !filter.tagIds && !filter.folderPaths) filter = undefined;
  }
  const now = new Date();
  const [due, prefs] = await Promise.all([getDueCards(root, now, filter), loadUserPreferences(root)]);
  const queueOptions = { strategy: prefs.queueStrategy, seed: now.toISOString().slice(0, 10) };
  // Interleave before applying the cap so one set cannot fill the entire
  // sitting before the mixer has a chance to see cards from other sets.
  const prioritized = orderDueQueue(due, queueOptions);
  const selected = selectDueCards(prioritized, prefs.reviewSessionCap);
  const ordered = spaceSiblingCards(orderDueQueue(selected, queueOptions));
  const sets = new Map<string, CardSet>();
  await Promise.all([...new Set(ordered.map((card) => card.setId))].map(async (setId) => {
    const set = await loadSet(root, setId);
    if (set) sets.set(setId, set);
  }));
  return sendJson(res, 200, {
    total: ordered.length,
    totalDue: due.length,
    remaining: Math.max(0, due.length - ordered.length),
    strategy: prefs.queueStrategy,
    cards: ordered.map((card) => cardView(card, sets.get(card.setId))),
  });
}

async function cardsApi(root: string, res: ServerResponse, url: URL): Promise<void> {
  const rawOffset = Number(url.searchParams.get('offset'));
  const rawLimit = Number(url.searchParams.get('limit'));
  const rawState = Number(url.searchParams.get('state'));
  const offset = url.searchParams.has('offset') && Number.isInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0;
  const limit = url.searchParams.has('limit') && Number.isInteger(rawLimit) && rawLimit >= 1 && rawLimit <= 100 ? rawLimit : 100;
  const state = url.searchParams.has('state') && Number.isInteger(rawState) && rawState >= 0 && rawState <= 3
    ? rawState as 0 | 1 | 2 | 3
    : undefined;
  const page = await searchCardsPage(root, url.searchParams.get('q') ?? '', {
    setIds: url.searchParams.get('set') ? [url.searchParams.get('set')!] : undefined,
    tagIds: url.searchParams.getAll('tag').filter(Boolean),
    includeArchived: url.searchParams.get('archived') === '1',
    state, offset, limit,
  });
  const expectedSnapshot = url.searchParams.get('snapshot');
  if (expectedSnapshot && expectedSnapshot !== page.snapshot) {
    return sendJson(res, 409, {
      ok: false, code: 'snapshot_mismatch', snapshot: page.snapshot, total: page.total,
    });
  }
  return sendJson(res, 200, { ok: true, ...page });
}

async function cardActionApi(
  root: string, req: IncomingMessage, res: ServerResponse, action: string, writer: SessionWriterClaim,
): Promise<void> {
  if (!await requireWriter(writer, res)) return;
  let body: { setId?: string; cardId?: string; edit?: unknown; confirm?: boolean; expectedUpdatedAt?: string };
  try { body = (await readJson(req)) as typeof body; }
  catch { return sendJson(res, 400, { ok: false, error: 'invalid JSON body' }); }
  if (!body.setId || !body.cardId) return sendJson(res, 400, { ok: false, error: 'need setId and cardId' });
  return withCardLock(body.setId, body.cardId, async () => {
    try {
      const guarded = { expectedUpdatedAt: body.expectedUpdatedAt, assertOwnership: writer.assertOwnership };
      if (action === 'archive') return sendJson(res, 200, { ok: true, card: await archiveCard(root, body.setId!, body.cardId!, undefined, guarded) });
      if (action === 'unarchive') return sendJson(res, 200, { ok: true, card: await unarchiveCard(root, body.setId!, body.cardId!, undefined, guarded) });
      if (action === 'edit' && body.edit && typeof body.edit === 'object') {
        return sendJson(res, 200, { ok: true, card: await editCard(root, body.setId!, body.cardId!, body.edit as CardEdit, undefined, guarded) });
      }
      if (action === 'delete') {
        if (!body.confirm) return sendJson(res, 409, { ok: false, error: 'permanent deletion requires confirm=true' });
        return sendJson(res, 200, { ok: true, result: await deleteCard(root, body.setId!, body.cardId!, guarded) });
      }
      return sendJson(res, 400, { ok: false, error: `unknown or incomplete card action: ${action}` });
    } catch (error) {
      if (error instanceof SessionWriterError) return writerError(res, error);
      if (error instanceof CardLifecycleError) {
        const status = error.message.startsWith('card not found') ? 404 : error.message.startsWith('card changed') ? 409 : 400;
        return sendJson(res, status, { ok: false, error: error.message });
      }
      throw error;
    }
  });
}

/** GET /api/lesson?set=<id> returns all active cards in authored order.
 * This is deliberately separate from /api/due: Learn sequencing and FSRS
 * Review are different jobs and must not silently change each other's queues. */
/** Active cards in authored order. Cards missing from order.json are appended
 * so a legacy/malformed set stays fully accessible. Shared by lessonData and
 * the Home/set progress derivation so ordering never diverges. */
function orderActiveCards(cards: Card[], order: SetOrder | undefined): Card[] {
  const active = cards.filter((c) => c.status === 'active');
  const byId = new Map(active.map((c) => [c.id, c]));
  const ordered: Card[] = [];
  for (const id of order?.cardIds ?? []) {
    const card = byId.get(id);
    if (card) { ordered.push(card); byId.delete(id); }
  }
  for (const card of byId.values()) ordered.push(card);
  return ordered;
}

async function lessonData(root: string, res: ServerResponse, url: URL): Promise<void> {
  const setId = url.searchParams.get('set');
  if (!setId) return sendJson(res, 400, { ok: false, error: 'need set' });
  const [set, cards, order, evidence] = await Promise.all([
    loadSet(root, setId), loadCardsForSet(root, setId), loadOrder(root, setId),
    lessonEvidenceForSet(root, setId),
  ]);
  if (!set) return sendJson(res, 404, { ok: false, error: 'set not found' });
  const ordered = orderActiveCards(cards, order);
  const progress = computeLessonProgress(ordered.map((c) => c.id), evidence);
  return sendJson(res, 200, {
    ok: true,
    lesson: { id: set.id, title: set.title, objective: set.objective ?? null, lessonKind: set.lessonKind ?? null },
    total: ordered.length,
    progress,
    cards: ordered.map((card) => cardView(card, set)),
  });
}

/** Path to the per-day session file, mirroring the on-disk layout used by
 * endSession in session.ts. */
function sessionFilePath(root: string, session: ReviewSession): string {
  const day = session.startedAt.slice(0, 10);
  const stamp = session.startedAt.replace(/[:.]/g, '-');
  return join(libraryPaths(root).sessionDayDir(day), `session_${stamp}.json`);
}

/** Re-persist a session incrementally (after each grade) so the file is
 * crash-durable. Cheap at this scale — no DB. */
async function persistSession(
  root: string,
  session: ReviewSession,
  assertOwnership: () => Promise<void>,
): Promise<void> {
  await assertOwnership();
  await writeJson(sessionFilePath(root, session), session);
}

function writerError(res: ServerResponse, error: SessionWriterError): void {
  sendJson(res, 409, {
    ok: false, code: error.code, error: error.message, retryable: true,
  });
}

async function requireWriter(writer: SessionWriterClaim, res: ServerResponse): Promise<boolean> {
  try { await writer.assertOwnership(); return true; }
  catch (error) {
    if (error instanceof SessionWriterError) { writerError(res, error); return false; }
    throw error;
  }
}

async function loadSessionById(
  root: string, sessionId: string, useActiveCache = true,
): Promise<ReviewSession | undefined> {
  const active = useActiveCache ? activeSessions.get(sessionId) : undefined;
  if (active) return active;
  for (const path of await listSessionFiles(root)) {
    try {
      const session = await readJsonIO<ReviewSession>(path);
      if (session?.id === sessionId) return session;
    } catch { /* one malformed session must not hide every valid session */ }
  }
  return undefined;
}

async function plannedSessionView(root: string, session: ReviewSession) {
  const plan = session.plan;
  const summary = session.summary ?? recomputeSummary(
    Array.isArray(session.events) ? session.events : [], plan?.unresolvedEntryIds?.length ?? 0,
  );
  const entry = plan?.entries.find((item) => item.id === plan.currentEntryId);
  const cursor = entry && plan ? plan.entries.findIndex((item) => item.id === entry.id) : -1;
  const pendingEntries = cursor >= 0 && plan ? plan.entries.slice(cursor) : [];
  const remainingCards = new Set(pendingEntries
    .filter((item) => item.pass === 'first')
    .map((item) => `${item.setId}/${item.cardId}`)).size;
  const revisitRemaining = pendingEntries.filter((item) => item.pass === 'revisit').length;
  let current = null;
  if (entry) {
    const card = await loadCard(root, entry.setId, entry.cardId);
    if (card?.status === 'active') current = {
      entryId: entry.id, pass: entry.pass, card: cardView(card, await loadSet(root, card.setId)),
    };
  }
  return {
    ok: true,
    sessionId: session.id,
    mode: plan?.mode ?? null,
    sessionMode: session.mode,
    filter: session.filter ?? null,
    revision: plan?.revision ?? null,
    current,
    summary,
    unresolved: summary.unresolved ?? 0,
    ended: !!session.endedAt,
    terminalReason: plan?.terminalReason ?? null,
    resumable: !!plan && !session.endedAt,
    remaining: remainingCards,
    revisitRemaining,
    backlog: plan?.backlogCount ?? 0,
    plannedCount: plan?.entries.length ?? 0,
  };
}

async function sessionGetApi(
  root: string, res: ServerResponse, sessionId: string, writer: SessionWriterClaim,
): Promise<void> {
  return withSessionLock(sessionId, async () => {
    let canWrite = writer.owned;
    if (canWrite) {
      try { await writer.assertOwnership(); }
      catch (error) {
        if (!(error instanceof SessionWriterError)) throw error;
        canWrite = false;
      }
    }
    if (!canWrite) activeSessions.delete(sessionId);
    const session = await loadSessionById(root, sessionId, canWrite);
    if (!session) return sendJson(res, 404, { ok: false, error: 'session not found' });
    if (canWrite) {
      await recoverSessionUnderCardLock(root, session, writer);
      await advanceUnavailableEntries(root, session, writer.assertOwnership);
      activeSessions.set(session.id, session);
    }
    return sendJson(res, 200, await plannedSessionView(root, session));
  });
}

async function preparePlannedSessionView(
  root: string, session: ReviewSession, writer: SessionWriterClaim,
) {
  await recoverSessionUnderCardLock(root, session, writer);
  await advanceUnavailableEntries(root, session, writer.assertOwnership);
  activeSessions.set(session.id, session);
  return plannedSessionView(root, session);
}

/** Select and persist one authoritative bounded plan. */
async function sessionStartApi(
  root: string, req: IncomingMessage, res: ServerResponse, writer: SessionWriterClaim,
): Promise<void> {
  if (!await requireWriter(writer, res)) return;
  let body: unknown;
  try { body = await readJson(req); }
  catch { return sendJson(res, 400, { ok: false, error: 'invalid JSON body' }); }
  let filter: DueFilter | undefined;
  try { filter = asFilter(body); }
  catch (error) { return sendJson(res, 400, { ok: false, error: (error as Error).message }); }
  const record = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const requestId = typeof record.requestId === 'string' && record.requestId ? record.requestId : undefined;
  const lessonSetId = typeof record.lessonSetId === 'string' ? record.lessonSetId : undefined;
  const requestedMode = record.mode;
  if (lessonSetId && requestedMode !== undefined && requestedMode !== 'study_once') {
    return sendJson(res, 400, { ok: false, error: 'lessonSetId only supports study_once mode' });
  }
  const planMode = requestedMode === 'study_once' || requestedMode === 'retry_missed'
    ? requestedMode : lessonSetId ? 'study_once' : 'review_due';
  if (lessonSetId) filter = { setIds: [lessonSetId] };
  const intentKey = startIntentKey(planMode, lessonSetId, filter);
  if (requestId) {
    return withSessionLock(`start:${root}:${requestId}`, async () => {
      const existing = (await Promise.all((await listSessionFiles(root)).map(async (path) => {
        try { return await readJsonIO<ReviewSession>(path); } catch { return undefined; }
      }))).find((item) => item?.startRequest?.requestId === requestId);
      if (existing) {
        if (existing.startRequest?.intentKey !== intentKey) {
          return sendJson(res, 409, { ok: false, code: 'request_id_conflict', error: 'start request id was used for another intent' });
        }
        return withSessionLock(existing.id, async () => {
          const current = await loadSessionById(root, existing.id);
          if (!current) return sendJson(res, 404, { ok: false, error: 'session not found' });
          return sendJson(res, 200, {
            ...(await preparePlannedSessionView(root, current, writer)), replayed: true,
          });
        });
      }
      return createPlannedSession(root, res, writer, modeForStart(lessonSetId, filter), planMode,
        lessonSetId, filter, sourceSelection, requestId, intentKey);
    });
  }
  return createPlannedSession(root, res, writer, modeForStart(lessonSetId, filter), planMode,
    lessonSetId, filter, sourceSelection);
}

function modeForStart(lessonSetId: string | undefined, filter: DueFilter | undefined): ReviewSession['mode'] {
  return lessonSetId ? 'lesson' : filter?.folderPaths?.length ? 'folder'
    : filter?.tagIds?.length ? 'tag_filter' : filter?.setIds?.length ? 'set' : 'recommended';
}

async function sourceSelection(
  root: string, planMode: PlannedSessionState['mode'], lessonSetId: string | undefined, filter: DueFilter | undefined,
): Promise<{ cards: Card[]; sourceCount: number }> {
  let cards: Card[];
  let sourceCount = 0;
  if (lessonSetId) {
    const authored = orderActiveCards(await loadCardsForSet(root, lessonSetId), await loadOrder(root, lessonSetId));
    const evidence = await lessonEvidenceForSet(root, lessonSetId);
    const unpassed = authored.filter((card) => !evidence.has(card.id));
    cards = unpassed.length > 0 ? unpassed : authored;
    sourceCount = cards.length;
  } else if (planMode === 'study_once' || planMode === 'retry_missed') {
    cards = await getActiveCardsInAuthoredOrder(root, filter);
    sourceCount = cards.length;
  } else {
    const now = new Date();
    const [due, prefs] = await Promise.all([getDueCards(root, now, filter), loadUserPreferences(root)]);
    const queueOptions = { strategy: prefs.queueStrategy, seed: now.toISOString().slice(0, 10) };
    cards = spaceSiblingCards(orderDueQueue(
      selectDueCards(orderDueQueue(due, queueOptions), prefs.reviewSessionCap), queueOptions,
    ));
    sourceCount = due.length;
  }
  return { cards, sourceCount };
}

async function createPlannedSession(
  root: string, res: ServerResponse, writer: SessionWriterClaim, mode: ReviewSession['mode'],
  planMode: PlannedSessionState['mode'], lessonSetId: string | undefined, filter: DueFilter | undefined,
  select: typeof sourceSelection, requestId?: string, intentKey?: string,
): Promise<void> {
  const { cards, sourceCount } = await select(root, planMode, lessonSetId, filter);
  const session = startPlannedSession(mode, planMode, cards, filter, new Date(), sourceCount);
  if (requestId && intentKey) session.startRequest = { requestId, intentKey };
  activeSessions.set(session.id, session);
  try { await persistSession(root, session, writer.assertOwnership); }
  catch (error) {
    activeSessions.delete(session.id);
    if (error instanceof SessionWriterError) return writerError(res, error);
    throw error;
  }
  return sendJson(res, 200, await mutationSuccessState(root, session, writer));
}

async function mutationSuccessState(
  root: string, session: ReviewSession, writer: SessionWriterClaim,
) {
  try { return await preparePlannedSessionView(root, session, writer); }
  catch (error) {
    if (error instanceof SessionWriterError) return plannedSessionView(root, session);
    throw error;
  }
}

/** Planned grade requires a retained request id plus revision and entry fence. */
async function sessionGradeApi(
  root: string, req: IncomingMessage, res: ServerResponse, writer: SessionWriterClaim,
): Promise<void> {
  if (!await requireWriter(writer, res)) return;
  let body: { sessionId?: string; requestId?: string; revision?: number; entryId?: string; cardId?: string; setId?: string; rating?: number; confidence?: number; attempt?: unknown };
  try { body = (await readJson(req)) as typeof body; }
  catch { return sendJson(res, 400, { ok: false, error: 'invalid JSON body' }); }
  const rating = Number(body.rating) as ReviewRating;
  if (!body.sessionId || !body.requestId || !Number.isInteger(body.revision) || !body.entryId
    || !body.cardId || !body.setId || ![1, 2, 3, 4].includes(rating)) {
    return sendJson(res, 400, { ok: false, error: 'need sessionId, requestId, revision, entryId, cardId, setId, rating(1-4)' });
  }
  return withSessionLock(body.sessionId, async () => {
    const session = await loadSessionById(root, body.sessionId!);
    if (!session) return sendJson(res, 404, { ok: false, error: 'session not found' });
    const confidence = [1, 2, 3, 4, 5].includes(Number(body.confidence))
      ? Number(body.confidence) as Confidence : undefined;
    try {
      await recoverSessionUnderCardLock(root, session, writer);
      const response = await withCardLock(body.setId!, body.cardId!, () => gradePlannedSession(root, session, {
        requestId: body.requestId!, revision: body.revision!, entryId: body.entryId!,
        setId: body.setId!, cardId: body.cardId!, rating, confidenceBeforeReveal: confidence,
        attempt: asAttempt(body.attempt),
      }, new Date(), { assertOwnership: writer.assertOwnership }));
      return sendJson(res, 200, {
        ...response, state: await mutationSuccessState(root, session, writer),
      });
    } catch (error) {
      if (error instanceof SessionWriterError) return writerError(res, error);
      if (!(error instanceof PlannedSessionError)) throw error;
      try {
        const state = session.plan ? await preparePlannedSessionView(root, session, writer)
          : await plannedSessionView(root, session);
        return sendJson(res, 409, { ok: false, code: error.code, error: error.message, state });
      } catch (writeError) {
        if (writeError instanceof SessionWriterError) {
          return sendJson(res, 409, {
            ok: false, code: error.code, error: error.message, retryable: false,
          });
        }
        throw writeError;
      }
    }
  });
}

async function sessionUndoApi(
  root: string, req: IncomingMessage, res: ServerResponse, writer: SessionWriterClaim,
): Promise<void> {
  if (!await requireWriter(writer, res)) return;
  let body: { sessionId?: string; requestId?: string; revision?: number; entryId?: string; gradeRequestId?: string };
  try { body = (await readJson(req)) as typeof body; }
  catch { return sendJson(res, 400, { ok: false, error: 'invalid JSON body' }); }
  if (!body.sessionId || !body.requestId || !Number.isInteger(body.revision)
    || !body.entryId || !body.gradeRequestId) {
    return sendJson(res, 400, { ok: false, error: 'need sessionId, requestId, revision, entryId, gradeRequestId' });
  }
  return withSessionLock(body.sessionId, async () => {
    const session = await loadSessionById(root, body.sessionId!);
    if (!session) return sendJson(res, 404, { ok: false, error: 'session not found' });
    try {
      await recoverSessionUnderCardLock(root, session, writer);
      const latest = session.events.at(-1);
      const undo = () => undoPlannedGrade(root, session, {
        requestId: body.requestId!, revision: body.revision!, entryId: body.entryId!,
        gradeRequestId: body.gradeRequestId!,
      }, new Date(), writer.assertOwnership);
      const response = latest?.setId
        ? await withCardLock(latest.setId, latest.cardId, undo)
        : await undo();
      return sendJson(res, 200, {
        ...response, state: await mutationSuccessState(root, session, writer),
      });
    } catch (error) {
      if (error instanceof SessionWriterError) return writerError(res, error);
      if (error instanceof PlannedSessionError) {
        try {
          const state = session.plan ? await preparePlannedSessionView(root, session, writer)
            : await plannedSessionView(root, session);
          return sendJson(res, 409, { ok: false, code: error.code, error: error.message, state });
        } catch (writeError) {
          if (writeError instanceof SessionWriterError) {
            return sendJson(res, 409, {
              ok: false, code: error.code, error: error.message, retryable: false,
            });
          }
          throw writeError;
        }
      }
      throw error;
    }
  });
}

async function sessionEndApi(
  root: string, req: IncomingMessage, res: ServerResponse, writer: SessionWriterClaim,
): Promise<void> {
  if (!await requireWriter(writer, res)) return;
  let body: { sessionId?: string };
  try { body = (await readJson(req)) as typeof body; }
  catch { return sendJson(res, 400, { ok: false, error: 'invalid JSON body' }); }
  if (!body.sessionId) return sendJson(res, 400, { ok: false, error: 'need sessionId' });
  return withSessionLock(body.sessionId, async () => {
    const session = await loadSessionById(root, body.sessionId!);
    if (!session) return sendJson(res, 404, { ok: false, error: 'session not found' });
    try {
      await recoverSessionUnderCardLock(root, session, writer);
      if (!session.endedAt) await endSession(root, session, new Date(), writer.assertOwnership);
    } catch (error) {
      if (error instanceof SessionWriterError) return writerError(res, error);
      throw error;
    }
    activeSessions.delete(body.sessionId!);
    return sendJson(res, 200, { ok: true, sessionId: body.sessionId, summary: session.summary, ended: true });
  });
}

/** POST /api/sample — install the opt-in sample lesson (idempotent). Returns the
 * set id so the client can navigate to it. Never duplicates an existing sample. */
async function sampleApi(root: string, res: ServerResponse, writer: SessionWriterClaim): Promise<void> {
  if (!await requireWriter(writer, res)) return;
  try {
    const r = await installSampleLesson(root, { assertOwnership: writer.assertOwnership });
    if (!r.ok) return sendJson(res, 500, { ok: false, error: 'sample import failed', errors: r.errors });
    return sendJson(res, 200, { ok: true, status: r.status, setId: r.setId, title: r.title });
  } catch (e) {
    if (e instanceof SessionWriterError) return writerError(res, e);
    return sendJson(res, 500, { ok: false, error: (e as Error).message });
  }
}

/** Find all session_*.json files under profile/sessions/ (best-effort, used to
 * recover a session after a server restart). */
async function listSessionFiles(root: string): Promise<string[]> {
  const fs = await import('node:fs/promises');
  const base = libraryPaths(root).profile;
  const out: string[] = [];
  try {
    const days = await fs.readdir(join(base, 'sessions'));
    for (const day of days) {
      try {
        const files = await fs.readdir(join(base, 'sessions', day));
        for (const f of files) if (f.startsWith('session_') && f.endsWith('.json')) out.push(join(base, 'sessions', day, f));
      } catch { /* day dir missing, skip */ }
    }
  } catch { /* profile/sessions missing, no sessions to recover */ }
  return out;
}

type ProblemRefView = Pick<ExternalProblemRef, 'sourceName' | 'sourceId' | 'title' | 'attributions'> & {
  href: string | null;
  hostname: string | null;
};

function problemRefView(card: Card, set?: CardSet): ProblemRefView[] {
  const seen = new Set<string>();
  return [...(card.problemRefs ?? []), ...(set?.problemRefs ?? [])].flatMap((ref) => {
    const identity = problemRefIdentity(ref);
    if (!identity || seen.has(identity.key)) return [];
    seen.add(identity.key);
    let href: string | null = null;
    let hostname: string | null = null;
    try {
      const url = new URL(ref.canonicalUrl);
      if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error();
      href = url.toString();
      hostname = url.hostname;
    } catch { /* Hand-edited unsafe storage remains identifiable, never linkable. */ }
    const title = safeStoredProblemText(ref.title, 200);
    const attributions = Array.isArray(ref.attributions) ? ref.attributions.slice(0, 50).flatMap((item) => {
      const label = safeStoredProblemText(item?.label, 100);
      const observedOn = safeStoredObservedOn(item?.observedOn);
      return item && (item.kind === 'list' || item.kind === 'company') && label && observedOn
        ? [{ kind: item.kind, label, observedOn }] : [];
    }) : undefined;
    return [{
      sourceName: identity.sourceName, sourceId: identity.sourceId,
      ...(title ? { title } : {}),
      ...(attributions ? { attributions } : {}),
      href, hostname,
    }];
  });
}

/** Trim a card to what the Practice UI renders, with server-pre-rendered HTML
 * for code (diff-snippet widget) and explanations (markdown → HTML). */
function cardView(card: Card, set?: CardSet) {
  return {
    id: card.id,
    setId: card.setId,
    setTitle: set?.title ?? card.setId,
    problemRefs: problemRefView(card, set),
    prompt: card.front.prompt,
    // Pre-rendered so a fenced code block / multi-line prompt shows as a real
    // <pre><code> block (not mangled inline). Mirrors explanationHtml.
    promptHtml: renderMarkdownHtml(card.front.prompt),
    context: card.front.contextMarkdown ?? null,
    contextHtml: card.front.contextMarkdown ? renderMarkdownHtml(card.front.contextMarkdown) : null,
    shortAnswer: card.back.shortAnswer,
    explanation: card.back.explanationMarkdown,
    explanationHtml: renderMarkdownHtml(card.back.explanationMarkdown),
    // Interaction drives the pre-reveal input. Absent = legacy flashcard.
    // Option feedback is authored, so grading is deterministic and model-free.
    interaction: card.interaction ?? { type: 'flashcard' },
    examples: card.back.examples ?? [],
    commonMistakes: card.back.commonMistakes ?? [],
    sources: (card.sourceRefs ?? []).map((r) => ({
      path: r.path, startLine: r.startLine, endLine: r.endLine,
      commit: r.commit.slice(0, 8), status: r.status, text: r.frozenText ?? '',
      snippetHtml: r.frozenText ? renderDiffSnippetHtml(r.frozenText) : '',
    })),
  };
}

// ---- Home tab ----

/** Lesson progress for one set, given the pre-walked evidence map (so the
 * Home page doesn't re-scan the session tree per set). */
async function lessonProgressFor(root: string, setId: string, evidence: LessonEvidence): Promise<LessonProgress> {
  const [cards, order] = await Promise.all([loadCardsForSet(root, setId), loadOrder(root, setId)]);
  const ordered = orderActiveCards(cards, order);
  return computeLessonProgress(ordered.map((c) => c.id), evidence);
}

function evidenceLabel(progress: LessonProgress): string {
  return `${progress.deterministicCount} deterministic recall · `
    + `${progress.selfAssessedCount} self-assessed recall`;
}

function cardTargetId(cardId: string): string { return `card-${cardId}`; }
function cardTargetHref(setId: string, cardId: string): string {
  return `/set/${encodeURIComponent(setId)}#${encodeURIComponent(cardTargetId(cardId))}`;
}
function safeExternalHref(row: ExternalRow): string | undefined {
  try {
    const url = new URL(row.canonicalUrl);
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash
      ? row.canonicalUrl : undefined;
  } catch { return undefined; }
}

async function renderPrepare(
  root: string, url: URL, instanceId: string, lane: 'strengthen' | 'external',
): Promise<string> {
  const filters = { set: url.searchParams.getAll('set').filter(Boolean), tag: url.searchParams.getAll('tag').filter(Boolean), source: url.searchParams.getAll('source').filter(Boolean) };
  const hasSetTagFilters = filters.set.length > 0 || filters.tag.length > 0;
  const workflow = await loadPrepareWorkflow(root, filters);
  const strengthen = workflow.strengthen.length ? workflow.strengthen.map((row) =>
    `<li class="prepare-row"><strong>${escapeHtml(row.prompt)}</strong><p>${escapeHtml(row.reason)}</p>` +
    `<a class="secondary-action" href="${escapeHtml(cardTargetHref(row.setId, row.cardId))}">Review this evidence</a></li>`).join('')
    : `<li class="empty">${hasSetTagFilters ? 'No evidence-backed weak cards match the active Set and Tag filters.' : 'No evidence-backed weak cards are available yet.'}</li>`;
  const external = workflow.external.length ? workflow.external.map((row) => {
    const href = safeExternalHref(row), label = `${row.sourceName} · ${row.sourceId}`;
    const action = href ? `<a class="secondary-action" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" aria-label="Practice externally: open ${escapeHtml(label)} in a new tab">Practice externally</a>`
      : `<span class="secondary-action is-disabled">Link unavailable</span>`;
    const date = row.attributionDate ? `<span class="muted small">List attribution date: ${escapeHtml(row.attributionDate)}</span>` : '';
    return `<li class="prepare-row"><strong>${escapeHtml(label)}</strong><p>${escapeHtml(row.reason)}</p>${date}<div class="prepare-actions">` +
      `<a href="${escapeHtml(cardTargetHref(row.setId, row.cardId))}">View card</a>${action}</div></li>`;
  }).join('') : `<li class="empty">${workflow.externalBeforeFilters === 0 ? 'No problem references are available yet.' : 'No problem references match the active filters.'}</li>`;
  const field = (name: 'set' | 'tag' | 'source', label: string) => {
    const values = filters[name].length ? filters[name] : [''];
    return values.map((value, index) => `<label>${label}${values.length > 1 ? ` ${index + 1}` : ''}<input name="${name}" value="${escapeHtml(value)}"></label>`).join('');
  };
  const ignored = workflow.sourceFilterIgnoredForStrengthen ? `<p class="muted small" role="note">Source filters apply only to Practice externally, not retrieval evidence.</p>` : '';
  const onboarding = workflow.externalBeforeFilters === 0
    ? `<aside class="onboard" aria-label="Import preparation example"><p>Try the opt-in interview-pattern example:</p><code>mergelearn apply --file examples/interview-pattern-lesson.json --open</code></aside>` : '';
  const query = url.search;
  const nav = `<nav class="subtabs" aria-label="Practice views"><a href="/practice/strengthen${escapeHtml(query)}"${lane === 'strengthen' ? ' aria-current="page"' : ''}>Strengthen</a><a href="/practice/external${escapeHtml(query)}"${lane === 'external' ? ' aria-current="page"' : ''}>External problems</a></nav>`;
  const action = lane === 'strengthen' ? '/practice/strengthen' : '/practice/external';
  const fields = lane === 'strengthen'
    ? `${field('set', 'Set')}${field('tag', 'Tag')}`
    : `${field('set', 'Set')}${field('tag', 'Tag')}${field('source', 'Source')}`;
  const sourceNotice = lane === 'strengthen' && filters.source.length
    ? `<p class="muted small" role="note">Source was not applied to retrieval evidence. <a href="/practice/external${escapeHtml(query)}">Apply it to External problems.</a></p>`
    : '';
  const content = lane === 'strengthen'
    ? `<section aria-labelledby="strengthen-heading"><h1 id="strengthen-heading">Strengthen weak areas</h1><p class="muted">Based on past answers. Opening a card here does not grade it, change scheduling, or assert readiness.</p><ul class="prepare-list">${strengthen}</ul></section>`
    : `<section aria-labelledby="external-heading"><h1 id="external-heading">External problems</h1><p class="muted">External links leave MergeLearn. Nothing here is graded or scheduled, no result is recorded, and this view does not assert readiness.</p>${onboarding}<ul class="prepare-list">${external}</ul></section>`;
  const body = `${nav}<form class="prepare-filters" method="get" action="${action}" aria-label="Practice filters">${fields}<button type="submit">Apply filters</button></form>${sourceNotice}${content}`;
  return pageShell(`MergeLearn — ${lane === 'strengthen' ? 'Strengthen' : 'External problems'}`, 'practice', body, instanceId, false);
}

/** One Home lesson card: objective, meta, progress pill, and a single primary
 * action (Start / Continue / Practice again) plus due-review as a secondary. */
function renderLessonRow(s: SetSummary, progress: LessonProgress, dueCount: number): string {
  const href = `/practice?mode=lesson&set=${encodeURIComponent(s.id)}`;
  const actionLabel = progress.state === 'not_started' ? 'Start lesson'
    : progress.state === 'in_progress' ? 'Continue lesson'
    : 'Practice again';
  const pillLabel = progress.state === 'completed' ? 'Lesson complete'
    : progress.state === 'in_progress' ? `${progress.passedCount}/${progress.total} complete`
    : 'Not started';
  const kind = s.lessonKind ? `<span class="badge next">${escapeHtml(s.lessonKind)}</span>` : '';
  const objective = s.objective ? `<p class="lesson-obj">${escapeHtml(s.objective)}</p>` : '';
  const path = s.folderPath ? `<span class="path">${escapeHtml(s.folderPath)}</span>` : '';
  const est = s.estimatedMinutes ? `<span class="est">~${s.estimatedMinutes} min</span>` : '';
  const count = `<span class="count">${progress.total} activit${progress.total === 1 ? 'y' : 'ies'}</span>`;
  const evidence = `<span class="evidence-counts">${evidenceLabel(progress)}</span>`;
  const pill = `<span class="progress-pill state-${progress.state}">${pillLabel}</span>`;
  const review = dueCount > 0
    ? `<a class="secondary-action" href="/practice?set=${encodeURIComponent(s.id)}">Review ${dueCount} due</a>`
    : '';
  const disabled = progress.total === 0;
  const action = disabled
    ? `<span class="cta is-disabled">No activities</span>`
    : `<a class="cta" href="${href}">${actionLabel}</a>`;
  return `<li class="lesson-card">` +
    `<div class="lesson-head"><a class="lesson-title" href="/set/${encodeURIComponent(s.id)}">${escapeHtml(s.title)}</a>${kind}</div>` +
    `${objective}` +
    `<div class="lesson-meta">${path}${count}${est}${evidence}${pill}</div>` +
    `<div class="lesson-actions">${action}${review}</div>` +
    (disabled ? '' : `<p class="muted small session-requirement">Learning and Review sessions require JavaScript.</p>`) + `</li>`;
}

async function renderReviewScope(
  root: string, due: Card[], reviewSessionCap: number, picker: boolean,
): Promise<string> {
  const [{ folders, tags }, summaries] = await Promise.all([loadMasteryReport(root), listSetSummaries(root)]);
  const setFolders = new Map(summaries.map((summary) => [summary.id, summary.folderPath ?? '']));
  const data = JSON.stringify({
    cap: reviewSessionCap,
    picker,
    folders: folders.map((folder) => folder.path),
    tags: tags.map((tag) => ({ id: tag.id, label: tag.label })),
    due: due.map((card) => ({
      folderPath: card.folderPath ?? setFolders.get(card.setId) ?? '',
      tagIds: card.tagIds,
    })),
  }).replace(/</g, '\\u003c');
  const sitting = selectDueCards(due, reviewSessionCap).length;
  const waiting = Math.max(0, due.length - sitting);
  const lead = due.length
    ? `<p class="muted small">Reviewing all due cards. Completing Review updates scheduling. Grading requires JavaScript.</p>`
    : `<p class="caught-up"><strong>You are caught up.</strong> No cards are due right now.</p>`;
  return `<div class="review-scope" data-review-scope>${lead}` +
    (due.length ? `<a class="cta" href="/practice/session">Review ${sitting} now</a>${waiting ? `<span class="muted small backlog">${waiting} more waiting</span>` : ''}` : '') +
    `</div><script>(function(){var host=document.querySelector('[data-review-scope]');if(!host)return;var data=${data};` +
    `var selected={folderPaths:[],tagIds:[],combinator:'union'},storageOk=false;try{var probe='ml-scope-probe';localStorage.setItem(probe,'1');storageOk=localStorage.getItem(probe)==='1';localStorage.removeItem(probe);}catch(e){storageOk=false;}` +
    `if(storageOk)try{var raw=localStorage.getItem('ml-practice-filter');if(raw){var saved=JSON.parse(raw);if(Array.isArray(saved.folderPaths))selected.folderPaths=saved.folderPaths.filter(function(v){return typeof v==='string';});if(Array.isArray(saved.tagIds))selected.tagIds=saved.tagIds.filter(function(v){return typeof v==='string';});if(saved.combinator==='intersection')selected.combinator='intersection';}}catch(e){}` +
    `function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}` +
    `function active(){return selected.folderPaths.length||selected.tagIds.length;}` +
    `function matches(card){var tests=[];if(selected.folderPaths.length)tests.push(!!card.folderPath&&selected.folderPaths.some(function(f){return card.folderPath===f||card.folderPath.indexOf(f+'/')===0;}));if(selected.tagIds.length)tests.push(selected.tagIds.some(function(t){return card.tagIds.indexOf(t)>=0;}));if(!tests.length)return true;return selected.combinator==='intersection'?tests.every(Boolean):tests.some(Boolean);}` +
    `function save(){if(!storageOk)return;try{if(active()){var out={};if(selected.folderPaths.length)out.folderPaths=selected.folderPaths;if(selected.tagIds.length)out.tagIds=selected.tagIds;out.combinator=selected.combinator;localStorage.setItem('ml-practice-filter',JSON.stringify(out));}else localStorage.removeItem('ml-practice-filter');}catch(e){storageOk=false;}}` +
    `function toggle(key,value){var list=selected[key],i=list.indexOf(value);if(i>=0)list.splice(i,1);else list.push(value);save();render(key+':'+value);}` +
    `function render(refocus){var open=!!host.querySelector('.scope-picker[open]');var n=data.due.filter(matches).length,shown=data.cap?Math.min(n,data.cap):n;var labels=[];selected.folderPaths.forEach(function(v){labels.push(v);});selected.tagIds.forEach(function(v){var tag=data.tags.filter(function(t){return t.id===v;})[0];labels.push(tag?tag.label:v);});` +
    `var summary=active()?'Scope: '+labels.join(', ')+' · '+n+' due':'Reviewing all due cards · '+n+' due';var waiting=Math.max(0,n-shown);var empty=active()?'<p class="caught-up"><strong>You are caught up in this scope.</strong> No matching cards are due.</p>':'<p class="caught-up"><strong>You are caught up.</strong> No cards are due right now.</p>';var action=n?'<a class="cta" href="/practice/session">Review '+shown+' now</a>'+(waiting?'<span class="muted small backlog">'+waiting+' more waiting</span>':''):empty;var clear=active()?'<button type="button" class="clear" data-clear-scope>Clear scope</button>':'';` +
    `var picker='';if(data.picker&&storageOk){var folderButtons=data.folders.map(function(v){return '<button type="button" class="scope-option" data-scope-folder="'+esc(v)+'" aria-pressed="'+(selected.folderPaths.indexOf(v)>=0?'true':'false')+'">'+esc(v)+'</button>';}).join('');var tagButtons=data.tags.map(function(t){return '<button type="button" class="scope-option" data-scope-tag="'+esc(t.id)+'" aria-pressed="'+(selected.tagIds.indexOf(t.id)>=0?'true':'false')+'">'+esc(t.label)+'</button>';}).join('');picker='<details class="scope-picker"'+(open?' open':'')+'><summary>Review a selection</summary><p class="muted small">Choose folders or tags for the next scheduled Review. Values within a group match any; groups match '+(selected.combinator==='intersection'?'all':'any')+'.</p><div class="scope-options">'+folderButtons+tagButtons+'</div><label class="scope-combine">Combine groups <select data-scope-combinator><option value="union"'+(selected.combinator==='union'?' selected':'')+'>Match any</option><option value="intersection"'+(selected.combinator==='intersection'?' selected':'')+'>Match all</option></select></label></details>';}` +
    `host.innerHTML='<div class="scope-summary" tabindex="-1"><span role="status">'+esc(summary)+'</span>'+clear+'</div>'+action+(n?'<p class="muted small">Completing Review updates scheduling. Grading requires JavaScript.</p>':'')+picker;` +
    `var clearButton=host.querySelector('[data-clear-scope]');if(clearButton)clearButton.onclick=function(){selected={folderPaths:[],tagIds:[],combinator:'union'};save();render('summary');};[].forEach.call(host.querySelectorAll('[data-scope-folder]'),function(button){button.onclick=function(){toggle('folderPaths',button.getAttribute('data-scope-folder'));};});[].forEach.call(host.querySelectorAll('[data-scope-tag]'),function(button){button.onclick=function(){toggle('tagIds',button.getAttribute('data-scope-tag'));};});var combine=host.querySelector('[data-scope-combinator]');if(combine)combine.onchange=function(){selected.combinator=combine.value==='intersection'?'intersection':'union';save();render('combine');};if(refocus){var target=refocus==='summary'?(host.querySelector('.scope-picker summary')||host.querySelector('.scope-summary')):refocus==='combine'?host.querySelector('[data-scope-combinator]'):refocus.indexOf('folderPaths:')===0?[].filter.call(host.querySelectorAll('[data-scope-folder]'),function(x){return x.getAttribute('data-scope-folder')===refocus.slice(12);})[0]:[].filter.call(host.querySelectorAll('[data-scope-tag]'),function(x){return x.getAttribute('data-scope-tag')===refocus.slice(7);})[0];if(target)target.focus();}}` +
    `render();})();</script>`;
}

async function renderHome(root: string, instanceId: string): Promise<string> {
  const [summaries, due, evidenceMap, prefs] = await Promise.all([
    listSetSummaries(root),
    getDueCards(root, new Date()),
    lessonEvidenceBySet(root),
    loadUserPreferences(root),
  ]);
  const dueBySet = new Map<string, number>();
  for (const c of due) dueBySet.set(c.setId, (dueBySet.get(c.setId) ?? 0) + 1);

  if (summaries.length === 0) {
    const prompts = [
      'Create a MergeLearn lesson from my last PR.',
      'Create a MergeLearn lesson about TypeScript union types.',
      'Create a MergeLearn lesson from the files I have open.',
    ];
    const promptList = prompts.map((p) =>
      `<li><code class="copyable" tabindex="0" role="button" title="Click to copy">${escapeHtml(p)}</code></li>`).join('');
    const body = `<h1>No lessons yet</h1>` +
      `<p class="muted">Lessons are written by your coding agent, not typed in here.</p>` +
      `<div class="onboard">` +
      `<p class="onboard-step"><strong>Just want to see it?</strong> Install a built-in sample lesson and start learning now.</p>` +
      `<p><button type="button" class="cta" id="try-sample" data-server-mutation>Try a sample lesson</button> <span class="muted small" id="sample-status"></span></p>` +
      `<hr class="onboard-rule">` +
      `<p class="onboard-step"><strong>1.</strong> Or open your coding agent and ask it something like:</p>` +
      `<ul class="prompt-list">${promptList}</ul>` +
      `<p class="onboard-step"><strong>2.</strong> When it finishes, <button type="button" class="cta secondary" id="refresh-home">Refresh</button> this page and your lesson appears here.</p>` +
      `<p class="muted small">First time? Run <code>mergelearn setup-agent</code> once so your agent knows how to author.</p>` +
      `<details class="manual"><summary>Prefer to do it yourself?</summary>` +
      `<p class="muted small">Author a lesson from the command line, then reload:</p>` +
      `<code>mergelearn context [--goal "..."] &gt; context.json</code><br>` +
      `<code>mergelearn import --file patch.json</code></details>` +
      `</div>` +
      `<script>` +
      `document.getElementById('refresh-home').addEventListener('click',function(){location.reload();});` +
      `(function(){var btn=document.getElementById('try-sample'),st=document.getElementById('sample-status');if(!btn)return;function enable(){if(!window.__mlConnection||window.__mlConnection.state()!=='disconnected')btn.disabled=false;}btn.addEventListener('click',function(){btn.disabled=true;st.textContent='Installing…';fetch('/api/sample',{method:'POST'}).then(function(r){return r.json();}).then(function(j){if(j&&j.ok&&j.setId){location.href='/set/'+encodeURIComponent(j.setId);}else{st.textContent='Could not install the sample. Try: mergelearn sample';enable();}}).catch(function(){st.textContent='Could not install the sample. Try: mergelearn sample';enable();});});})();` +
      `[].forEach.call(document.querySelectorAll('.copyable'),function(el){function copy(){try{navigator.clipboard.writeText(el.textContent);el.classList.add('copied');setTimeout(function(){el.classList.remove('copied');},1200);}catch(e){}}el.addEventListener('click',copy);el.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();copy();}});});` +
      `</script>`;
    return pageShell('MergeLearn — Home', 'home', body, instanceId);
  }

  const progressRows = await Promise.all(summaries.map(async (summary) => ({
    summary,
    progress: await lessonProgressFor(root, summary.id, evidenceMap.get(summary.id) ?? new Map()),
  })));
  const current = progressRows
    .filter((row) => row.progress.state === 'in_progress')
    .sort((a, b) => (a.summary.id < b.summary.id ? -1 : a.summary.id > b.summary.id ? 1 : 0))[0];
  const workflow = await loadPrepareWorkflow(root, {});
  const weak = workflow.strengthen.slice(0, 3).map((row) =>
    `<li class="attention-row"><div><strong>${escapeHtml(row.prompt)}</strong><p>${escapeHtml(row.reason)}</p></div><a class="secondary-action" href="${escapeHtml(cardTargetHref(row.setId, row.cardId))}">View card</a></li>`).join('');
  const review = await renderReviewScope(root, due, prefs.reviewSessionCap, false);
  const inProgress = current
    ? `<ul class="lesson-list">${renderLessonRow(current.summary, current.progress, dueBySet.get(current.summary.id) ?? 0)}</ul>`
    : `<p class="muted">No lesson is in progress. <a href="/library">Browse lessons</a>.</p>`;
  const attention = `<p class="muted small">Opening these cards is ungraded and does not change scheduling.</p>` + (weak
    ? `<ul class="attention-list">${weak}</ul><p><a href="/practice/strengthen">See all weak areas</a></p>`
    : `<p class="muted">No evidence-backed weak cards yet.</p>`);
  const browse = `<form class="home-search" method="get" action="/library/cards"><label for="home-card-search">Search cards</label><input id="home-card-search" name="q" type="search" placeholder="Search cards and lessons"><button type="submit">Search</button></form><p><a href="/library">Browse all lessons</a></p>`;
  const body = `<h1>Home</h1><p class="muted">Your next useful actions, based only on saved learning evidence.</p>` +
    `<section class="dashboard-section"><h2>Review due</h2>${review}</section>` +
    `<section class="dashboard-section"><div class="section-head"><h2>In progress</h2><a href="/library">Browse all lessons</a></div>${inProgress}</section>` +
    `<section class="dashboard-section"><h2>Needs attention</h2>${attention}</section>` +
    `<section class="dashboard-section"><h2>Browse</h2>${browse}</section>`;
  return pageShell('MergeLearn — Home', 'home', body, instanceId);
}

async function renderLibrary(root: string, instanceId: string): Promise<string> {
  const [summaries, due, evidenceMap] = await Promise.all([
    listSetSummaries(root), getDueCards(root, new Date()), lessonEvidenceBySet(root),
  ]);
  const dueBySet = new Map<string, number>();
  for (const card of due) dueBySet.set(card.setId, (dueBySet.get(card.setId) ?? 0) + 1);
  const rows = (await Promise.all(summaries.map(async (summary) => {
    const progress = await lessonProgressFor(root, summary.id, evidenceMap.get(summary.id) ?? new Map());
    return renderLessonRow(summary, progress, dueBySet.get(summary.id) ?? 0);
  }))).join('');
  const views = `<nav class="subtabs" aria-label="Library views"><a href="/library" aria-current="page">Lessons</a><a href="/library/cards">Cards</a></nav>`;
  const body = `<div class="page-head"><div><h1>Library</h1><p class="muted">Browse lessons or search and manage individual cards.</p></div>${views}</div>` +
    (rows ? `<ul class="lesson-list">${rows}</ul>` : `<div class="empty">No lessons yet.</div>`);
  return pageShell('MergeLearn — Library', 'library', body, instanceId);
}

// ---- Set browser ----

/**
 * Server-rendered browser for one set: lists EVERY card (due or not) as an
 * expandable panel. Lets you revisit a card's front, frozen snippets, answer,
 * explanation and examples at any time — independent of the review schedule.
 */
async function renderSetBrowser(root: string, setId: string, showDogfood: boolean, instanceId: string): Promise<string> {
  const set = await loadSet(root, setId);
  if (!set) {
    const body = `<p><a href="/">← Home</a></p><h1>Set not found</h1>` +
      `<div class="empty">No set with id <code>${escapeHtml(setId)}</code>.</div>`;
    return pageShell('MergeLearn — Set', 'library', body, instanceId, false);
  }
  const [cards, due, order, evidence, dogfoodEvents] = await Promise.all([
    loadCardsForSet(root, setId),
    getDueCards(root, new Date(), { setIds: [setId] }),
    loadOrder(root, setId),
    lessonEvidenceForSet(root, setId),
    showDogfood ? listDogfoodEvents(root) : Promise.resolve([]),
  ]);
  const dueIds = new Set(due.map((c) => c.id));
  const now = Date.now();
  const progress = computeLessonProgress(orderActiveCards(cards, order).map((c) => c.id), evidence);

  const items = cards.map((card) => {
    const v = cardView(card);
    const isDue = dueIds.has(card.id);
    const dueDate = new Date(card.fsrs.due);
    const state = isDue
      ? `<span class="badge due">due now</span>`
      : `<span class="badge next">next ${dueDate.getTime() > now ? dueDate.toLocaleDateString() : 'soon'}</span>`;
    const srcs = v.sources.map((s) =>
      `<div class="src"><div class="meta">${escapeHtml(s.path)}:${s.startLine}-${s.endLine} @ ${escapeHtml(s.commit)} (${escapeHtml(s.status ?? 'unknown')})</div>${s.snippetHtml || `<pre>${escapeHtml(s.text)}</pre>`}</div>`,
    ).join('');
    const examples = v.examples.map((x) => {
      const head = `${x.label ?? ''}${x.language ? ` (${x.language})` : ''}`;
      const code = x.code ? `<pre><code>${escapeHtml(x.code)}</code></pre>` : '';
      const note = x.note ? `<div class="ex-note">${inlineCode(x.note)}</div>` : '';
      return `<div class="ex">${head ? `<div class="ex-label">${escapeHtml(head)}</div>` : ''}${code}${note}</div>`;
    }).join('');
    const mistakes = v.commonMistakes.length
      ? `<p class="label">Common mistakes</p><ul>${v.commonMistakes.map((m) => `<li>${inlineCode(m)}</li>`).join('')}</ul>`
      : '';
    const ctx = v.context ? `<div class="ctx markdown-body">${v.contextHtml || inlineCode(v.context)}</div>` : '';
    // Summary holds a safe one-line preview (a <summary> can't contain block
    // code); the full prompt — fenced code and all — renders in the body.
    const inspectCommand = `mergelearn show ${setId}/${card.id}`;
    return `<details class="browse-card" id="${escapeHtml(cardTargetId(card.id))}"><summary><span class="q">${promptPreview(v.prompt)}</span>${state}</summary>` +
      `<div class="browse-body">` +
      `<button type="button" class="copy-reference copy-card" data-copy-command="${escapeHtml(inspectCommand)}" aria-label="Copy reference" title="Copy reference"><span data-copy-label>Copy reference</span><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path></svg></button>` +
      `<p class="label">Question</p><div class="prompt-full markdown-body">${v.promptHtml || inlineCode(v.prompt)}</div>` +
      `${ctx}${srcs}` +
      `<p class="label">Answer</p><p class="short">${inlineCode(v.shortAnswer)}</p>` +
      `<p class="label">Explanation</p><div class="expl markdown-body">${v.explanationHtml || inlineCode(v.explanation)}</div>${examples}${mistakes}</div></details>`;
  }).join('');

  const path = set.folderPath ? `<span class="path">${escapeHtml(set.folderPath)}</span>` : '';
  const objective = set.objective
    ? `<div class="lesson-objective"><span class="label">Objective</span><strong>${escapeHtml(set.objective)}</strong></div>`
    : '';
  const kind = set.lessonKind ? `<span class="badge next">${escapeHtml(set.lessonKind)}</span>` : '';
  const learnHref = `/practice?mode=lesson&set=${encodeURIComponent(setId)}`;
  const reviewHref = `/practice?set=${encodeURIComponent(setId)}`;
  const learnLabel = progress.state === 'not_started' ? 'Start lesson'
    : progress.state === 'in_progress' ? 'Continue lesson'
    : 'Practice again';
  const actions = progress.total
    ? `<div class="lesson-actions"><a class="cta" href="${learnHref}">${learnLabel}</a>` +
      (due.length ? `<a class="secondary-action" href="${reviewHref}">Review ${due.length} due</a>` : '') + `</div>`
    : '';
  const sessionRequirement = progress.total
    ? `<p class="muted small session-requirement">Learning and Review sessions require JavaScript.</p>` : '';
  const pillLabel = progress.state === 'completed' ? 'Lesson complete'
    : progress.state === 'in_progress' ? `${progress.passedCount}/${progress.total} complete`
    : 'Not started';
  const est = set.estimatedMinutes ? ` · ~${set.estimatedMinutes} min` : '';
  const lastFeedback = dogfoodEvents.filter((event) => event.kind === 'feedback' && event.setId === setId).at(-1);
  const feedbackValue = lastFeedback?.kind === 'feedback' ? lastFeedback.worthAnswering : null;
  const dogfood = showDogfood ? `<div class="lesson-actions dogfood-actions" aria-label="Dogfood feedback">` +
    `<button class="secondary-action" data-dogfood-defer data-server-mutation>Not now</button>` +
    `<button class="secondary-action${feedbackValue === true ? ' sel' : ''}" data-dogfood="worth" data-server-mutation aria-pressed="${feedbackValue === true}">Worth it</button>` +
    `<button class="secondary-action${feedbackValue === false ? ' sel' : ''}" data-dogfood="not-worth" data-server-mutation aria-pressed="${feedbackValue === false}">Not worth it</button></div>` : '';
  const scheduling = `<label class="schedule-toggle"><input type="checkbox" id="spaced-repetition"${set.spacedRepetition === false ? '' : ' checked'} data-server-mutation>` +
    ` Include in spaced repetition</label>`;
  const dogfoodScript = showDogfood
    ? `document.querySelectorAll('[data-dogfood]').forEach(function(b){b.onclick=function(){var on=b.getAttribute('aria-pressed')==='true';var value=on?null:b.getAttribute('data-dogfood')==='worth';fetch('/api/dogfood/feedback',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({setId:id,worthAnswering:value})}).then(function(r){return r.json();}).then(function(j){if(!j.ok)return;document.querySelectorAll('[data-dogfood]').forEach(function(x){x.classList.remove('sel');x.setAttribute('aria-pressed','false');});if(value!==null){b.classList.add('sel');b.setAttribute('aria-pressed','true');}});};});` +
      `var defer=document.querySelector('[data-dogfood-defer]');if(defer)defer.onclick=function(){fetch('/api/dogfood/defer',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({setId:id})}).then(function(r){return r.json();}).then(function(j){if(j.ok){defer.textContent='Deferred';setTimeout(function(){defer.textContent='Not now';},1200);}});};`
    : '';
  const controlsScript = `<script>(function(){var id=${JSON.stringify(setId)};` +
    `function copyText(text,b){var label=b.querySelector('[data-copy-label]');var done=function(){b.classList.add('copied');b.setAttribute('aria-label','Reference copied');b.title='Copied';if(label)label.textContent='Copied';setTimeout(function(){b.classList.remove('copied');b.setAttribute('aria-label','Copy reference');b.title='Copy reference';if(label)label.textContent='Copy reference';},1200);};if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(done);return;}var a=document.createElement('textarea');a.value=text;document.body.appendChild(a);a.select();try{document.execCommand('copy');done();}finally{a.remove();}}` +
    `document.querySelectorAll('[data-copy-command]').forEach(function(b){b.onclick=function(){copyText(b.getAttribute('data-copy-command'),b);};});` +
    dogfoodScript +
    `var sr=document.getElementById('spaced-repetition');if(sr)sr.onchange=function(){var enabled=sr.checked;sr.disabled=true;fetch('/api/set/spaced-repetition',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({setId:id,enabled:enabled})}).then(function(r){return r.json();}).then(function(j){if(!j.ok)sr.checked=!enabled;}).finally(function(){if(!window.__mlConnection||window.__mlConnection.state()!=='disconnected')sr.disabled=false;});};` +
    `var t=null;function ping(){if(document.visibilityState==='visible')fetch('/api/keepalive').catch(function(){});}function start(){if(!t){ping();t=setInterval(ping,60000);}}function stop(){if(t){clearInterval(t);t=null;}}document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')start();else stop();});start();})();</script>`;
  const body = `<p><a href="/">← Home</a></p><h1>${escapeHtml(set.title)}</h1>` +
    `<p class="muted">${path} ${kind} ${progress.total} active activit${progress.total === 1 ? 'y' : 'ies'}${est} · ` +
    `<span class="evidence-counts">${evidenceLabel(progress)}</span> · ` +
    `<span class="progress-pill state-${progress.state}">${pillLabel}</span> · ${due.length} due</p>` +
    `${objective}${actions}${sessionRequirement}${scheduling}${dogfood}` +
    (cards.length ? `<div class="browse-list">${items}</div>` : `<div class="empty">This set has no cards yet.</div>`) +
    controlsScript;
  return pageShell(`MergeLearn — ${set.title}`, 'library', body, instanceId, false);
}

// ---- Manage tab (doc 06) ----

/** Per-folder and per-tag mastery for the Manage tab. The computation lives in
 * core/library/mastery.ts so the `mastery` CLI command reports identical
 * numbers from identical rules. */
const loadManageData = loadMasteryReport;

/** "88% still remembered", or plain language when nothing has been attempted.
 * Never "0% remembered": that reads as total forgetting, when it really means
 * the learner has not started. */
function retentionLabel(s: ProgressStats): string {
  return s.studied === 0 ? 'not studied yet' : `${s.retention}% still remembered`;
}

/** Tooltip text carrying BOTH measures. The bar and the visible number show
 * coverage (how much has been learned); retention lives here because showing a
 * second bar would need new CSS, and an honest label plus a tooltip is the
 * smaller change that removes the misleading "100% mastery" reading. */
function progressTitle(s: ProgressStats, noun: string): string {
  return `${s.coverage}% learned, ${retentionLabel(s)} — `
    + `${s.cardCount} card${s.cardCount === 1 ? '' : 's'} ${noun}, ${s.studied} studied`;
}

async function renderManage(root: string, url: URL, instanceId: string): Promise<string> {
  const [{ tags, cards }, sets] = await Promise.all([loadManageData(root), listSetSummaries(root)]);
  const query = url.searchParams.get('q') ?? '';
  const setId = url.searchParams.get('set') ?? '';
  const selectedTags = url.searchParams.getAll('tag').filter(Boolean);
  const stateValue = url.searchParams.get('state') ?? '';
  const state = /^[0-3]$/.test(stateValue) ? Number(stateValue) as 0 | 1 | 2 | 3 : undefined;
  const includeArchived = url.searchParams.get('archived') === '1';
  const initial = await searchCardsPage(root, query, {
    setIds: setId ? [setId] : undefined, tagIds: selectedTags,
    includeArchived, state, limit: 100,
  });
  const cardsJson = JSON.stringify(cards).replace(/</g, '\\u003c');
  const setOptions = sets.map((set) => `<option value="${escapeHtml(set.id)}"${set.id === setId ? ' selected' : ''}>${escapeHtml(set.title)}</option>`).join('');
  const tagOptions = tags.map((tag) => `<option value="${escapeHtml(tag.id)}"${selectedTags.includes(tag.id) ? ' selected' : ''}>${escapeHtml(tag.label)}</option>`).join('');
  const stateOption = (value: number, label: string) => `<option value="${value}"${state === value ? ' selected' : ''}>${label}</option>`;
  const legacyScope = (url.searchParams.has('folderPath') || url.searchParams.has('folder'))
    && !url.searchParams.has('q') && !url.searchParams.has('set') && !url.searchParams.has('state') && !url.searchParams.has('archived');
  const moved = legacyScope
    ? `<p class="notice" role="status">Temporary Review scope moved to <a href="/practice">Practice</a>. Library Cards shows the full searchable library.</p>` : '';
  const noScriptRows = (initial.cards.length
    ? `<ul class="prepare-list">${initial.cards.map((card) => `<li class="prepare-row"><strong>${escapeHtml(card.prompt)}</strong><p>${escapeHtml(card.setTitle)} · ${escapeHtml(card.shortAnswer)}</p><a href="${escapeHtml(cardTargetHref(card.setId, card.cardId))}">View card</a></li>`).join('')}</ul>`
    : `<div class="empty">No cards match.</div>`) + (initial.hasMore ? `<p class="muted">Showing the first ${initial.returned} of ${initial.total} matches. Enable JavaScript to load more.</p>` : '');
  const views = `<nav class="subtabs" aria-label="Library views"><a href="/library">Lessons</a><a href="/library/cards" aria-current="page">Cards</a></nav>`;
  const body = `<div class="page-head"><div><h1>Cards</h1><p class="muted">Search, inspect, edit, archive, or restore cards.</p></div>${views}</div>${moved}` +
    `<section class="card-curation"><details class="card-filter-panel" open><summary>Filter cards</summary>` +
    `<form class="card-tools" method="get" action="/library/cards#card-status"><label>Search<input id="card-search" name="q" type="search" value="${escapeHtml(query)}" placeholder="Search cards and lessons"></label>` +
    `<label>Set<select id="card-set" name="set"><option value="">All sets</option>${setOptions}</select></label>` +
    `<label>Tags<select id="card-tags" name="tag" multiple>${tagOptions}</select></label>` +
    `<label>Learning state<select id="card-state" name="state"><option value="">All states</option>${stateOption(0, 'New')}${stateOption(1, 'Learning')}${stateOption(2, 'Review')}${stateOption(3, 'Relearning')}</select></label>` +
    `<label><input id="show-archived" name="archived" value="1" type="checkbox"${includeArchived ? ' checked' : ''}> Show archived</label><button type="submit">Search</button></form></details>` +
    `<div class="section-head"><h2 class="sr-only">Card results</h2><span class="muted small" id="card-status" tabindex="-1" role="status" aria-live="polite">${initial.returned} of ${initial.total}</span></div>` +
    `<noscript><style>#card-results{display:none}</style>${noScriptRows}</noscript><div id="card-results" class="curation-list"><span class="muted">Loading cards…</span></div>` +
    `<p><button type="button" id="load-more-cards" class="secondary-action" hidden>Load more</button> ` +
    `<button type="button" id="reload-cards" class="secondary-action" hidden>Reload results</button></p></section>` +
    `<script type="application/json" id="ml-cards">${cardsJson}</script>`;
  return pageShell('MergeLearn — Cards', 'library', body, instanceId, false) +
    `<script>${manageScript()}</script>`;
}

function manageScript(): string {
  return `
${manageDraftKey.toString()}
${decideManageDraft.toString()}
var CARDS=[];
var cardPage={generation:0,offset:0,total:0,snapshot:null,inFlight:false,reloadQueued:false,notice:''};
try{CARDS=JSON.parse(document.getElementById('ml-cards').textContent)||[];}catch(e){CARDS=[];}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function cardStatus(t){var n=document.getElementById('card-status');if(n)n.textContent=t;}
function copyText(text,button){
  var label=button.querySelector('[data-copy-label]');
  var done=function(){button.classList.add('copied');button.setAttribute('aria-label','Reference copied');button.title='Copied';if(label)label.textContent='Copied';setTimeout(function(){button.classList.remove('copied');button.setAttribute('aria-label','Copy reference');button.title='Copy reference';if(label)label.textContent='Copy reference';},1200);};
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(done).catch(function(){cardStatus('Copy failed');});return;}
  var area=document.createElement('textarea');area.value=text;document.body.appendChild(area);area.select();try{document.execCommand('copy');done();}catch(e){cardStatus('Copy failed');}area.remove();
}
function cardHtml(c){
  var action=c.status==='archived'?'unarchive':'archive';
  return '<article class="curation-card" tabindex="-1" data-set="'+esc(c.setId)+'" data-card="'+esc(c.cardId)+'" data-updated="'+esc(c.updatedAt)+'">'+
    '<div class="curation-head"><strong>'+esc(c.prompt)+'</strong><div class="curation-head-actions"><button type="button" class="copy-reference" data-copy-card aria-label="Copy reference" title="Copy reference"><span data-copy-label>Copy reference</span><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path></svg></button><button type="button" class="copy-reference" data-card-action="'+action+'" data-server-mutation>'+(action==='archive'?'Archive':'Restore')+'</button></div></div>'+
    '<div class="curation-meta muted small"><span>'+esc(c.setTitle)+' · '+esc(c.setId)+'/'+esc(c.cardId)+'</span><span class="badge next">'+esc(c.status)+'</span></div><p>'+esc(c.shortAnswer)+'</p>'+
    '<details class="curation-edit"><summary>Edit teaching text</summary><label>Prompt<textarea data-edit="prompt" rows="2">'+esc(c.prompt)+'</textarea></label>'+
    '<label>Short answer<textarea data-edit="shortAnswer" rows="2">'+esc(c.shortAnswer)+'</textarea></label>'+
    '<label>Explanation<textarea data-edit="explanation" rows="4">'+esc(c.explanation)+'</textarea></label>'+
    '<div class="draft-notice" data-manage-draft-notice hidden></div>'+
    '<button type="button" class="primary" data-card-action="edit" data-server-mutation>Save changes</button></details></article>';
}
function manageDraftFields(row){return {prompt:row.querySelector('[data-edit="prompt"]').value,shortAnswer:row.querySelector('[data-edit="shortAnswer"]').value,explanation:row.querySelector('[data-edit="explanation"]').value};}
function discardManageDraft(row){try{localStorage.removeItem(manageDraftKey(row.getAttribute('data-set'),row.getAttribute('data-card')));}catch(e){}var n=row.querySelector('[data-manage-draft-notice]');if(n){n.hidden=true;n.innerHTML='';}}
function wireManageDiscard(row){var b=row.querySelector('[data-discard-manage-draft]');if(b)b.onclick=function(){discardManageDraft(row);};}
function showManageDraft(row,decision,raw){
  var notice=row.querySelector('[data-manage-draft-notice]');if(!notice||decision.kind==='none')return;
  notice.hidden=false;
  if(decision.kind==='restore'){
    row.querySelector('[data-edit="prompt"]').value=decision.value.prompt;row.querySelector('[data-edit="shortAnswer"]').value=decision.value.shortAnswer;row.querySelector('[data-edit="explanation"]').value=decision.value.explanation;
    notice.innerHTML='<span>Unsaved draft restored.</span> <button type="button" data-discard-manage-draft>Discard</button>';wireManageDiscard(row);return;
  }
  var usable=null;try{var parsed=JSON.parse(raw);if(parsed&&parsed.fields)usable=parsed.fields;}catch(e){}
  notice.innerHTML='<p>This draft belongs to an older card version. Review it before using it.</p><textarea readonly rows="4">'+esc(raw)+'</textarea>'+(usable?'<button type="button" data-use-manage-draft>Use recovered draft</button> ':'')+'<button type="button" data-discard-manage-draft>Discard</button>';
  if(usable){notice.querySelector('[data-use-manage-draft]').onclick=function(){['prompt','shortAnswer','explanation'].forEach(function(k){if(typeof usable[k]==='string')row.querySelector('[data-edit="'+k+'"]').value=usable[k];});notice.innerHTML='<span>Recovered draft applied. Review before saving.</span> <button type="button" data-discard-manage-draft>Discard</button>';wireManageDiscard(row);};}
  wireManageDiscard(row);
}
function restoreManageDrafts(){[].forEach.call(document.querySelectorAll('.curation-card'),function(row){var raw=null;try{raw=localStorage.getItem(manageDraftKey(row.getAttribute('data-set'),row.getAttribute('data-card')));}catch(e){}showManageDraft(row,decideManageDraft(raw,row.getAttribute('data-set'),row.getAttribute('data-card'),row.getAttribute('data-updated')),raw||'');});}
function persistManageDraft(row){try{localStorage.setItem(manageDraftKey(row.getAttribute('data-set'),row.getAttribute('data-card')),JSON.stringify({version:1,setId:row.getAttribute('data-set'),cardId:row.getAttribute('data-card'),updatedAt:row.getAttribute('data-updated'),fields:manageDraftFields(row)}));}catch(e){}}
function cardQuery(expectedOffset){
  var params=new URLSearchParams();var q=document.getElementById('card-search').value||'';
  if(q)params.set('q',q);var setId=document.getElementById('card-set').value;if(setId)params.set('set',setId);
  [].forEach.call(document.getElementById('card-tags').selectedOptions,function(option){params.append('tag',option.value);});
  var state=document.getElementById('card-state').value;if(state!=='')params.set('state',state);
  if(document.getElementById('show-archived').checked)params.set('archived','1');
  params.set('offset',String(expectedOffset));params.set('limit','100');
  if(expectedOffset>0&&cardPage.snapshot)params.set('snapshot',cardPage.snapshot);
  return params;
}
function updateCardPaging(hasMore){
  var more=document.getElementById('load-more-cards');more.hidden=!hasMore;more.disabled=cardPage.inFlight;
  document.getElementById('reload-cards').hidden=true;cardStatus((cardPage.notice?cardPage.notice+' ':'')+cardPage.offset+' of '+cardPage.total);cardPage.notice='';
}
function resetCardResults(notice){
  cardPage.notice=typeof notice==='string'?notice:'';
  cardPage.generation++;cardPage.offset=0;cardPage.total=0;cardPage.snapshot=null;
  document.getElementById('card-results').innerHTML='<span class="muted">Loading cards…</span>';
  document.getElementById('load-more-cards').hidden=true;document.getElementById('reload-cards').hidden=true;
  if(cardPage.inFlight){cardPage.reloadQueued=true;return;}loadCardResults();
}
async function loadCardResults(){
  if(cardPage.inFlight)return;
  var requestGeneration=cardPage.generation,expectedOffset=cardPage.offset,box=document.getElementById('card-results');
  cardPage.inFlight=true;document.getElementById('load-more-cards').disabled=true;
  try{
    var r=await fetch('/api/cards?'+cardQuery(expectedOffset).toString());var j=await r.json();
    if(requestGeneration!==cardPage.generation||expectedOffset!==cardPage.offset)return;
    if(r.status===409&&j.code==='snapshot_mismatch'){
      cardStatus('Library changed. Reload results before continuing.');document.getElementById('load-more-cards').hidden=true;document.getElementById('reload-cards').hidden=false;document.getElementById('reload-cards').focus();return;
    }
    if(!r.ok||!j.ok)throw new Error(j.error||'card search failed');
    if(expectedOffset===0){cardPage.snapshot=j.snapshot;box.innerHTML='';}
    else if(j.snapshot!==cardPage.snapshot){cardStatus('Library changed. Reload results before continuing.');document.getElementById('load-more-cards').hidden=true;document.getElementById('reload-cards').hidden=false;return;}
    var incoming=j.cards||[],beforeRows=box.querySelectorAll('.curation-card').length;box.insertAdjacentHTML('beforeend',incoming.map(cardHtml).join(''));
    var newRows=[].slice.call(box.querySelectorAll('.curation-card'),beforeRows);
    cardPage.offset=expectedOffset+incoming.length;cardPage.total=j.total;
    if(cardPage.offset===0)box.innerHTML='<div class="empty">No cards match.</div>';
    restoreManageDrafts();if(window.__mlConnection)window.__mlConnection.refreshControls();updateCardPaging(!!j.hasMore);
    if(expectedOffset>0&&newRows.length)newRows[0].focus();
  }catch(e){if(requestGeneration===cardPage.generation)cardStatus('Could not load cards');}
  finally{cardPage.inFlight=false;document.getElementById('load-more-cards').disabled=false;if(cardPage.reloadQueued){cardPage.reloadQueued=false;loadCardResults();}}
}
async function cardAction(button){
  var row=button.closest('.curation-card'),action=button.getAttribute('data-card-action');if(!row||!action)return;
  var body={setId:row.getAttribute('data-set'),cardId:row.getAttribute('data-card'),expectedUpdatedAt:row.getAttribute('data-updated')};
  if(action==='edit')body.edit={front:{prompt:row.querySelector('[data-edit="prompt"]').value},back:{shortAnswer:row.querySelector('[data-edit="shortAnswer"]').value,explanationMarkdown:row.querySelector('[data-edit="explanation"]').value}};
  button.disabled=true;try{var r=await fetch('/api/card/'+action,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});var j=await r.json();if(!j.ok){cardStatus(j.error||'Update failed');if(!window.__mlConnection||window.__mlConnection.state()!=='disconnected')button.disabled=false;return;}if(action==='edit')discardManageDraft(row);resetCardResults(action==='edit'?'Saved.':'Card updated.');}catch(e){cardStatus('Update failed. Draft kept.');if(!window.__mlConnection||window.__mlConnection.state()!=='disconnected')button.disabled=false;}
}
var searchTimer=null;document.getElementById('card-search').addEventListener('input',function(){clearTimeout(searchTimer);searchTimer=setTimeout(resetCardResults,180);});
['card-set','card-tags','card-state','show-archived'].forEach(function(id){document.getElementById(id).addEventListener('change',resetCardResults);});
document.getElementById('load-more-cards').addEventListener('click',loadCardResults);
document.getElementById('reload-cards').addEventListener('click',resetCardResults);
document.getElementById('card-results').addEventListener('click',function(e){
  var copy=e.target.closest&&e.target.closest('[data-copy-card]');
  if(copy){var row=copy.closest('.curation-card');copyText('mergelearn show '+row.getAttribute('data-set')+'/'+row.getAttribute('data-card'),copy);return;}
  var b=e.target.closest&&e.target.closest('[data-card-action]');if(b)cardAction(b);
});
document.getElementById('card-results').addEventListener('input',function(e){var field=e.target.closest&&e.target.closest('[data-edit]');if(field){var row=field.closest('.curation-card');if(row)persistManageDraft(row);}});
loadCardResults();
`;
}


/** Server-side inline-code formatter (mirrors the client `fmt`): `code` → <code>. */
function inlineCode(value: string): string {
  return escapeHtml(value).replace(/`([^`]+)`/g, '<code>$1</code>');
}

/** One-line, block-safe preview of a prompt for a <summary> header. A <summary>
 * can only hold phrasing content, so we strip fenced code blocks, collapse all
 * whitespace, truncate, and flag that code exists so the header stays tidy even
 * when the full question (rendered in the body) is long or code-heavy. */
function promptPreview(value: string, max = 110): string {
  const hadFence = /```/.test(value);
  const text = value
    .replace(/```[\s\S]*?```/g, ' ') // drop fenced blocks
    .replace(/`{3,}/g, ' ') // stray/unclosed fence markers
    .replace(/\s+/g, ' ')
    .trim();
  let preview = text;
  let truncated = false;
  if (preview.length > max) {
    preview = preview.slice(0, max).replace(/\s+\S*$/, '');
    truncated = true;
  }
  let html = escapeHtml(preview).replace(/`([^`]+)`/g, '<code>$1</code>');
  if (truncated) html += '…';
  if (hadFence) html += ' <span class="q-code">⟨code⟩</span>';
  return html || '<span class="muted">(untitled)</span>';
}

// ---- Code display: diff-snippet (ported from the old platform's diffView.ts) ----

type DiffLine = { kind: 'add' | 'delete' | 'context' | 'meta'; marker: string; text: string };

function parseDiffSnippet(code: string): DiffLine[] {
  return code.split('\n').map((line) => {
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')) return { kind: 'meta', marker: line.slice(0, 2), text: line };
    if (line.startsWith('+')) return { kind: 'add', marker: '+', text: line.slice(1) };
    if (line.startsWith('-')) return { kind: 'delete', marker: '-', text: line.slice(1) };
    return { kind: 'context', marker: ' ', text: line.startsWith(' ') ? line.slice(1) : line };
  });
}

function renderDiffSnippetHtml(code: string): string {
  const lines = parseDiffSnippet(code);
  return `<div class="diff-snippet" role="region" aria-label="Code snippet">${lines.map((line, i) => `<div class="diff-line ${line.kind}"><span class="line-no">${i + 1}</span><span class="marker">${escapeHtml(line.marker)}</span><code>${escapeHtml(line.text || ' ')}</code></div>`).join('')}</div>`;
}

// ---- Markdown rendering (ported from the old platform's markdownHtml.ts) ----

function inlineMarkdown(text: string): string {
  let html = escapeHtml(text);
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, href) => {
    const safeHref = escapeHtml(String(href).trim());
    if (!/^https?:\/\//i.test(safeHref) && !/^mailto:/i.test(safeHref)) return escapeHtml(String(label));
    return `<a href="${safeHref}" rel="noopener noreferrer">${escapeHtml(String(label))}</a>`;
  });
  return html;
}

function renderMarkdownHtml(markdown: string): string {
  const normalized = markdown.replace(/\r\n/g, '\n').trim();
  if (!normalized) return '';
  const blocks: string[] = [];
  const lines = normalized.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    // Code fence
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      i++; const codeLines: string[] = [];
      while (i < lines.length && !(lines[i] ?? '').startsWith('```')) { codeLines.push(lines[i] ?? ''); i++; }
      if (i < lines.length) i++;
      const code = codeLines.join('\n');
      // Mermaid: emit a <pre class="mermaid"> the client turns into an SVG.
      // Content is HTML-escaped for safe embedding; the browser decodes it back
      // to real text in .textContent, which is what mermaid parses. If the
      // diagram engine can't load, the raw source stays visible (graceful).
      if (lang === 'mermaid') {
        blocks.push(`<pre class="mermaid">${escapeHtml(code)}</pre>`);
        continue;
      }
      blocks.push(`<pre><code${lang ? ` class="language-${escapeHtml(lang)}"` : ''}>${escapeHtml(code)}</code></pre>`);
      continue;
    }
    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = Math.min(headingMatch[1]!.length, 6);
      blocks.push(`<h${level}>${inlineMarkdown(headingMatch[2] ?? '')}</h${level}>`);
      i++; continue;
    }
    // Unordered list
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i] ?? '')) { items.push(lines[i] ?? ''); i++; }
      blocks.push(`<ul>${items.map((l) => `<li>${inlineMarkdown(l.replace(/^[-*]\s+/, ''))}</li>`).join('')}</ul>`);
      continue;
    }
    // Ordered list
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i] ?? '')) { items.push(lines[i] ?? ''); i++; }
      blocks.push(`<ol>${items.map((l) => `<li>${inlineMarkdown(l.replace(/^\d+\.\s+/, ''))}</li>`).join('')}</ol>`);
      continue;
    }
    if (!line.trim()) { i++; continue; }
    // Paragraph
    const para: string[] = [];
    while (i < lines.length) {
      const cur = lines[i] ?? '';
      if (!cur.trim() || cur.startsWith('```') || /^(#{1,6})\s+/.test(cur) || /^[-*]\s+/.test(cur) || /^\d+\.\s+/.test(cur)) break;
      para.push(cur); i++;
    }
    blocks.push(`<p>${inlineMarkdown(para.join(' '))}</p>`);
  }
  return blocks.join('\n');
}

// ---- Practice ----

async function renderPracticeHub(root: string, url: URL, instanceId: string): Promise<string> {
  const [due, prefs, workflow] = await Promise.all([
    getDueCards(root, new Date()), loadUserPreferences(root), loadPrepareWorkflow(root, {}),
  ]);
  const ignored = (url.searchParams.has('mode') || url.searchParams.has('tag'))
    ? `<p class="notice" role="status">That incomplete review link was not started. Choose a practice mode below.</p>` : '';
  const reviewAction = await renderReviewScope(root, due, prefs.reviewSessionCap, true);
  const body = `<h1>Choose how to practice</h1><p class="muted">Review is scheduled and graded. Strengthen and External problems are read-only planning views.</p>${ignored}` +
    `<div class="mode-grid"><section class="mode-card primary-mode"><p class="eyebrow">Scheduled and graded</p><h2>Review due</h2>${reviewAction}</section>` +
    `<section class="mode-card"><p class="eyebrow">Ungraded</p><h2>Strengthen weak areas</h2><p>${workflow.strengthen.length} evidence-backed card${workflow.strengthen.length === 1 ? '' : 's'}.</p><a class="secondary-action" href="/practice/strengthen">Browse weak areas</a></section>` +
    `<section class="mode-card"><p class="eyebrow">Ungraded</p><h2>External problems</h2><p>${workflow.external.length} author-supplied reference${workflow.external.length === 1 ? '' : 's'}.</p><a class="secondary-action" href="/practice/external">Browse external problems</a></section></div>`;
  return pageShell('MergeLearn — Practice', 'practice', body, instanceId);
}

/**
 * The active Review runner is client-rendered: a static shell that fetches the
 * session APIs, shows one card, and persists every grade.
 */
function renderPractice(url: URL, instanceId: string): string {
  const requestedLesson = url.searchParams.get('mode') === 'lesson' && url.searchParams.has('set');
  const body =
    `<noscript><style>#session-ui{display:none}</style><div class="notice">Learning and Review sessions require JavaScript. <a href="/practice">Return to Practice</a>.</div></noscript>` +
    `<div id="session-ui"><h1>${requestedLesson ? 'Learn' : 'Review'}</h1>` +
    `<div id="launch-notice" class="notice" role="status" hidden></div>` +
    `<div id="progress" class="muted" style="margin:6px 0 4px"></div>` +
    `<div class="session-tools"><button type="button" id="undo-grade" class="secondary-action" data-server-mutation aria-describedby="retry-guidance" hidden>Undo last answer</button><button type="button" id="end-session" class="secondary-action" data-server-mutation aria-describedby="retry-guidance">End session</button></div>` +
    `<div id="mount"></div>` +
    `<div id="retry-guidance" class="draft-notice" role="status" aria-live="polite" hidden></div>` +
    `<div class="status" id="status" aria-live="polite"></div></div>` +
    `<script>${practiceScript()}</script>`;
  return pageShell(`MergeLearn — ${requestedLesson ? 'Learn' : 'Review'}`, 'practice', body, instanceId, false);
}

function practiceScript(): string {
  return `
${practiceDraftKey.toString()}
${decidePracticeDraft.toString()}
var queue=[];var pos=0;var reviewed=0;var reviewedCards={};var waitingBacklog=0;var confidence=0;var sessionId=null;var mutationBusy=false;
var attempt=null;var cardStartedAt=0;var practiceMode='review';var dragEl=null;
var revision=0;var currentEntryId=null;var pendingRequestId=null;var pendingRequestBody=null;var pendingUndoBody=null;var lastGrade=null;var sessionSummary={reviewedCount:0,distinctCardCount:0};var planRemaining=0;var revisitRemaining=0;var plannedCount=0;var explicitlyEnded=false;var startFailure=null;
function statusMsg(t){var s=document.getElementById('status');s.textContent=t;s.classList.add('show');setTimeout(function(){s.classList.remove('show');},1600);}
function retryGuidance(t){var n=document.getElementById('retry-guidance');if(!n)return;n.textContent=t||'';n.hidden=!t;}
function clearRetryGuidance(){retryGuidance('');}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function copyText(text,button){
  var label=button.querySelector('[data-copy-label]');
  var done=function(){button.classList.add('copied');button.setAttribute('aria-label','Reference copied');button.title='Copied';if(label)label.textContent='Copied';statusMsg('Reference copied');setTimeout(function(){button.classList.remove('copied');button.setAttribute('aria-label','Copy reference');button.title='Copy reference';if(label)label.textContent='Copy reference';},1200);};
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(done).catch(function(){statusMsg('copy failed');});return;}
  var area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);area.select();
  try{document.execCommand('copy');done();}catch(e){statusMsg('copy failed');}area.remove();
}
function problemRefsHtml(c){
  var refs=c.problemRefs||[];if(!refs.length)return '';
  var items=refs.map(function(ref){
    var identity=(ref.title?'<strong>'+esc(ref.title)+'</strong> · ':'')+esc(ref.sourceName)+' '+esc(ref.sourceId);
    var linkLabel=ref.sourceName+' '+ref.sourceId+' at '+ref.hostname+' (opens in a new tab)';
    var link=ref.href&&ref.hostname?'<a href="'+esc(ref.href)+'" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" aria-label="'+esc(linkLabel)+'">'+esc(ref.hostname)+'</a>':'<span class="muted">Link unavailable</span>';
    var attrs=(ref.attributions||[]).map(function(a){
      var label=a.kind==='company'?'Reported by '+esc(ref.sourceName)+': '+esc(a.label):esc(a.label);
      return '<li>'+label+', as of '+esc(a.observedOn)+'</li>';
    }).join('');
    return '<li><div>'+identity+' · '+link+'</div>'+(attrs?'<ul class="problem-attributions">'+attrs+'</ul>':'')+'</li>';
  }).join('');
  return '<section class="problem-refs" aria-labelledby="problem-refs-label"><p class="label" id="problem-refs-label">Problem references</p><ul>'+items+'</ul></section>';
}
function progress(){var p=document.getElementById('progress');var n=Number(sessionSummary.reviewedCount)||0;var distinct=Number(sessionSummary.distinctCardCount)||0;if(!queue.length){p.textContent=n?n+' attempt'+(n===1?'':'s')+' · '+distinct+' card'+(distinct===1?'':'s')+' reviewed':'';return;}var position=Math.max(1,plannedCount-planRemaining+1);var reviewWork=planRemaining+' card'+(planRemaining===1?'':'s')+' remaining'+(revisitRemaining?' · '+revisitRemaining+' revisit'+(revisitRemaining===1?'':'s'):'');p.textContent=n+' attempt'+(n===1?'':'s')+' · '+(practiceMode==='lesson'?'Activity '+position+' of '+plannedCount:reviewWork);}
function syncUndo(){var b=document.getElementById('undo-grade');if(b)b.hidden=!lastGrade;}
function syncEnd(){var b=document.getElementById('end-session');if(b)b.disabled=!sessionId;}
function applySessionState(j){
  if(!j)return;startFailure=null;sessionId=j.sessionId||sessionId;if(j.sessionMode)practiceMode=j.sessionMode==='lesson'?'lesson':'review';document.title='MergeLearn — '+(practiceMode==='lesson'?'Learn':'Review');var heading=document.querySelector('main h1');if(heading)heading.textContent=practiceMode==='lesson'?'Learn':'Review';revision=Number(j.revision)||0;sessionSummary=j.summary||sessionSummary;lastGrade=null;
  currentEntryId=j.current?j.current.entryId:null;queue=j.current?[j.current.card]:[];pos=0;reviewed=Number(sessionSummary.reviewedCount)||0;planRemaining=Number(j.remaining)||0;revisitRemaining=Number(j.revisitRemaining)||0;plannedCount=Number(j.plannedCount)||0;waitingBacklog=Number(j.backlog)||0;
  if(sessionId)try{localStorage.setItem('ml-active-session',sessionId);}catch(e){}
  syncEnd();
}
function render(){
  progress();
  var mount=document.getElementById('mount');
  if(pos>=queue.length){
    var distinct=Number(sessionSummary.distinctCardCount)||Object.keys(reviewedCards).length;
    var reviewSummary=distinct+' card'+(distinct===1?'':'s')+' reviewed'+(reviewed!==distinct?' in '+reviewed+' attempts':'');
    var unresolved=Number(sessionSummary.unresolved)||0;var skippedSummary=unresolved?' '+unresolved+' card'+(unresolved===1?' was':'s were')+' skipped.':'';
    var dueSummary=(waitingBacklog?waitingBacklog+' more waiting.':'Nothing more due.')+skippedSummary;
    var done=practiceMode==='lesson'?(waitingBacklog?'Lesson sitting complete — '+reviewed+' activities completed. '+waitingBacklog+' activities remain.':'Lesson complete — '+reviewed+' activities completed. Reviews are now scheduled.'):'Session complete — '+reviewSummary+'. '+dueSummary;
    var empty=startFailure?'Session could not start. '+startFailure:planRemaining>0?'This session changed. Reload to continue.':practiceMode==='lesson'?'This lesson has no active activities.':'Nothing due right now. Come back later, or author more cards.';
    // Finishing is the moment the learner is most receptive, so never leave
    // them on a dead end. With a backlog, offer the next sitting; without one,
    // offer the two things worth doing next instead of nothing at all.
    var forward=waitingBacklog
      ?(sessionId?'<button type="button" class="secondary-action" id="continue-session" data-server-mutation>'+(practiceMode==='lesson'?'Continue lesson':'Review next sitting')+'</button>':'<a class="secondary-action" id="continue-session" href="'+esc(location.pathname+location.search)+'">'+(practiceMode==='lesson'?'Continue lesson':'Review next sitting')+'</a>')
      :'<a class="secondary-action" href="/">Back to lessons</a><a class="secondary-action" href="/manage">See your progress</a>';
    var next='<div class="done-actions">'+forward+'</div>';
    var emptyNext='<div class="done-actions"><a class="secondary-action" href="/">Back to lessons</a><a class="secondary-action" href="/manage">See your progress</a></div>';
    var completed=explicitlyEnded||(planRemaining===0&&(plannedCount>0||reviewed>0||Number(sessionSummary.unresolved)>0));
    mount.innerHTML=completed?'<div class="done-note" tabindex="-1">'+done+'</div>'+next:'<div class="empty">'+empty+'</div>'+emptyNext;
    var continueButton=document.getElementById('continue-session');if(continueButton&&sessionId)continueButton.onclick=continueSitting;return;
  }
  var c=queue[pos];confidence=0;attempt=null;cardStartedAt=Date.now();
  var interaction=c.interaction||{type:'flashcard'};

  // Sticky progressive disclosure: default collapsed, but remember the choice
  // so a learner who wants depth isn't re-collapsing it every card.
  var deepOpen=false;try{deepOpen=localStorage.getItem('ml-deep-open')==='1';}catch(e){}
  var fmt=function(s){return esc(s).replace(/\x60([^\x60]+)\x60/g,'<code>$1</code>');};
  var srcs=(c.sources||[]).map(function(s){return '<div class="src"><div class="meta">'+esc(s.path)+':'+s.startLine+'-'+s.endLine+' @ '+esc(s.commit)+' ('+esc(s.status)+')</div>'+(s.snippetHtml||'<pre>'+esc(s.text)+'</pre>')+'</div>';}).join('');
  var examples=(c.examples||[]).map(function(x){var head=(x.label||'')+(x.language?' ('+x.language+')':'');var code=x.code?'<pre><code>'+esc(x.code)+'</code></pre>':'';var note=x.note?'<div class="ex-note">'+fmt(x.note)+'</div>':'';return '<div class="ex">'+(head?'<div class="ex-label">'+esc(head)+'</div>':'')+code+note+'</div>';}).join('');
  var ctx=c.context?'<div class="ctx markdown-body">'+(c.contextHtml||fmt(c.context))+'</div>':'';
  var mistakes=(c.commonMistakes||[]).length?'<p class="label">Common mistakes</p><ul>'+c.commonMistakes.map(function(m){return '<li>'+fmt(m)+'</li>';}).join('')+'</ul>':'';
  var confLabels=[['1','Guessing'],['2','Low'],['3','Medium'],['4','High'],['5','Certain']];
  var confBtns=confLabels.map(function(p){return '<button type="button" role="radio" aria-checked="false" class="c'+p[0]+'" data-c="'+p[0]+'" aria-label="'+p[1]+', shortcut '+p[0]+'">'+p[1]+'<kbd aria-hidden="true">'+p[0]+'</kbd></button>';}).join('');
  var attemptUi='';
  if(interaction.type==='self_response'){
    attemptUi='<div class="attempt"><label class="label" for="attempt-text">Your answer</label><textarea id="attempt-text" rows="3" placeholder="'+esc(interaction.placeholder||'Write a short answer before revealing...')+'"></textarea></div>';
  }else if(interaction.type==='choice'){
    var inputType=(interaction.correctOptionIds||[]).length>1?'checkbox':'radio';
    attemptUi='<fieldset class="attempt choices"><legend class="label">Choose your answer</legend>'+interaction.options.map(function(o){return '<label class="choice"><input type="'+inputType+'" name="answer" value="'+esc(o.id)+'"><span>'+esc(o.text)+'</span></label>';}).join('')+'</fieldset>';
  }else if(interaction.type==='parsons'){
    var pblocks=shuffleParsons(interaction.blocks||[],interaction.correctOrder||[]);
    var pitems=pblocks.map(function(b){var lbl=b.label?'<span class="p-label">'+esc(b.label)+'</span>':'';return '<li class="p-block" data-bid="'+esc(b.id)+'" tabindex="0" draggable="true" role="option" aria-selected="false"><span class="p-move"><button type="button" class="p-up" aria-label="Move block up" tabindex="-1">▲</button><button type="button" class="p-down" aria-label="Move block down" tabindex="-1">▼</button></span><span class="p-body">'+lbl+'<pre><code>'+esc(b.code)+'</code></pre></span></li>';}).join('');
    attemptUi='<div class="attempt parsons"><p class="label">Put the code blocks in the correct order</p><p class="p-hint">Click a block then use ↑/↓, drag it, or use the ▲▼ buttons.</p><ol class="p-list" id="p-list" role="listbox" aria-label="Order the code blocks">'+pitems+'</ol></div>';
  }
  var inspectCommand='mergelearn show '+c.setId+'/'+c.id;
  mount.innerHTML='<article class="pcard"><div class="topline"><span>'+esc(c.setTitle||'Review')+'</span><button type="button" class="copy-reference copy-practice-card" data-copy-practice-card aria-label="Copy reference" title="Copy reference"><span data-copy-label>Copy reference</span><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path></svg></button></div>'+
    '<div class="prompt markdown-body">'+(c.promptHtml||fmt(c.prompt))+'</div>'+ctx+srcs+attemptUi+
    '<div class="draft-notice" id="practice-draft-notice" hidden></div>'+
    '<div class="confidence" id="confidence"><p class="label" id="conf-label">Submit and reveal: how confident are you?</p><div class="conf-opts" role="radiogroup" aria-labelledby="conf-label">'+confBtns+'</div></div>'+
    '<div class="reveal" id="reveal-panel"><div id="attempt-review" aria-live="polite"></div><p class="label">Expected answer</p><p class="short">'+fmt(c.shortAnswer)+'</p>'+
    '<div id="problem-refs"></div>'+
    '<details class="deep" id="deep"'+(deepOpen?' open':'')+'><summary><span class="deep-more">Show full explanation</span><span class="deep-less">Hide full explanation</span></summary>'+
    '<div class="expl markdown-body">'+(c.explanationHtml||fmt(c.explanation))+'</div>'+examples+mistakes+'</details>'+
    '<p class="label grade-label">Now that you\\'ve seen it — how well did you actually know it?</p>'+
    '<div class="actions grade"><button class="g1" data-r="1" data-server-mutation aria-describedby="retry-guidance" aria-label="Again, shortcut 1">Again<kbd aria-hidden="true">1</kbd></button><button class="g2" data-r="2" data-server-mutation aria-describedby="retry-guidance" aria-label="Hard, shortcut 2">Hard<kbd aria-hidden="true">2</kbd></button><button class="g3" data-r="3" data-server-mutation aria-describedby="retry-guidance" aria-label="Good, shortcut 3">Good<kbd aria-hidden="true">3</kbd></button><button class="g4" data-r="4" data-server-mutation aria-describedby="retry-guidance" aria-label="Easy, shortcut 4">Easy<kbd aria-hidden="true">4</kbd></button></div></div></article>';
  [].forEach.call(document.querySelectorAll('#confidence button'),function(b){b.addEventListener('click',function(){setConfidence(Number(b.getAttribute('data-c')));});});

  var copyBtn=document.querySelector('[data-copy-practice-card]');if(copyBtn)copyBtn.addEventListener('click',function(){copyText(inspectCommand,copyBtn);});
  wireParsons();
  wirePracticeDraft(c);
  [].forEach.call(document.querySelectorAll('.grade button'),function(b){b.addEventListener('click',function(){grade(Number(b.getAttribute('data-r')));});});
  if(window.__mlConnection)window.__mlConnection.refreshControls();
  var deep=document.getElementById('deep');
  if(deep)deep.addEventListener('toggle',function(){try{localStorage.setItem('ml-deep-open',deep.open?'1':'0');}catch(e){}});
}
function practiceDraftResponse(c){
  var i=c.interaction||{type:'flashcard'};
  if(i.type==='self_response'){var t=document.getElementById('attempt-text');return {interaction:i.type,text:t?t.value:''};}
  if(i.type==='choice')return {interaction:i.type,selectedOptionIds:[].map.call(document.querySelectorAll('.choices input:checked'),function(x){return x.value;})};
  if(i.type==='parsons')return {interaction:i.type,orderedBlockIds:[].map.call(document.querySelectorAll('#p-list .p-block'),function(x){return x.getAttribute('data-bid');})};
  return null;
}
function persistPracticeDraft(c){var response=practiceDraftResponse(c);if(!response)return;try{localStorage.setItem(practiceDraftKey(c.setId,c.id),JSON.stringify({version:1,setId:c.setId,cardId:c.id,response:response}));}catch(e){}}
function clearPracticeDraft(c){try{localStorage.removeItem(practiceDraftKey(c.setId,c.id));}catch(e){}}
function applyPracticeResponse(response){
  if(!response||typeof response!=='object')return;
  if(response.interaction==='self_response'){var t=document.getElementById('attempt-text');if(t&&typeof response.text==='string')t.value=response.text;}
  else if(response.interaction==='choice'&&Array.isArray(response.selectedOptionIds)){[].forEach.call(document.querySelectorAll('.choices input'),function(x){x.checked=response.selectedOptionIds.indexOf(x.value)>=0;});}
  else if(response.interaction==='parsons'&&Array.isArray(response.orderedBlockIds)){var list=document.getElementById('p-list');if(list){response.orderedBlockIds.forEach(function(id){var n=[].filter.call(list.children,function(x){return x.getAttribute('data-bid')===id;})[0];if(n)list.appendChild(n);});}}
}
function wirePracticeDiscard(c){var b=document.querySelector('[data-discard-practice-draft]');if(b)b.onclick=function(){clearPracticeDraft(c);var n=document.getElementById('practice-draft-notice');if(n){n.hidden=true;n.innerHTML='';}};}
function restorePracticeDraft(c){
  var raw=null;try{raw=localStorage.getItem(practiceDraftKey(c.setId,c.id));}catch(e){}
  var interaction=(c.interaction||{type:'flashcard'}).type;
  var decision=decidePracticeDraft(raw,c.setId,c.id,interaction),notice=document.getElementById('practice-draft-notice');if(!notice||decision.kind==='none')return;
  notice.hidden=false;
  if(decision.kind==='restore'){applyPracticeResponse(decision.value);notice.innerHTML='<span>Unsaved answer restored.</span> <button type="button" data-discard-practice-draft>Discard</button>';wirePracticeDiscard(c);return;}
  var recovered=null;try{var parsed=JSON.parse(raw);if(parsed)recovered=parsed.response;}catch(e){}
  notice.innerHTML='<p>A saved answer does not match this card. Review it before using it.</p><textarea readonly rows="3">'+esc(raw||'')+'</textarea>'+(recovered?'<button type="button" data-use-practice-draft>Use recovered answer</button> ':'')+'<button type="button" data-discard-practice-draft>Discard</button>';
  if(recovered){notice.querySelector('[data-use-practice-draft]').onclick=function(){applyPracticeResponse(recovered);notice.innerHTML='<span>Recovered answer applied. Review before submitting.</span> <button type="button" data-discard-practice-draft>Discard</button>';wirePracticeDiscard(c);};}
  wirePracticeDiscard(c);
}
function wirePracticeDraft(c){
  restorePracticeDraft(c);
  var t=document.getElementById('attempt-text');if(t)t.addEventListener('input',function(){persistPracticeDraft(c);});
  var choices=document.querySelector('.choices');if(choices)choices.addEventListener('change',function(){persistPracticeDraft(c);});
  var list=document.getElementById('p-list');if(list){list.addEventListener('click',function(){setTimeout(function(){persistPracticeDraft(c);},0);});list.addEventListener('keyup',function(){persistPracticeDraft(c);});list.addEventListener('drop',function(){persistPracticeDraft(c);});}
}
function setConfidence(n){
  // Confidence is the single submit/reveal action. This keeps Guessing and the
  // other levels consistent while collectAttempt still prevents a non-Guessing
  // submit until the authored interaction has an answer.
  // aria-checked must track the .sel class so the selection is not colour-only.
  confidence=n;[].forEach.call(document.querySelectorAll('#confidence button'),function(b){var on=Number(b.getAttribute('data-c'))===n;b.classList.toggle('sel',on);b.setAttribute('aria-checked',on?'true':'false');});
  if(!reveal()){confidence=0;[].forEach.call(document.querySelectorAll('#confidence button'),function(b){b.classList.remove('sel');b.setAttribute('aria-checked','false');});}
}
// Present blocks in a non-solved order. Fisher-Yates, then if it landed on the
// exact solution (likely for tiny sets) rotate once so the task never starts done.
function shuffleParsons(blocks,correctOrder){
  var a=blocks.slice();
  for(var k=a.length-1;k>0;k--){var j=Math.floor(Math.random()*(k+1));var t=a[k];a[k]=a[j];a[j]=t;}
  if(a.length>1){var solved=a.every(function(b,n){return b.id===correctOrder[n];});if(solved)a.push(a.shift());}
  return a;
}
// Three input methods over one reorder primitive: (1) ▲▼ buttons, (2) click a
// tile to select then ↑/↓ arrows, (3) drag and drop. All no-op after reveal.
// Native HTML5 DnD (no touch) is progressive enhancement; buttons+select work
// everywhere.
function wireParsons(){
  var list=document.getElementById('p-list');if(!list)return;
  function select(li){
    [].forEach.call(list.querySelectorAll('.p-block'),function(x){var on=x===li;x.classList.toggle('sel',on);x.setAttribute('aria-selected',on?'true':'false');});
  }
  // dir<0 up, dir>0 down. Returns true if it moved. Keeps li selected+focused.
  function move(li,dir){
    if(isRevealed()||!li)return false;
    if(dir<0&&li.previousElementSibling){list.insertBefore(li,li.previousElementSibling);}
    else if(dir>0&&li.nextElementSibling){list.insertBefore(li.nextElementSibling,li);}
    else return false;
    select(li);li.focus();return true;
  }
  [].forEach.call(list.querySelectorAll('.p-up'),function(btn){btn.addEventListener('click',function(e){e.stopPropagation();move(btn.closest('.p-block'),-1);});});
  [].forEach.call(list.querySelectorAll('.p-down'),function(btn){btn.addEventListener('click',function(e){e.stopPropagation();move(btn.closest('.p-block'),1);});});
  [].forEach.call(list.querySelectorAll('.p-block'),function(li){
    li.addEventListener('click',function(){if(isRevealed())return;select(li);});
    li.addEventListener('keydown',function(e){
      if(isRevealed())return;
      if(e.key==='ArrowUp'){e.preventDefault();move(li,-1);}
      else if(e.key==='ArrowDown'){e.preventDefault();move(li,1);}
    });
    // Drag and drop (mouse/pointer). Reorders the DOM live; grading reads DOM order.
    li.addEventListener('dragstart',function(e){if(isRevealed()){e.preventDefault();return;}dragEl=li;li.classList.add('dragging');select(li);if(e.dataTransfer){e.dataTransfer.effectAllowed='move';try{e.dataTransfer.setData('text/plain',li.getAttribute('data-bid'));}catch(_){}}});
    li.addEventListener('dragend',function(){if(dragEl)dragEl.classList.remove('dragging');dragEl=null;});
  });
  // Insert the dragged tile before/after the tile under the cursor by midpoint.
  list.addEventListener('dragover',function(e){
    if(isRevealed()||!dragEl)return;
    e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect='move';
    var over=e.target&&e.target.closest?e.target.closest('.p-block'):null;
    if(!over||over===dragEl)return;
    var r=over.getBoundingClientRect();var after=e.clientY>r.top+r.height/2;
    list.insertBefore(dragEl,after?over.nextElementSibling:over);
  });
  list.addEventListener('drop',function(e){if(dragEl){e.preventDefault();dragEl.focus();}});
}
function collectAttempt(){
  var c=queue[pos],i=c.interaction||{type:'flashcard'};
  if(i.type==='flashcard')return {interaction:'flashcard',elapsedMs:Date.now()-cardStartedAt};
  if(confidence===1){
    if(i.type==='self_response')return {interaction:'self_response',responseText:'',elapsedMs:Date.now()-cardStartedAt};
    if(i.type==='choice')return {interaction:'choice',selectedOptionIds:[],correct:false,elapsedMs:Date.now()-cardStartedAt};
    return {interaction:'parsons',orderedBlockIds:[],correct:false,elapsedMs:Date.now()-cardStartedAt};
  }
  if(i.type==='self_response'){
    var text=(document.getElementById('attempt-text').value||'').trim();
    if(!text&&confidence!==1){statusMsg('Write an answer, or choose Guessing.');return null;}
    return {interaction:'self_response',responseText:text,elapsedMs:Date.now()-cardStartedAt};
  }
  if(i.type==='parsons'){
    var order=[].map.call(document.querySelectorAll('#p-list .p-block'),function(x){return x.getAttribute('data-bid');});
    var want=i.correctOrder||[];
    var ok=order.length===want.length&&order.every(function(x,n){return x===want[n];});
    return {interaction:'parsons',orderedBlockIds:order,correct:ok,elapsedMs:Date.now()-cardStartedAt};
  }
  var ids=[].map.call(document.querySelectorAll('.choices input:checked'),function(x){return x.value;});
  if(!ids.length){statusMsg('Choose an answer first.');return null;}
  var expected=(i.correctOptionIds||[]).slice().sort();var actual=ids.slice().sort();
  var correct=expected.length===actual.length&&expected.every(function(x,n){return x===actual[n];});
  return {interaction:'choice',selectedOptionIds:ids,correct:correct,elapsedMs:Date.now()-cardStartedAt};
}
function attemptReviewHtml(c,a){
  if(!a||a.interaction==='flashcard')return '';
  if(a.interaction==='self_response')return '<p class="label">Your answer</p><p class="learner-answer">'+(a.responseText?esc(a.responseText):'<span class="muted">No answer — marked Guessing</span>')+'</p>';
  if(a.interaction==='parsons'){
    var pi=c.interaction;var byId={};(pi.blocks||[]).forEach(function(b){byId[b.id]=b;});
    var correctHtml=(pi.correctOrder||[]).map(function(id){var b=byId[id]||{code:id};return '<li><pre><code>'+esc(b.code)+'</code></pre></li>';}).join('');
    var head='<p class="result '+(a.correct?'correct':'incorrect')+'">'+(a.correct?'Correct order':'Not quite')+'</p>';
    return head+(a.correct?'':'<p class="label">Correct order</p><ol class="p-solution">'+correctHtml+'</ol>');
  }
  var i=c.interaction;var selected=new Set(a.selectedOptionIds||[]);
  var feedback=i.options.filter(function(o){return selected.has(o.id);}).map(function(o){return '<li><strong>'+esc(o.text)+'</strong> — '+esc(o.feedback)+'</li>';}).join('');
  if(!feedback)feedback='<li class="muted">No answer — marked Guessing</li>';
  return '<p class="result '+(a.correct?'correct':'incorrect')+'">'+(a.correct?'Correct':'Not quite')+'</p><p class="label">Feedback on your choice</p><ul class="choice-feedback">'+feedback+'</ul>';
}
function reveal(){
  if(!confidence){statusMsg('Rate confidence (1-5) first.');return false;}
  if(isRevealed())return true;
  attempt=collectAttempt();if(!attempt)return false;
  var c=queue[pos];document.getElementById('attempt-review').innerHTML=attemptReviewHtml(c,attempt);
  document.getElementById('problem-refs').innerHTML=problemRefsHtml(c);
  document.getElementById('reveal-panel').classList.add('show');
  var conf=document.getElementById('confidence');if(conf)conf.classList.add('locked');
  var area=document.querySelector('.attempt');if(area)area.classList.add('locked');
  if(window.__mlMermaid)window.__mlMermaid();return true;
}
function isRevealed(){var p=document.getElementById('reveal-panel');return p&&p.classList.contains('show');}
async function grade(r){
  var c=queue[pos];if(!c)return;
  if(!sessionId){statusMsg('no active session');return;}
  if(mutationBusy)return;mutationBusy=true;
  try{
    if(attempt){var deep=document.getElementById('deep');attempt.revealedFull=!!(deep&&deep.open);}
    if(pendingRequestBody&&pendingRequestBody.rating!==r){var retryText='Saved answer is '+(['','Again','Hard','Good','Easy'][pendingRequestBody.rating])+'. Press that answer to retry.';retryGuidance(retryText);statusMsg(retryText);return;}
    if(!pendingRequestBody){pendingRequestId=(crypto.randomUUID?crypto.randomUUID():String(Date.now())+'-'+Math.random());pendingRequestBody={sessionId:sessionId,requestId:pendingRequestId,revision:revision,entryId:currentEntryId,cardId:c.id,setId:c.setId,rating:r,confidence:confidence||undefined,attempt:attempt||undefined};}
    var sentBody=pendingRequestBody;
    var res=await fetch('/api/session/grade',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(sentBody)});
    var j=await res.json();
    if(!j.ok){
      if(!j.state&&j.retryable){var kept='Answer kept for retry: '+(['','Again','Hard','Good','Easy'][pendingRequestBody.rating])+'.';retryGuidance(kept);statusMsg(j.error||kept);return;}
      if(!j.state){pendingRequestId=null;pendingRequestBody=null;clearRetryGuidance();if(j.code==='card_unavailable'){clearPracticeDraft(c);pendingUndoBody=null;lastGrade=null;queue=[];planRemaining=Math.max(planRemaining,1);statusMsg('Card was archived · reload to continue');render();syncUndo();return;}statusMsg(j.error||'grade failed');return;}
      if(j.code==='card_unavailable')clearPracticeDraft(c);pendingUndoBody=null;applySessionState(j.state);pendingRequestId=null;pendingRequestBody=null;clearRetryGuidance();statusMsg(j.code==='card_unavailable'?'Card was archived · skipped':j.error||'grade failed');render();syncUndo();return;
    }
    clearPracticeDraft(c);
    pendingRequestId=null;pendingRequestBody=null;clearRetryGuidance();
    reviewed++;reviewedCards[c.id]=(reviewedCards[c.id]||0)+1;
    pendingUndoBody=null;applySessionState(j.state);lastGrade=j.resultClass==='scheduled'?{rating:r,cardId:c.id,entryId:j.entryId,gradeRequestId:j.requestId}:null;statusMsg(j.resultClass==='evidence'?'Attempt recorded':j.requeued?'Again · queued for another look':'Graded · next due '+new Date(j.due).toLocaleDateString());
    render();syncUndo();
  }catch(e){if(pendingRequestBody&&sentBody){var kept='Answer kept for retry: '+(['','Again','Hard','Good','Easy'][sentBody.rating])+'.';retryGuidance(kept);statusMsg('grade failed. '+kept);}else statusMsg('Grade saved, but the page could not refresh. Reload to continue.');}finally{mutationBusy=false;}
}
async function undoGrade(){
  if(!lastGrade||!sessionId)return;
  if(mutationBusy)return;mutationBusy=true;
  try{
    if(!pendingUndoBody)pendingUndoBody={sessionId:sessionId,requestId:(crypto.randomUUID?crypto.randomUUID():String(Date.now())+'-'+Math.random()),revision:revision,entryId:lastGrade.entryId,gradeRequestId:lastGrade.gradeRequestId};
    var res=await fetch('/api/session/undo',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(pendingUndoBody)});
    var j=await res.json();if(!j.ok){if(!j.state&&j.retryable){retryGuidance('Undo kept for retry.');statusMsg(j.error||'Undo kept for retry.');return;}pendingUndoBody=null;clearRetryGuidance();if(j.state){pendingRequestId=null;pendingRequestBody=null;applySessionState(j.state);}statusMsg(j.error||'undo failed');render();syncUndo();return;}
    applySessionState(j.state);pendingUndoBody=null;pendingRequestId=null;pendingRequestBody=null;lastGrade=null;clearRetryGuidance();render();syncUndo();statusMsg('Last answer undone');
  }catch(e){statusMsg('undo failed. Request kept for retry.');}finally{mutationBusy=false;}
}
var undoBtn=document.getElementById('undo-grade');if(undoBtn)undoBtn.addEventListener('click',undoGrade);
async function continueSitting(){
  if(!sessionId||mutationBusy)return;mutationBusy=true;
  try{var target=location.pathname+location.search;var res=await fetch('/api/session/end',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId:sessionId})});var j=await res.json();if(!j.ok){statusMsg(j.error||'end failed');return;}try{localStorage.removeItem('ml-active-session');}catch(e){}location.href=target;}
  catch(e){statusMsg('Could not continue. Try End session.');}finally{mutationBusy=false;}
}
async function endCurrentSession(){
  if(!sessionId){statusMsg('No active session');syncEnd();return;}if(mutationBusy)return;mutationBusy=true;
  try{var res=await fetch('/api/session/end',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId:sessionId})});var j=await res.json();if(!j.ok){statusMsg(j.error||'end failed');return;}try{localStorage.removeItem('ml-active-session');}catch(e){}sessionSummary=j.summary||sessionSummary;sessionId=null;queue=[];waitingBacklog+=planRemaining;planRemaining=0;pendingRequestId=null;pendingRequestBody=null;pendingUndoBody=null;lastGrade=null;clearRetryGuidance();explicitlyEnded=true;render();syncUndo();syncEnd();var done=document.querySelector('.done-note');if(done)done.focus();statusMsg('Session ended');}
  catch(e){statusMsg('end failed');}finally{mutationBusy=false;}
}
var endBtn=document.getElementById('end-session');if(endBtn)endBtn.addEventListener('click',endCurrentSession);
syncEnd();
document.addEventListener('keydown',function(e){
  if(['INPUT','TEXTAREA','SELECT','BUTTON'].indexOf(e.target.tagName)>=0)return;
  if(/^[1-5]$/.test(e.key)&&!isRevealed()){setConfidence(Number(e.key));return;}
  if(/^[1-4]$/.test(e.key)&&isRevealed())grade(Number(e.key));
});
(async function(){
  var params=new URLSearchParams(location.search);var setParam=params.get('set');
  var lessonMode=params.get('mode')==='lesson'&&!!setParam;practiceMode=lessonMode?'lesson':'review';
  var filter=null;try{var raw=localStorage.getItem('ml-practice-filter');if(raw)filter=JSON.parse(raw);}catch(e){}
  if(setParam&&!lessonMode)filter={setIds:[setParam]};
  if(lessonMode){var h=document.querySelector('main h1');if(h)h.textContent='Learn';}
  var sessionBody=lessonMode?{lessonSetId:setParam}:(filter||{});
  var pendingStartKey='ml-pending-session-start';
  function sorted(v){return Array.isArray(v)?v.slice().sort():[];}
  function intentKey(body){var f=body.lessonSetId?{setIds:[body.lessonSetId],folderPaths:[],tagIds:[],combinator:'union'}:{setIds:sorted(body.setIds),folderPaths:sorted(body.folderPaths),tagIds:sorted(body.tagIds),combinator:body.combinator||'union'};return JSON.stringify({mode:body.lessonSetId?'study_once':body.mode==='study_once'||body.mode==='retry_missed'?body.mode:'review_due',lesson:!!body.lessonSetId,filter:f});}
  function sessionKey(j){var f=j.filter||{};return JSON.stringify({mode:j.mode,lesson:j.sessionMode==='lesson',filter:{setIds:sorted(f.setIds),folderPaths:sorted(f.folderPaths),tagIds:sorted(f.tagIds),combinator:f.combinator||'union'}});}
  try{
    var saved=null;try{saved=localStorage.getItem('ml-active-session');}catch(e){}
    var sj=null;if(saved){var rr=await fetch('/api/session/'+encodeURIComponent(saved));if(rr.ok)sj=await rr.json();}
    if(sj&&sj.ok&&!sj.ended&&sessionKey(sj)!==intentKey(sessionBody)){var notice=document.getElementById('launch-notice');if(notice){notice.hidden=false;notice.textContent='Your unfinished session was resumed. The newly requested practice was not started.';}}
    if(!sj||!sj.ok||sj.ended){
      var startBody=null;try{var pendingStart=localStorage.getItem(pendingStartKey);if(pendingStart){var parsedStart=JSON.parse(pendingStart);if(intentKey(parsedStart)===intentKey(sessionBody))startBody=pendingStart;}}catch(e){}
      if(!startBody){var startRequest=Object.assign({},sessionBody,{requestId:'start-'+(crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random())});startBody=JSON.stringify(startRequest);try{localStorage.setItem(pendingStartKey,startBody);}catch(e){}}
      var sr=await fetch('/api/session/start',{method:'POST',headers:{'content-type':'application/json'},body:startBody});
      sj=await sr.json();
      try{localStorage.removeItem(pendingStartKey);}catch(e){}
    }
    if(sj.ok)applySessionState(sj);else{startFailure=sj.error||'Try again after restoring session write access.';statusMsg(startFailure);}
  }catch(e){startFailure='Try again after restoring session write access.';statusMsg('session start failed');queue=[];}
  render();
})();
`;
}

// ---- HTTP helpers ----

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 1024 * 1024) throw new Error('JSON body too large');
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (raw && !String(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
    throw new Error('JSON content type required');
  }
  return raw ? JSON.parse(raw) : {};
}

function sendHtml(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
  res.end(body);
}

function sendRedirect(res: ServerResponse, location: string): void {
  res.writeHead(302, { location });
  res.end();
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(`${JSON.stringify(body)}\n`);
}

function sendText(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(body);
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}


// ---- HTML shell ----

type Tab = 'home' | 'library' | 'practice';

function pageShell(title: string, tab: Tab, body: string, instanceId: string, exact = true): string {
  const tabs: { id: Tab; href: string; label: string }[] = [
    { id: 'home', href: '/', label: 'Home' },
    { id: 'library', href: '/library', label: 'Library' },
    { id: 'practice', href: '/practice', label: 'Practice' },
  ];
  const nav = tabs
    .map((t) => {
      const current = t.id === tab ? ` aria-current="${exact ? 'page' : 'true'}"` : '';
      return `<a href="${t.href}"${current}>${t.label}</a>`;
    })
    .join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" />` +
    `<meta name="viewport" content="width=device-width, initial-scale=1" />` +
    `<title>${escapeHtml(title)}</title><style>${style()}</style></head><body>` +
    `<header class="topbar"><span class="brand">MergeLearn</span>` +
    `<nav class="tabs">${nav}</nav>` +
    `<span class="hint">local · model-free</span></header>` +
    `<div id="connection-status" class="connection-status" role="status" aria-live="polite" ` +
    `data-connection-controller data-server-instance="${escapeHtml(instanceId)}" hidden></div>` +
    `<script data-connection-runtime>${connectionControllerScript(instanceId)}</script><main>${body}</main>` +
    `<script>${mermaidLoader()}</script></body></html>`;
}

function connectionControllerScript(instanceId: string): string {
  return `(function(){var factory=${createConnectionController.toString()};` +
    `window.__mlConnection=factory({fetch:window.fetch.bind(window),doc:document,storage:window.localStorage,instanceId:${JSON.stringify(instanceId)}});` +
    `window.fetch=window.__mlConnection.guardedFetch;` +
    `if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){window.__mlConnection.checkHealth();});else window.__mlConnection.checkHealth();})();`;
}

/**
 * Client mermaid loader. Lazy: fetches the diagram engine ONLY when a
 * `.mermaid` element exists, so Home/Manage stay fully offline. Shared by the
 * server-rendered set browser (present on load) and the client-rendered
 * Practice tab (inserted after fetch, possibly inside a collapsed <details>).
 * CDN failure is silent — the raw diagram source stays visible in the <pre>.
 */
function mermaidLoader(): string {
  return `
(function(){
  var loading=null;
  function present(){return document.querySelector('.mermaid:not([data-processed])');}
  window.__mlMermaid=function(){
    if(!present())return;
    if(!loading){
      loading=import('https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs')
        .then(function(m){var lib=m.default;lib.initialize({startOnLoad:false,theme:'dark',securityLevel:'strict'});return lib;})
        .catch(function(){loading=null;return null;});
    }
    loading.then(function(lib){if(!lib)return;try{lib.run({querySelector:'.mermaid:not([data-processed])'});}catch(e){}});
  };
  if(document.readyState!=='loading')window.__mlMermaid();
  else document.addEventListener('DOMContentLoaded',window.__mlMermaid);
  // toggle doesn't bubble — capture so diagrams inside a collapsed <details> render on open.
  document.addEventListener('toggle',function(){window.__mlMermaid();},true);
})();
`;
}

function style(): string {
  return `
*,*:before,*:after{box-sizing:border-box}
:root{
  --bg:#0d1117;--raised:#161b22;--overlay:#1c2128;--hover:#21262d;
  --border:rgba(48,54,61,1);--border-soft:rgba(48,54,61,0.6);
  --text:#e6edf3;--muted:#8b949e;--link:#58a6ff;
  --accent:#6366f1;--accent-hover:#7c7ff7;
  --success:#3fb950;--warning:#d29922;--danger:#f85149;
  --mono:'JetBrains Mono',ui-monospace,'Cascadia Code',monospace;
  --sans:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
  --radius:10px;--radius-sm:6px;
}
body{margin:0;background:var(--bg);color:var(--text);font-family:var(--sans);line-height:1.5;font-size:15px}
a{color:var(--link);text-decoration:none}
a:hover{text-decoration:underline}
.topbar{display:flex;align-items:center;gap:24px;padding:14px 24px;border-bottom:1px solid var(--border);background:var(--raised);position:sticky;top:0;z-index:10}
.brand{font-weight:700;letter-spacing:-0.02em}
.tabs{display:flex;gap:4px}
.tabs a{padding:6px 14px;border-radius:var(--radius-sm);color:var(--muted);font-weight:500}
.tabs a:hover{background:var(--hover);text-decoration:none;color:var(--text)}
.tabs a[aria-current=page],.tabs a[aria-current=true]{background:var(--accent);color:#fff}
.hint{margin-left:auto;color:var(--muted);font-size:12px}
.connection-status{max-width:820px;margin:12px auto 0;padding:10px 14px;border:1px solid var(--danger);border-radius:var(--radius);background:rgba(248,81,73,.12);color:var(--text)}
.connection-status[hidden]{display:none}
.draft-notice{margin:10px 0;padding:10px 12px;border:1px solid var(--warning);border-radius:var(--radius-sm);background:rgba(210,153,34,.12);color:var(--text);font-size:13px}
.draft-notice[hidden]{display:none}
.draft-notice p{margin:0 0 8px}.draft-notice textarea{box-sizing:border-box;width:100%;margin:4px 0 8px;padding:8px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:var(--radius-sm);font-family:var(--mono);font-size:12px}
main{max-width:820px;margin:0 auto;padding:28px 24px 64px}
h1{font-size:1.6rem;letter-spacing:-0.02em;margin:0 0 4px}
h2{font-size:1.15rem;margin:0 0 10px}
.muted{color:var(--muted)}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.empty{border:1px dashed var(--border);border-radius:var(--radius);padding:32px;text-align:center;color:var(--muted)}
.empty code{background:var(--overlay);padding:2px 6px;border-radius:4px;font-family:var(--mono);font-size:13px;color:var(--text)}
.due-banner{display:flex;align-items:baseline;gap:10px;margin:18px 0 24px}
.due-banner strong{font-size:2rem;color:var(--accent-hover);letter-spacing:-0.03em}
.review-entry{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.cta{display:inline-block;margin-top:6px;padding:9px 18px;border-radius:var(--radius-sm);background:var(--accent);color:#fff;font-weight:600}
button.cta{border:0;font:inherit;font-weight:600;cursor:pointer;vertical-align:baseline;margin-top:0}
button.cta:hover{background:var(--accent-hover)}
button.cta:disabled{opacity:.6;cursor:default}
.cta.secondary{background:var(--overlay);color:var(--text)}
.cta.secondary:hover{background:var(--hover)}
.onboard-rule{border:0;border-top:1px solid var(--border-soft);margin:20px 0}
.onboard{border:1px dashed var(--border);border-radius:var(--radius);padding:24px 28px;margin-top:16px}
.onboard-step{margin:14px 0 8px}
.onboard-step:first-child{margin-top:0}
.prompt-list{list-style:none;margin:0 0 4px;padding:0;display:grid;gap:8px}
.prompt-list code.copyable{display:block;background:var(--overlay);padding:10px 12px;border-radius:var(--radius-sm);font-family:var(--mono);font-size:13px;color:var(--text);cursor:pointer;border:1px solid var(--border)}
.prompt-list code.copyable:hover{background:var(--hover)}
.prompt-list code.copyable:focus{outline:2px solid var(--accent);outline-offset:1px}
.prompt-list code.copied{border-color:var(--success)}
.prompt-list code.copied:after{content:" copied";color:var(--success);font-size:11px}
.small{font-size:12px}
.manual{margin-top:16px;border-top:1px solid var(--border-soft);padding-top:12px}
.manual summary{cursor:pointer;color:var(--muted);font-size:13px}
.manual code{display:inline-block;background:var(--overlay);padding:2px 6px;border-radius:4px;font-family:var(--mono);font-size:13px;color:var(--text);margin-top:4px}
.cta:hover{background:var(--accent-hover);text-decoration:none}
.cta.is-disabled{background:var(--overlay);color:var(--muted);pointer-events:none}
.set-list{list-style:none;padding:0;margin:20px 0 0;display:grid;gap:10px}
.set-row{display:flex;align-items:center;gap:14px;padding:14px 16px;background:var(--raised);border:1px solid var(--border);border-radius:var(--radius)}
.set-row .title{font-weight:600}
.set-row .path{color:var(--muted);font-size:12px;font-family:var(--mono)}
.set-row .count{margin-left:auto;color:var(--muted);font-size:13px}
.badge{padding:2px 8px;border-radius:var(--radius-sm);font-size:12px;font-weight:600}
.badge.due{background:rgba(99,102,241,0.15);color:var(--accent-hover)}
.pcard{background:var(--raised);border:1px solid var(--border);border-radius:var(--radius);padding:22px;margin-top:16px}
.pcard .topline{display:flex;align-items:center;gap:10px;color:var(--muted);font-size:12px;font-family:var(--mono);margin-bottom:12px}
.copy-reference{box-sizing:border-box;height:28px;min-height:28px;max-height:28px;padding:0 8px;display:inline-flex;align-items:center;gap:5px;color:var(--muted);background:transparent;font-size:11px;font-weight:500;line-height:1;white-space:nowrap}
.copy-reference:hover{color:var(--text)}
.copy-reference:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.copy-reference.copied{color:var(--success);border-color:var(--success)}
.copy-reference svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;pointer-events:none;flex:none}
.copy-practice-card{margin-left:auto}
.prompt{font-size:1.25rem;font-weight:600;margin:0 0 16px}
.prompt.markdown-body pre,.prompt.markdown-body pre code,.prompt-full pre code{font-weight:400;font-size:13px}
.prompt.markdown-body p{font-size:1.25rem;font-weight:600}
.ctx{color:var(--muted);margin:0 0 16px}
.reveal{margin-top:18px;padding-top:18px;border-top:1px solid var(--border);display:none}
.reveal.show{display:block}
.label{text-transform:uppercase;letter-spacing:0.08em;font-size:11px;color:var(--muted);margin:0 0 4px}
.short{font-weight:600;margin:0 0 14px}
.expl{overflow-wrap:break-word}
.deep{margin:6px 0 4px}
.deep>summary{cursor:pointer;color:var(--link);font-size:13px;list-style:none;user-select:none;display:inline-flex;align-items:center;gap:6px;padding:4px 0}
.deep>summary::-webkit-details-marker{display:none}
.deep>summary::before{content:'▸';display:inline-block;transition:transform .15s}
.deep[open]>summary::before{transform:rotate(90deg)}
.deep .deep-less{display:none}
.deep[open] .deep-more{display:none}
.deep[open] .deep-less{display:inline}
.mermaid{background:var(--overlay);border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px;margin:12px 0;text-align:center;overflow-x:auto;font-family:var(--mono);font-size:12px}
.mermaid[data-processed]{font-family:inherit}
.expl code,.src pre{font-family:var(--mono);font-size:13px}
.src{margin-top:14px;background:var(--overlay);border-radius:var(--radius-sm);padding:10px 12px}
.src .meta{color:var(--muted);font-size:12px;font-family:var(--mono);margin-bottom:6px}
.src pre{margin:0;white-space:pre-wrap;overflow-x:auto}
.short code,.expl code,.ctx code,.prompt code,.reveal li code{font-family:var(--mono);font-size:0.9em;background:var(--overlay);padding:1px 5px;border-radius:4px}
.ex{margin-top:12px}
.ex-label{color:var(--muted);font-size:12px;font-family:var(--mono);margin-bottom:4px}
.ex pre{margin:0;background:var(--overlay);border-radius:var(--radius-sm);padding:10px 12px;overflow-x:auto}
.ex pre code{font-family:var(--mono);font-size:13px;white-space:pre-wrap;background:none;padding:0}
.ex-note{color:var(--muted);font-size:13px;margin-top:6px}
.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}
button{font:inherit;cursor:pointer;padding:9px 16px;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--overlay);color:var(--text);font-weight:500}
button:hover{background:var(--hover)}
button.primary{background:var(--accent);border-color:transparent;color:#fff;font-weight:600}
button.primary:hover{background:var(--accent-hover)}
.grade button kbd{font-family:var(--mono);font-size:11px;opacity:0.7;margin-left:4px}
.g1{border-color:var(--danger)}.g2{border-color:var(--warning)}.g3{border-color:var(--accent)}.g4{border-color:var(--success)}
.status{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:var(--overlay);border:1px solid var(--border);padding:8px 16px;border-radius:var(--radius);font-size:13px;opacity:0;transition:opacity .2s}
.status.show{opacity:1}
.done-note{text-align:center;padding:40px;color:var(--success);font-weight:600}
.done-actions{text-align:center;margin-top:-24px}
.confidence{margin-top:18px;padding-top:16px;border-top:1px solid var(--border-soft)}
.conf-opts{display:flex;gap:6px;flex-wrap:wrap}
.conf-opts button kbd{font-family:var(--mono);font-size:11px;opacity:0.7;margin-left:4px}
.conf-opts button.sel{background:var(--accent);border-color:transparent;color:#fff;font-weight:600}
.confidence.locked{opacity:0.55;pointer-events:none}
.attempt{margin:18px 0 0;padding-top:16px;border-top:1px solid var(--border-soft)}
.attempt textarea{width:100%;resize:vertical;min-height:84px;margin-top:6px;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--overlay);color:var(--text);font:inherit;line-height:1.5}
.attempt textarea:focus{outline:2px solid var(--accent);outline-offset:1px}
.attempt.locked{opacity:.65;pointer-events:none}
.choices{display:grid;gap:8px;border-left:0;border-right:0;border-bottom:0}
.choice{display:flex;align-items:flex-start;gap:10px;padding:12px;min-height:44px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--overlay);cursor:pointer}
.choice:hover{background:var(--hover)}
.choice input{margin-top:4px;accent-color:var(--accent)}

.problem-refs{margin:16px 0;padding:12px 14px;border:1px solid var(--border-soft);border-radius:var(--radius-sm);background:var(--overlay)}
.problem-refs>ul,.problem-attributions{margin:6px 0 0;padding-left:20px}
.problem-refs li{margin:3px 0}
.learner-answer{padding:10px 12px;background:var(--overlay);border-left:3px solid var(--accent);border-radius:var(--radius-sm);white-space:pre-wrap}
.result{font-weight:700;margin:0 0 12px}.result.correct{color:var(--success)}.result.incorrect{color:var(--warning)}
.choice-feedback{margin:6px 0 16px;padding-left:20px}
.p-hint{font-size:12px;color:var(--muted);margin:0 0 8px}
.p-list{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:8px;counter-reset:p}
.p-block{display:flex;align-items:stretch;gap:10px;padding:8px 10px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--overlay);cursor:grab}
.p-block:focus{outline:2px solid var(--accent);outline-offset:1px}
.p-block:focus:not(:focus-visible){outline:none}
.p-block.sel{border-color:var(--accent);box-shadow:inset 3px 0 0 var(--accent)}
.p-block.dragging{opacity:.5;cursor:grabbing}
.p-move{display:flex;flex-direction:column;gap:4px;justify-content:center}
.p-move button{border:1px solid var(--border);background:var(--raised);color:var(--text);border-radius:4px;cursor:pointer;width:26px;height:20px;line-height:1;font-size:11px;padding:0}
.p-move button:hover{background:var(--hover)}
.p-body{flex:1;min-width:0}
.p-label{display:block;font-size:12px;color:var(--muted);margin-bottom:4px}
.p-block pre{margin:0;white-space:pre-wrap;font-family:var(--mono);font-size:13px}
.attempt.parsons.locked{opacity:.65;pointer-events:none}
.p-solution{margin:6px 0 16px;padding-left:20px}
.p-solution pre{margin:0;white-space:pre-wrap;font-family:var(--mono);font-size:13px}
.grade-label{margin-top:6px}
.c1{border-color:var(--danger)}.c2{border-color:var(--warning)}.c3{border-color:var(--accent)}.c4{border-color:var(--accent)}.c5{border-color:var(--success)}
.diff-snippet{font-family:var(--mono);background:#08111f;border:1px solid rgba(35,52,79,.7);border-radius:var(--radius-sm);overflow:hidden;margin:10px 0}
.diff-line{display:grid;grid-template-columns:44px 22px 1fr;gap:0;min-height:24px;align-items:center;font-size:13px;line-height:1.55}
.diff-line code{white-space:pre-wrap;color:#dbeafe}
.line-no{color:#64748b;text-align:right;padding-right:10px;user-select:none}
.marker{text-align:center;color:#94a3b8;font-size:12px}
.diff-line.add{background:linear-gradient(90deg,rgba(22,101,52,.45),rgba(22,101,52,.12))}
.diff-line.add .marker{color:#86efac}
.diff-line.delete{background:linear-gradient(90deg,rgba(127,29,29,.48),rgba(127,29,29,.13))}
.diff-line.delete .marker{color:#fca5a5}
.diff-line.meta{background:#172033}.diff-line.meta code{color:#93c5fd}
.diff-line.context{background:#0b1220}
.markdown-body{line-height:1.65;max-width:100%}
.markdown-body p{margin:0 0 12px}
.markdown-body p:last-child{margin-bottom:0}
.markdown-body h1,.markdown-body h2,.markdown-body h3,.markdown-body h4,.markdown-body h5,.markdown-body h6{margin:18px 0 8px;line-height:1.35;font-weight:600}
.markdown-body h1:first-child,.markdown-body h2:first-child,.markdown-body h3:first-child,.markdown-body h4:first-child,.markdown-body h5:first-child,.markdown-body h6:first-child{margin-top:0}
.markdown-body pre{margin:12px 0;background:var(--overlay);border-radius:var(--radius-sm);padding:10px 12px;overflow-x:auto}
.markdown-body pre code{font-family:var(--mono);font-size:13px;white-space:pre-wrap;background:none;padding:0;color:var(--text)}
.markdown-body ul,.markdown-body ol{margin:8px 0 12px;padding-left:20px}
.markdown-body li{margin:0 0 4px}
.markdown-body code{font-family:var(--mono);font-size:0.9em;background:var(--overlay);padding:1px 5px;border-radius:4px}
.markdown-body strong{font-weight:700;color:var(--text)}
.set-link{display:flex;align-items:center;gap:14px;width:100%;color:inherit}
.set-link:hover{text-decoration:none}
.set-row{padding:0}.set-row:hover{border-color:var(--accent)}
.set-link{padding:14px 16px}
.badge.next{background:var(--overlay);color:var(--muted)}
.lesson-objective{display:flex;flex-direction:column;gap:4px;margin:16px 0;padding:14px 16px;background:var(--raised);border:1px solid var(--border);border-left:3px solid var(--accent);border-radius:var(--radius)}
.lesson-actions{display:flex;align-items:center;gap:12px;margin:16px 0 4px;flex-wrap:wrap}
.secondary-action{padding:9px 16px;border-radius:var(--radius-sm);border:1px solid var(--border);color:var(--text);font-weight:500}
.secondary-action:hover{background:var(--hover);text-decoration:none}
.secondary-action.sel{background:rgba(99,102,241,.18);border-color:var(--accent);color:#fff}
.schedule-toggle{display:inline-flex;align-items:center;gap:8px;margin:14px 0 2px;color:var(--muted);font-size:13px;cursor:pointer}
.schedule-toggle input{accent-color:var(--accent)}
.copy-card{float:right;margin:0 0 10px 12px}
.lesson-list{display:grid;gap:12px;margin-top:16px;list-style:none;padding:0}
.lesson-card{background:var(--raised);border:1px solid var(--border);border-radius:var(--radius);padding:16px 18px}
.lesson-card:hover{border-color:var(--accent)}
.lesson-head{display:flex;align-items:center;gap:10px}
.lesson-title{font-weight:600;font-size:15px;color:inherit}
.lesson-title:hover{text-decoration:underline}
.lesson-obj{margin:6px 0 0;color:var(--muted);font-size:13px}
.lesson-meta{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:10px;font-size:12px;color:var(--muted)}
.lesson-meta .est{font-variant-numeric:tabular-nums}
.lesson-card .lesson-actions{margin:14px 0 0}
.progress-pill{display:inline-flex;align-items:center;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:600;border:1px solid var(--border)}
.progress-pill.state-not_started{background:var(--overlay);color:var(--muted)}
.progress-pill.state-in_progress{background:var(--raised);color:var(--accent);border-color:var(--accent)}
.progress-pill.state-completed{background:var(--accent);color:var(--bg)}
.browse-list{display:grid;gap:8px;margin-top:16px}
.browse-card{background:var(--raised);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}
.browse-card summary{display:flex;align-items:center;gap:12px;padding:14px 16px;cursor:pointer;list-style:none}
.browse-card summary::-webkit-details-marker{display:none}
.browse-card summary:hover{background:var(--hover)}
.browse-card summary .q{font-weight:600;flex:1}
.browse-card[open] summary{border-bottom:1px solid var(--border)}
.browse-body{padding:16px}
.browse-body .label{margin-top:14px}
.browse-body .label:first-child{margin-top:0}
.prepare-filters{display:flex;align-items:end;gap:10px;flex-wrap:wrap;margin:18px 0;padding:14px;background:var(--raised);border:1px solid var(--border);border-radius:var(--radius)}
.prepare-filters label{display:grid;gap:4px;color:var(--muted);font-size:12px}
.prepare-filters input{padding:8px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:var(--radius-sm)}
.prepare-list{list-style:none;padding:0;display:grid;gap:10px}
.prepare-row{padding:14px 16px;background:var(--raised);border:1px solid var(--border);border-radius:var(--radius)}
.prepare-row p{margin:4px 0 10px}.prepare-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:10px}
.secondary-action.is-disabled{color:var(--muted);pointer-events:none}
.active-filter{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:14px 16px;background:var(--raised);border:1px solid var(--border);border-radius:var(--radius);margin:18px 0}
.card-curation{margin-top:24px}
.card-tools{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin:12px 0}
.card-tools input[type="search"]{flex:1;min-width:240px;padding:9px 11px;background:var(--raised);color:var(--text);border:1px solid var(--border);border-radius:var(--radius-sm)}
.curation-list{display:grid;gap:10px}
.curation-card{padding:14px 16px;background:var(--raised);border:1px solid var(--border);border-radius:var(--radius)}
.curation-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}
.curation-head>strong{flex:1;min-width:0}
.curation-head-actions{display:flex;align-items:center;gap:6px;flex:none}
.curation-meta{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:4px}
.curation-edit{display:block;width:100%;margin-top:12px;border-top:1px solid var(--border-soft);padding-top:10px}
.curation-edit>summary{cursor:pointer;color:var(--link);font-size:13px}
.curation-edit label{display:grid;gap:4px;margin:8px 0;font-size:12px;color:var(--muted)}
.curation-edit textarea{box-sizing:border-box;width:100%;padding:8px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:var(--radius-sm);font:inherit}
.active-filter #match-count{flex:1;min-width:120px}
.active-filter .clear{background:transparent;border:1px solid var(--border)}
.chip{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;background:var(--overlay);border:1px solid var(--border);border-radius:var(--radius-sm);font-size:13px}
.chip-x{background:transparent;border:0;color:var(--muted);font-size:14px;cursor:pointer;padding:0 2px}
.chip-x:hover{color:var(--text)}
.tree,.tag-grid{list-style:none;padding:0;margin:12px 0 0;display:grid;gap:8px}
.tree-node{background:var(--raised);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}
.tree-row{display:flex;align-items:center;gap:12px;padding:12px 14px;cursor:pointer;outline:none}
.tree-row:hover{background:var(--hover)}
.tree-row:focus{box-shadow:inset 0 0 0 2px var(--accent)}
.tree-name{flex:1;font-family:var(--mono);font-size:14px}
.tree-count,.tree-pct{color:var(--muted);font-size:13px;min-width:42px;text-align:right}
.tree-bar{position:relative;width:80px;height:6px;background:var(--overlay);border-radius:4px;overflow:hidden}
.tree-bar::after{content:'';position:absolute;left:0;top:0;bottom:0;width:var(--pct,0%);background:linear-gradient(90deg,var(--danger),var(--warning) 40%,var(--accent-hover) 75%,var(--success));transition:width .2s}
.tree-node.sel .tree-row{background:rgba(99,102,241,0.12);border-left:3px solid var(--accent);padding-left:11px}
.tag-grid{grid-template-columns:repeat(auto-fill,minmax(180px,1fr))}
.tag-chip{display:flex;flex-direction:column;gap:6px;padding:10px 12px;background:var(--raised);border:1px solid var(--border);border-radius:var(--radius);cursor:pointer;outline:none}
.tag-chip:hover{background:var(--hover)}
.tag-chip:focus{box-shadow:inset 0 0 0 2px var(--accent)}
.tag-top{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
.tag-label{font-weight:600;font-size:14px}
.tag-count{color:var(--muted);font-size:12px}
.tag-bar{position:relative;width:100%;height:4px;background:var(--overlay);border-radius:3px;overflow:hidden}
.tag-bar::after{content:'';position:absolute;left:0;top:0;bottom:0;width:var(--pct,0%);background:linear-gradient(90deg,var(--danger),var(--warning) 40%,var(--accent-hover) 75%,var(--success));transition:width .2s}
.tag-pct{color:var(--muted);font-size:12px;align-self:flex-end}
.tag-chip.sel{background:rgba(99,102,241,0.12);border-color:var(--accent)}
.section-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap}
.section-head h2{margin:0}
.legend{color:var(--muted);font-size:12px;cursor:help;border-bottom:1px dotted var(--border)}
.legend strong{color:var(--text);font-weight:600}
.q-code{color:var(--muted);font-family:var(--mono);font-size:0.85em}
.prompt-full{margin:0 0 8px}
.combinator{display:flex;gap:10px;margin:18px 0 4px}
.combo-tile{display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:10px 16px;background:var(--raised);border:1px solid var(--border);border-radius:var(--radius);cursor:pointer;flex:1;max-width:220px;outline:none}
.combo-tile:hover{background:var(--hover)}
.combo-tile:focus{box-shadow:inset 0 0 0 2px var(--accent)}
.combo-tile.sel{background:rgba(99,102,241,0.12);border-color:var(--accent)}
.combo-title{font-weight:600;font-size:14px}
.combo-hint{color:var(--muted);font-size:12px;font-family:var(--mono)}
.page-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:20px}
.page-head h1{margin-bottom:4px}
.page-head p{margin:0}
.subtabs{display:flex;gap:4px;padding:3px;background:var(--raised);border:1px solid var(--border);border-radius:var(--radius-sm)}
.subtabs a{padding:7px 12px;border-radius:4px;color:var(--muted);font-weight:600;white-space:nowrap}
.subtabs a:hover{color:var(--text);background:var(--hover);text-decoration:none}
.subtabs a[aria-current=page]{color:#fff;background:var(--accent)}
.dashboard-section{margin-top:24px;padding:20px;background:var(--raised);border:1px solid var(--border);border-radius:var(--radius)}
.dashboard-section>h2{margin-bottom:12px}
.dashboard-section .lesson-list{margin-bottom:0}
.attention-list{display:grid;gap:10px;list-style:none;padding:0;margin:14px 0}
.attention-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 0;border-bottom:1px solid var(--border-soft)}
.attention-row:first-child{padding-top:0}.attention-row:last-child{padding-bottom:0;border-bottom:0}
.attention-row p{margin:3px 0 0;color:var(--muted);font-size:13px}
.mode-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:24px}
.mode-card{padding:20px;background:var(--raised);border:1px solid var(--border);border-radius:var(--radius)}
.mode-card.primary-mode{grid-column:1/-1;border-color:var(--accent);background:linear-gradient(135deg,rgba(99,102,241,.12),var(--raised) 55%)}
.mode-card h2{margin:2px 0 8px}.mode-card>p{margin:6px 0 14px}
.eyebrow{text-transform:uppercase;letter-spacing:.08em;font-size:11px;font-weight:700;color:var(--accent-hover)}
.review-scope{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.review-scope>p{flex-basis:100%;margin:0}
.review-scope .cta{margin-top:0}
.scope-summary{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-basis:100%;padding:10px 12px;background:var(--overlay);border:1px solid var(--border-soft);border-radius:var(--radius-sm)}
.scope-summary .clear{padding:5px 9px;background:transparent}
.scope-picker{flex-basis:100%;margin-top:4px;border-top:1px solid var(--border-soft);padding-top:12px}
.scope-picker>summary{cursor:pointer;color:var(--link);font-weight:600}
.scope-options{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}
.scope-option{padding:7px 11px}.scope-option[aria-pressed=true]{background:var(--accent);border-color:var(--accent);color:#fff}
.scope-combine{display:flex;align-items:center;gap:10px;color:var(--muted);font-size:13px}
.scope-combine select{padding:7px 9px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:var(--radius-sm)}
.backlog{margin-left:2px}.caught-up{margin:0;color:var(--success)}
.notice{margin:14px 0;padding:11px 13px;background:rgba(210,153,34,.12);border:1px solid var(--warning);border-radius:var(--radius-sm)}
.notice[hidden]{display:none}
.session-tools{display:flex;justify-content:flex-end;gap:8px;margin:8px 0 4px}
@media(max-width:600px){
  .topbar{gap:8px;padding:10px 12px;flex-wrap:wrap}
  .brand{width:100%}
  .tabs{width:100%;display:grid;grid-template-columns:repeat(3,1fr)}
  .tabs a{min-height:44px;padding:11px 8px;text-align:center}
  .hint{display:none}
  main{padding:22px 14px 56px}
  .page-head{display:block}.subtabs{margin-top:16px;width:100%;display:grid;grid-template-columns:1fr 1fr}.subtabs a{min-height:44px;padding:11px 8px;text-align:center}
  .mode-grid{grid-template-columns:1fr}.mode-card.primary-mode{grid-column:auto}.mode-card{padding:17px}
  .dashboard-section{padding:16px;margin-top:18px}
  .home-search{display:flex;align-items:stretch;flex-direction:column;gap:8px}.home-search input,.home-search button{width:100%;min-height:44px}
  .attention-row{align-items:flex-start;flex-direction:column}.attention-row .secondary-action{width:100%;text-align:center}
  .review-scope{align-items:stretch}.review-scope .cta,.review-scope .secondary-action{min-height:44px;text-align:center;padding:11px 14px}.scope-summary{align-items:flex-start;flex-direction:column}.scope-summary .clear{min-height:44px;width:100%}
  .scope-option,.scope-picker>summary{min-height:44px}.scope-picker>summary{display:flex;align-items:center}.scope-combine{align-items:flex-start;flex-direction:column}.scope-combine select{min-height:44px;width:100%}
  .prepare-filters{align-items:stretch;flex-direction:column}.prepare-filters label,.prepare-filters input,.prepare-filters button{width:100%}.prepare-filters input,.prepare-filters button{min-height:44px}
  .card-filter-panel>summary{min-height:44px;display:flex;align-items:center}.card-tools{align-items:stretch;flex-direction:column}.card-tools label{min-height:44px}.card-tools input[type="search"]{min-width:0;width:100%;min-height:44px}.card-tools select,.card-tools button{min-height:44px;width:100%}
  .lesson-actions,.prepare-actions,.session-tools{align-items:stretch;flex-direction:column}.lesson-actions .cta,.lesson-actions .secondary-action,.prepare-actions .secondary-action,.session-tools button{min-height:44px;text-align:center;width:100%}
  .mode-card .secondary-action,.attention-row .secondary-action,.prepare-row>a,.browse-card>summary,.curation-edit>summary{min-height:44px;display:flex;align-items:center}
  .mode-card .secondary-action,.attention-row .secondary-action,.prepare-row>a{justify-content:center}
  .curation-head-actions button,.actions button,.conf-opts button,.p-move button{min-height:44px}
  .curation-head{flex-direction:column}.curation-head-actions{width:100%;justify-content:flex-end}
}`;
}
