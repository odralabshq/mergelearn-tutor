/**
 * Local review GUI (docs/design/redesign-2026-07/04). Two surfaces only:
 * Home (sets + what's due) and Practice (one card: answer -> reveal -> grade).
 *
 * Model-free and offline: reads the v2 library, serves localhost, no network.
 * Cut down from the old 5-surface browser server; keeps its visual language
 * and the answer/reveal/grade interaction, drops the dead concept-era plumbing.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { getDueCards, type DueFilter } from '../core/library/review/dueQueue.js';
import { startSession, gradeCard, endSession } from '../core/library/review/session.js';
import { listSetSummaries, loadSet, loadOrder, listSetIds } from '../core/library/setStore.js';
import { loadCard, loadCardsForSet } from '../core/library/cardStore.js';
import { loadTags } from '../core/library/tagStore.js';
import {
  attemptedByLessonSet,
  attemptedCardIds,
  computeLessonProgress,
  type LessonProgress,
} from '../core/library/review/sessionHistory.js';
import type { Card, Confidence, Interaction, ReviewAttempt, ReviewRating, ReviewSession, SetOrder, SetSummary } from '../core/library/types.js';
import { libraryPaths } from '../core/library/libraryStore.js';
import { writeJson, readJson as readJsonIO } from '../core/library/io.js';
import { join } from 'node:path';

export type ReviewServer = { server: Server; url: string; close: () => Promise<void> };

export async function startReviewServer(root: string, port = 0): Promise<ReviewServer> {
  const server = createServer(async (req, res) => {
    try {
      await handleRequest(root, req, res);
    } catch (error) {
      sendText(res, 500, `session error: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  });
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('could not determine server address');
  const url = `http://127.0.0.1:${address.port}`;
  return { server, url, close: () => new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))) };
}

async function handleRequest(root: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method ?? 'GET';
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  if (method === 'GET' && url.pathname === '/') return sendHtml(res, 200, await renderHome(root));
  if (method === 'GET' && url.pathname === '/practice') return sendHtml(res, 200, renderPractice());
  if (method === 'GET' && url.pathname.startsWith('/set/')) {
    const setId = decodeURIComponent(url.pathname.slice('/set/'.length));
    return sendHtml(res, 200, await renderSetBrowser(root, setId));
  }
  // /api/due accepts both GET (no filter) and POST (JSON DueFilter body).
  // Empty body / empty object both mean "everything due."
  if (url.pathname === '/api/due') return dueData(root, req, res, url);
  // Learn mode: every active card in one set, in authored order, independent of FSRS due state.
  if (method === 'GET' && url.pathname === '/api/lesson') return lessonData(root, res, url);
  // Per-sitting session lifecycle (doc 06 addendum A2): start -> grade* -> end.
  if (method === 'POST' && url.pathname === '/api/session/start') return sessionStartApi(root, req, res);
  if (method === 'POST' && url.pathname === '/api/session/grade') return sessionGradeApi(root, req, res);
  if (method === 'POST' && url.pathname === '/api/session/end') return sessionEndApi(root, req, res);
  // Manage tab (doc 06): server-rendered; card membership is embedded in the
  // page so match counts recompute client-side (no per-keystroke round-trip).
  if (method === 'GET' && url.pathname === '/manage') return sendHtml(res, 200, await renderManage(root));
  return sendText(res, 404, 'not found\n');
}

// ---- API ----

/** In-memory map of active review sessions (id -> session). Persisted
 * incrementally on each grade and explicitly on /api/session/end. See doc 06
 * addendum A2. */
const activeSessions = new Map<string, ReviewSession>();

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
  const due = await getDueCards(root, new Date(), filter);
  return sendJson(res, 200, { total: due.length, cards: due.map(cardView) });
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
  const [set, cards, order, attempted] = await Promise.all([
    loadSet(root, setId), loadCardsForSet(root, setId), loadOrder(root, setId),
    attemptedCardIds(root, setId),
  ]);
  if (!set) return sendJson(res, 404, { ok: false, error: 'set not found' });
  const ordered = orderActiveCards(cards, order);
  const progress = computeLessonProgress(ordered.map((c) => c.id), attempted);
  return sendJson(res, 200, {
    ok: true,
    lesson: { id: set.id, title: set.title, objective: set.objective ?? null, lessonKind: set.lessonKind ?? null },
    total: ordered.length,
    progress,
    cards: ordered.map(cardView),
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
async function persistSession(root: string, session: ReviewSession): Promise<void> {
  await writeJson(sessionFilePath(root, session), session);
}

/** /api/session/start — body: DueFilter. Creates a session, returns its id. */
async function sessionStartApi(root: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body: unknown;
  try { body = await readJson(req); }
  catch { return sendJson(res, 400, { error: 'invalid JSON body' }); }
  let filter: DueFilter | undefined;
  try { filter = asFilter(body); }
  catch (e) { return sendJson(res, 400, { error: (e as Error).message }); }
  const lessonSetId = body && typeof body === 'object' && typeof (body as Record<string, unknown>).lessonSetId === 'string'
    ? (body as Record<string, string>).lessonSetId
    : undefined;
  if (lessonSetId) filter = { setIds: [lessonSetId] };
  // Pick a mode that describes the filter so the session file is self-describing.
  const mode: ReviewSession['mode'] = lessonSetId
    ? 'lesson'
    : filter?.folderPaths?.length
    ? 'folder'
    : filter?.tagIds?.length
      ? 'tag_filter'
      : filter?.setIds?.length
        ? 'set'
        : 'recommended';
  const session = startSession(mode, filter);
  activeSessions.set(session.id, session);
  await persistSession(root, session);
  return sendJson(res, 200, { ok: true, sessionId: session.id, mode, filter: filter ?? null });
}

/** /api/session/grade — body: { sessionId, cardId, setId, rating, confidence? }. */
async function sessionGradeApi(root: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body: { sessionId?: string; cardId?: string; setId?: string; rating?: number; confidence?: number; attempt?: unknown };
  try { body = (await readJson(req)) as typeof body; }
  catch { return sendJson(res, 400, { ok: false, error: 'invalid JSON body' }); }
  const sessionId = body.sessionId;
  const rating = Number(body.rating) as ReviewRating;
  if (!sessionId || !body.cardId || !body.setId || ![1, 2, 3, 4].includes(rating)) {
    return sendJson(res, 400, { ok: false, error: 'need sessionId, cardId, setId, rating(1-4)' });
  }
  // Look up the session in memory; fall back to reading its on-disk file in case
  // the server restarted mid-sitting.
  let session = activeSessions.get(sessionId);
  if (!session) {
    try {
      const matches = await listSessionFiles(root);
      for (const path of matches) {
        const s = await readJsonIO<ReviewSession>(path);
        if (s?.id === sessionId) { session = s; activeSessions.set(sessionId, s); break; }
      }
    } catch { /* fall through to 404 below */ }
  }
  if (!session) return sendJson(res, 404, { ok: false, error: 'session not found' });
  const confidence = [1, 2, 3, 4, 5].includes(Number(body.confidence))
    ? (Number(body.confidence) as Confidence)
    : undefined;
  const card = await loadCard(root, body.setId, body.cardId);
  if (!card) return sendJson(res, 404, { ok: false, error: 'card not found' });
  const attempt = asAttempt(body.attempt);
  const updated = await gradeCard(root, session, card, rating, new Date(), confidence, attempt);
  await persistSession(root, session);
  return sendJson(res, 200, { ok: true, cardId: updated.id, due: updated.fsrs.due });
}

/** /api/session/end — body: { sessionId }. Finalizes and removes from memory. */
async function sessionEndApi(root: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body: { sessionId?: string };
  try { body = (await readJson(req)) as typeof body; }
  catch { return sendJson(res, 400, { ok: false, error: 'invalid JSON body' }); }
  const sessionId = body.sessionId;
  if (!sessionId) return sendJson(res, 400, { ok: false, error: 'need sessionId' });
  let session = activeSessions.get(sessionId);
  if (!session) {
    try {
      const matches = await listSessionFiles(root);
      for (const path of matches) {
        const s = await readJsonIO<ReviewSession>(path);
        if (s?.id === sessionId) { session = s; break; }
      }
    } catch { /* fall through */ }
  }
  if (!session) return sendJson(res, 404, { ok: false, error: 'session not found' });
  await endSession(root, session);
  activeSessions.delete(sessionId);
  return sendJson(res, 200, { ok: true, sessionId, summary: session.summary });
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

/** Trim a card to what the Practice UI renders, with server-pre-rendered HTML
 * for code (diff-snippet widget) and explanations (markdown → HTML). */
function cardView(card: Card) {
  return {
    id: card.id,
    setId: card.setId,
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

/** Lesson progress for one set, given the pre-walked attempted-ids set (so the
 * Home page doesn't re-scan the session tree per set). */
async function lessonProgressFor(root: string, setId: string, attempted: Set<string>): Promise<LessonProgress> {
  const [cards, order] = await Promise.all([loadCardsForSet(root, setId), loadOrder(root, setId)]);
  const ordered = orderActiveCards(cards, order);
  return computeLessonProgress(ordered.map((c) => c.id), attempted);
}

/** One Home lesson card: objective, meta, progress pill, and a single primary
 * action (Start / Continue / Practice again) plus due-review as a secondary. */
function renderLessonRow(s: SetSummary, progress: LessonProgress, dueCount: number): string {
  const href = `/practice?mode=lesson&set=${encodeURIComponent(s.id)}`;
  const actionLabel = progress.state === 'not_started' ? 'Start lesson'
    : progress.state === 'in_progress' ? 'Continue lesson'
    : 'Practice again';
  const pillLabel = progress.state === 'completed' ? 'Completed'
    : progress.state === 'in_progress' ? `${progress.attemptedCount}/${progress.total} done`
    : 'Not started';
  const kind = s.lessonKind ? `<span class="badge next">${escapeHtml(s.lessonKind)}</span>` : '';
  const objective = s.objective ? `<p class="lesson-obj">${escapeHtml(s.objective)}</p>` : '';
  const path = s.folderPath ? `<span class="path">${escapeHtml(s.folderPath)}</span>` : '';
  const est = s.estimatedMinutes ? `<span class="est">~${s.estimatedMinutes} min</span>` : '';
  const count = `<span class="count">${progress.total} activit${progress.total === 1 ? 'y' : 'ies'}</span>`;
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
    `<div class="lesson-meta">${path}${count}${est}${pill}</div>` +
    `<div class="lesson-actions">${action}${review}</div></li>`;
}

async function renderHome(root: string): Promise<string> {
  const [summaries, due, attemptedMap] = await Promise.all([
    listSetSummaries(root),
    getDueCards(root, new Date()),
    attemptedByLessonSet(root),
  ]);
  const dueBySet = new Map<string, number>();
  for (const c of due) dueBySet.set(c.setId, (dueBySet.get(c.setId) ?? 0) + 1);

  if (summaries.length === 0) {
    const body = `<h1>Your library is empty</h1>` +
      `<p class="muted">Card sets are authored by your coding agent, then imported.</p>` +
      `<div class="empty">Author a set, then import it:<br><br>` +
      `<code>mergelearn context --goal "..." &gt; context.json</code><br>` +
      `<code>mergelearn import --file patch.json</code></div>`;
    return pageShell('MergeLearn — Home', 'home', body);
  }

  // Review is the separate FSRS job: one banner linking to the global due queue.
  const cta = due.length > 0
    ? `<a class="cta" href="/practice">Review ${due.length} due</a>`
    : `<span class="cta is-disabled">Nothing due right now</span>`;
  const banner = `<div class="due-banner"><strong>${due.length}</strong>` +
    `<span class="muted">card${due.length === 1 ? '' : 's'} due for review</span></div>${cta}`;

  // Lessons are the primary object: each row shows objective, progress, and one
  // Start/Continue action. Progress is derived from persisted lesson sessions.
  const rows = (await Promise.all(summaries.map(async (s) => {
    const progress = await lessonProgressFor(root, s.id, attemptedMap.get(s.id) ?? new Set<string>());
    return renderLessonRow(s, progress, dueBySet.get(s.id) ?? 0);
  }))).join('');

  const body = `<h1>Home</h1>${banner}` +
    `<h2 style="margin-top:28px">Lessons</h2>` +
    `<p class="muted" style="margin:-4px 0 0;font-size:13px">Learn walks each lesson in authored order. Review is the separate due queue above.</p>` +
    `<ul class="lesson-list">${rows}</ul>`;
  return pageShell('MergeLearn — Home', 'home', body);
}

// ---- Set browser ----

/**
 * Server-rendered browser for one set: lists EVERY card (due or not) as an
 * expandable panel. Lets you revisit a card's front, frozen snippets, answer,
 * explanation and examples at any time — independent of the review schedule.
 */
async function renderSetBrowser(root: string, setId: string): Promise<string> {
  const set = await loadSet(root, setId);
  if (!set) {
    const body = `<p><a href="/">← Home</a></p><h1>Set not found</h1>` +
      `<div class="empty">No set with id <code>${escapeHtml(setId)}</code>.</div>`;
    return pageShell('MergeLearn — Set', 'set', body);
  }
  const [cards, due, order, attempted] = await Promise.all([
    loadCardsForSet(root, setId),
    getDueCards(root, new Date(), { setIds: [setId] }),
    loadOrder(root, setId),
    attemptedCardIds(root, setId),
  ]);
  const dueIds = new Set(due.map((c) => c.id));
  const now = Date.now();
  const progress = computeLessonProgress(orderActiveCards(cards, order).map((c) => c.id), attempted);

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
    return `<details class="browse-card"><summary><span class="q">${promptPreview(v.prompt)}</span>${state}</summary>` +
      `<div class="browse-body">` +
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
  const pillLabel = progress.state === 'completed' ? 'Completed'
    : progress.state === 'in_progress' ? `${progress.attemptedCount}/${progress.total} done`
    : 'Not started';
  const est = set.estimatedMinutes ? ` · ~${set.estimatedMinutes} min` : '';
  const body = `<p><a href="/">← Home</a></p><h1>${escapeHtml(set.title)}</h1>` +
    `<p class="muted">${path} ${kind} ${cards.length} activit${cards.length === 1 ? 'y' : 'ies'}${est} · ` +
    `<span class="progress-pill state-${progress.state}">${pillLabel}</span> · ${due.length} due</p>` +
    `${objective}${actions}` +
    (cards.length ? `<div class="browse-list">${items}</div>` : `<div class="empty">This set has no cards yet.</div>`);
  return pageShell(`MergeLearn — ${set.title}`, 'set', body);
}

// ---- Manage tab (doc 06) ----

/** Compute per-folder and per-tag mastery. Mastery = cards at FSRS state >= 2
 * (Review/Relearning) divided by total cards. v1: set-level folderPath only
 * (per addendum A5 — per-card sub-path granularity is deferred). */
async function loadManageData(root: string): Promise<{
  folders: { path: string; cardCount: number; mastery: number }[];
  tags: { id: string; label: string; kind?: string; cardCount: number; mastery: number }[];
  // Per-active-card membership, embedded in the page so the match count
  // recomputes client-side (no /api round-trip → no "count unavailable").
  cards: { folderPath: string; tagIds: string[] }[];
}> {
  // Read all cards once; cheap at this scale, cached per request.
  const allCards: Card[] = [];
  for (const setId of await listSetIds(root)) allCards.push(...(await loadCardsForSet(root, setId)));

  // Folder stats keyed by set folderPath (v1 — per-card sub-paths deferred).
  const sets = await listSetSummaries(root);
  const setFolder = new Map(sets.map((s) => [s.id, s.folderPath ?? '']));
  const folderTotals = new Map<string, number>();
  const folderMastered = new Map<string, number>();
  for (const c of allCards) {
    const f = setFolder.get(c.setId) ?? '';
    if (!f) continue;
    folderTotals.set(f, (folderTotals.get(f) ?? 0) + 1);
    if (c.fsrs.state >= 2) folderMastered.set(f, (folderMastered.get(f) ?? 0) + 1);
  }
  const folders = [...folderTotals.keys()].sort().map((path) => ({
    path,
    cardCount: folderTotals.get(path) ?? 0,
    mastery: masteryPct(folderMastered.get(path) ?? 0, folderTotals.get(path) ?? 0),
  }));

  // Tag stats: count by tag id, count mastered per tag.
  const tags = await loadTags(root);
  const tagTotals = new Map<string, number>();
  const tagMastered = new Map<string, number>();
  for (const c of allCards) {
    for (const t of c.tagIds) {
      tagTotals.set(t, (tagTotals.get(t) ?? 0) + 1);
      if (c.fsrs.state >= 2) tagMastered.set(t, (tagMastered.get(t) ?? 0) + 1);
    }
  }
  const tagRows = tags
    .map((t) => ({
      id: t.id,
      label: t.label,
      kind: t.kind,
      cardCount: tagTotals.get(t.id) ?? 0,
      mastery: masteryPct(tagMastered.get(t.id) ?? 0, tagTotals.get(t.id) ?? 0),
    }))
    // Keep only tags that appear on at least one card; sorts the rest out.
    .filter((t) => t.cardCount > 0)
    .sort((a, b) => a.label.localeCompare(b.label));

  // Membership per card (folder + tags) so the client can count matches locally.
  // Counts the same cards as the folder/tag badges above, for consistency.
  const cards = allCards.map((c) => ({
    folderPath: setFolder.get(c.setId) ?? '',
    tagIds: c.tagIds,
  }));

  return { folders, tags: tagRows, cards };
}

function masteryPct(mastered: number, total: number): number {
  return total === 0 ? 0 : Math.round((mastered / total) * 100);
}

async function renderManage(root: string): Promise<string> {
  const { folders, tags, cards } = await loadManageData(root);
  // Embed card membership so match counts recompute client-side (no round-trip).
  // Escape '<' so a folderPath/tagId can never break out of the script tag.
  const cardsJson = JSON.stringify(cards).replace(/</g, '\\u003c');
  // Render the folder tree as a flat list of nodes; the client expands/collapses
  // via <details> in the inline script. v1: set-level paths only (addendum A5).
  const tree = folders.length
    ? folders.map((f) =>
        `<li class="tree-node" data-folder="${escapeHtml(f.path)}">` +
        `<div class="tree-row" role="button" tabindex="0" title="${f.mastery}% mastery — ${f.cardCount} card${f.cardCount === 1 ? '' : 's'} in this folder">` +
        `<span class="tree-name">${escapeHtml(f.path)}</span>` +
        `<span class="tree-count" title="${f.cardCount} card${f.cardCount === 1 ? '' : 's'}">${f.cardCount}</span>` +
        `<span class="tree-bar" style="--pct:${f.mastery}%" aria-hidden="true"></span>` +
        `<span class="tree-pct" aria-label="${f.mastery}% mastery">${f.mastery}%</span>` +
        `</div></li>`,
      ).join('')
    : `<li class="empty">No folders yet — author a set with a <code>folderPath</code>.</li>`;

  // Tag chips. Empty library → friendly empty state.
  const tagChips = tags.length
    ? tags.map((t) =>
        `<div class="tag-chip" data-tag="${escapeHtml(t.id)}" role="button" tabindex="0" title="${t.mastery}% mastery — ${t.cardCount} card${t.cardCount === 1 ? '' : 's'} tagged">` +
        `<span class="tag-top"><span class="tag-label">${escapeHtml(t.label)}</span>` +
        `<span class="tag-count" title="${t.cardCount} card${t.cardCount === 1 ? '' : 's'}">${t.cardCount}</span></span>` +
        `<span class="tag-bar" style="--pct:${t.mastery}%" aria-hidden="true"></span>` +
        `<span class="tag-pct" aria-label="${t.mastery}% mastery">${t.mastery}%</span>` +
        `</div>`,
      ).join('')
    : `<div class="empty">No tags yet — author cards with <code>tagRefs</code>.</div>`;

  // Combinator tiles sit between Folders and Tags — the seam where the
  // cross-dimension join is ambiguous. Labelled by meaning ("Match any" = OR =
  // union, default; "Match all" = AND = intersection) with the operator as a
  // hint. Within a dimension, multi-select is always OR.
  const combinator =
    `<div class="combinator" id="combinator" role="radiogroup" aria-label="How folders and tags combine">` +
    `<button class="combo-tile sel" data-combinator="union" role="radio" aria-checked="true" type="button">` +
    `<span class="combo-title">Match any</span><span class="combo-hint">folder OR tag</span></button>` +
    `<button class="combo-tile" data-combinator="intersection" role="radio" aria-checked="false" type="button">` +
    `<span class="combo-title">Match all</span><span class="combo-hint">folder AND tag</span></button>` +
    `</div>`;

  // Defines what the bar/percentage mean — answers "% of what?".
  const masteryLegend =
    `<span class="legend" title="A card counts as learned once it reaches the FSRS Review stage (state ≥ 2).">` +
    `Bar shows <strong>mastery</strong>: share of cards learned</span>`;

  const body = `<h1>Manage</h1>` +
    `<p class="muted">Pick the concepts you want to drill. The active filter feeds the Practice tab.</p>` +
    `<div class="active-filter" id="active-filter">` +
    `<span class="muted" id="match-count">—</span>` +
    `<button class="clear" id="clear-filter" type="button">Clear</button>` +
    `<button class="primary" id="start-practice" type="button">Start Practice →</button>` +
    `</div>` +
    `<div class="section-head" style="margin-top:24px"><h2>Folders</h2>${masteryLegend}</div>` +
    `<ul class="tree">${tree}</ul>` +
    combinator +
    `<div class="section-head" style="margin-top:24px"><h2>Tags</h2>${masteryLegend}</div>` +
    `<div class="tag-grid">${tagChips}</div>` +
    `<script type="application/json" id="ml-cards">${cardsJson}</script>`;
  return pageShell('MergeLearn — Manage', 'manage', body) +
    `<script>${manageScript()}</script>`;
}

function manageScript(): string {
  return `
var selected={folderPaths:[],tagIds:[],combinator:'union'};
var CARDS=[];
try{CARDS=JSON.parse(document.getElementById('ml-cards').textContent)||[];}catch(e){CARDS=[];}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function statusMsg(t){var s=document.getElementById('match-count');s.textContent=t;}
function selectedFilter(){var f={};if(selected.folderPaths.length)f.folderPaths=selected.folderPaths;if(selected.tagIds.length)f.tagIds=selected.tagIds;if(Object.keys(f).length)f.combinator=selected.combinator;return f;}
function isSelectedFolder(p){return selected.folderPaths.indexOf(p)>=0;}
function isSelectedTag(t){return selected.tagIds.indexOf(t)>=0;}
// Mirror of server matchesFilter (dueQueue.ts): within-dim OR, cross-dim
// union/intersection, empty = no constraint, folder prefix match.
function cardMatches(card){
  var results=[];
  if(selected.folderPaths.length){
    var p=card.folderPath||'';
    results.push(!!p&&selected.folderPaths.some(function(f){return p===f||p.indexOf(f+'/')===0;}));
  }
  if(selected.tagIds.length){
    results.push(selected.tagIds.some(function(t){return card.tagIds.indexOf(t)>=0;}));
  }
  if(results.length===0)return true;
  return selected.combinator==='intersection'?results.every(Boolean):results.some(Boolean);
}
function refreshCount(){
  var n=0;for(var i=0;i<CARDS.length;i++){if(cardMatches(CARDS[i]))n++;}
  var anySel=selected.folderPaths.length||selected.tagIds.length;
  if(!anySel){statusMsg(CARDS.length+' card'+(CARDS.length===1?'':'s')+' total');return;}
  statusMsg(n===0?'No cards match this filter':(n+' card'+(n===1?'':'s')+' match'));
}
function renderChips(){
  var bar=document.getElementById('active-filter');
  // Remove any previously rendered chip; re-insert the persistent controls.
  var mc=document.getElementById('match-count');
  [].forEach.call(bar.querySelectorAll('.chip'),function(n){n.parentNode.removeChild(n);});
  function addChip(text,kind,value){
    var c=document.createElement('span');c.className='chip';c.setAttribute('data-kind',kind);c.setAttribute('data-value',value);
    c.innerHTML=esc(text)+' <button class="chip-x" type="button" aria-label="Remove">×</button>';
    bar.insertBefore(c,mc);
    c.querySelector('.chip-x').addEventListener('click',function(){removeFromFilter(kind,value);});
  }
  selected.folderPaths.forEach(function(p){addChip(p,'folder',p);});
  selected.tagIds.forEach(function(t){
    var labels=[].slice.call(document.querySelectorAll('.tag-chip[data-tag]'));
    var m=labels.filter(function(n){return n.getAttribute('data-tag')===t;})[0];
    addChip(m?m.querySelector('.tag-label').textContent:t,'tag',t);
  });
}
function removeFromFilter(kind,value){
  if(kind==='folder'){selected.folderPaths=selected.folderPaths.filter(function(x){return x!==value;});}
  else{selected.tagIds=selected.tagIds.filter(function(x){return x!==value;});}
  updateAll();
}
function toggle(kind,value){
  var arr=kind==='folder'?'folderPaths':'tagIds';
  var i=selected[arr].indexOf(value);
  if(i>=0)selected[arr].splice(i,1);else selected[arr].push(value);
  updateAll();
}
function updateAll(){
  [].forEach.call(document.querySelectorAll('.tree-node'),function(n){
    var p=n.getAttribute('data-folder');
    n.classList.toggle('sel',isSelectedFolder(p));
  });
  [].forEach.call(document.querySelectorAll('.tag-chip'),function(n){
    var t=n.getAttribute('data-tag');
    n.classList.toggle('sel',isSelectedTag(t));
  });
  renderChips();
  // Count is a pure local computation now — no network, so recompute inline.
  refreshCount();
}
function persistFilter(){try{localStorage.setItem('ml-practice-filter',JSON.stringify(selectedFilter()));}catch(e){}}
[].forEach.call(document.querySelectorAll('.tree-node .tree-row'),function(n){
  n.addEventListener('click',function(){toggle('folder',n.parentNode.getAttribute('data-folder'));});
  n.addEventListener('keydown',function(e){if(e.key===' '||e.key==='Enter'){e.preventDefault();toggle('folder',n.parentNode.getAttribute('data-folder'));}});
});
[].forEach.call(document.querySelectorAll('.tag-chip'),function(n){
  n.addEventListener('click',function(){toggle('tag',n.getAttribute('data-tag'));});
  n.addEventListener('keydown',function(e){if(e.key===' '||e.key==='Enter'){e.preventDefault();toggle('tag',n.getAttribute('data-tag'));}});
});
function setCombinator(mode){
  selected.combinator=(mode==='intersection')?'intersection':'union';
  [].forEach.call(document.querySelectorAll('.combo-tile'),function(n){
    var on=n.getAttribute('data-combinator')===selected.combinator;
    n.classList.toggle('sel',on);
    n.setAttribute('aria-checked',on?'true':'false');
  });
  refreshCount();
}
[].forEach.call(document.querySelectorAll('.combo-tile'),function(n){
  n.addEventListener('click',function(){setCombinator(n.getAttribute('data-combinator'));});
});
document.getElementById('clear-filter').addEventListener('click',function(){
  selected={folderPaths:[],tagIds:[],combinator:'union'};
  setCombinator('union');updateAll();
});
document.getElementById('start-practice').addEventListener('click',function(){
  persistFilter();location.href='/practice';
});
(function(){
  // Restore a previously persisted filter, if any.
  try{var raw=localStorage.getItem('ml-practice-filter');if(raw){var f=JSON.parse(raw);
    if(Array.isArray(f.folderPaths))selected.folderPaths=f.folderPaths;
    if(Array.isArray(f.tagIds))selected.tagIds=f.tagIds;
    if(f.combinator==='intersection'||f.combinator==='union')selected.combinator=f.combinator;
    setCombinator(selected.combinator);updateAll();return;}}catch(e){}
  refreshCount();
})();
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

// ---- Practice tab ----

/**
 * Practice is client-rendered: a static shell that fetches /api/due, walks the
 * queue one card at a time (answer -> reveal -> grade), and POSTs each grade.
 * Kept deliberately framework-free — plain fetch + DOM, no build step.
 */
function renderPractice(): string {
  const body =
    `<h1>Practice</h1>` +
    `<div id="progress" class="muted" style="margin:6px 0 4px"></div>` +
    `<div id="mount"></div>` +
    `<div class="status" id="status"></div>` +
    `<script>${practiceScript()}</script>`;
  return pageShell('MergeLearn — Practice', 'practice', body);
}

function practiceScript(): string {
  return `
var queue=[];var pos=0;var reviewed=0;var confidence=0;var sessionId=null;
var attempt=null;var cardStartedAt=0;var practiceMode='review';var dragEl=null;
function statusMsg(t){var s=document.getElementById('status');s.textContent=t;s.classList.add('show');setTimeout(function(){s.classList.remove('show');},1600);}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function progress(){var p=document.getElementById('progress');if(!queue.length){p.textContent='';return;}var noun=practiceMode==='lesson'?'Activity':'Card';p.textContent=noun+' '+Math.min(pos+1,queue.length)+' of '+queue.length+' · '+reviewed+' completed';}
function render(){
  progress();
  var mount=document.getElementById('mount');
  if(pos>=queue.length){
    var done=practiceMode==='lesson'?'Lesson complete — '+reviewed+' activities completed. Reviews are now scheduled.':'Session complete — '+reviewed+' reviewed. Nothing more due.';
    var empty=practiceMode==='lesson'?'This lesson has no active activities.':'Nothing due right now. Come back later, or author more cards.';
    mount.innerHTML=queue.length?'<div class="done-note">'+done+'</div>':'<div class="empty">'+empty+'</div>';return;
  }
  var c=queue[pos];confidence=0;attempt=null;cardStartedAt=Date.now();
  var interaction=c.interaction||{type:'flashcard'};
  var interactive=interaction.type!=='flashcard';
  // Sticky progressive disclosure: default collapsed, but remember the choice
  // so a learner who wants depth isn't re-collapsing it every card.
  var deepOpen=false;try{deepOpen=localStorage.getItem('ml-deep-open')==='1';}catch(e){}
  var fmt=function(s){return esc(s).replace(/\x60([^\x60]+)\x60/g,'<code>$1</code>');};
  var srcs=(c.sources||[]).map(function(s){return '<div class="src"><div class="meta">'+esc(s.path)+':'+s.startLine+'-'+s.endLine+' @ '+esc(s.commit)+' ('+esc(s.status)+')</div>'+(s.snippetHtml||'<pre>'+esc(s.text)+'</pre>')+'</div>';}).join('');
  var examples=(c.examples||[]).map(function(x){var head=(x.label||'')+(x.language?' ('+x.language+')':'');var code=x.code?'<pre><code>'+esc(x.code)+'</code></pre>':'';var note=x.note?'<div class="ex-note">'+fmt(x.note)+'</div>':'';return '<div class="ex">'+(head?'<div class="ex-label">'+esc(head)+'</div>':'')+code+note+'</div>';}).join('');
  var ctx=c.context?'<div class="ctx markdown-body">'+(c.contextHtml||fmt(c.context))+'</div>':'';
  var mistakes=(c.commonMistakes||[]).length?'<p class="label">Common mistakes</p><ul>'+c.commonMistakes.map(function(m){return '<li>'+fmt(m)+'</li>';}).join('')+'</ul>':'';
  var confLabels=[['1','Guessing'],['2','Low'],['3','Medium'],['4','High'],['5','Certain']];
  var confBtns=confLabels.map(function(p){return '<button class="c'+p[0]+'" data-c="'+p[0]+'">'+p[1]+'<kbd>'+p[0]+'</kbd></button>';}).join('');
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
  var check=interactive?'<button class="primary check-answer" id="check-answer">Check answer <kbd>Enter</kbd></button>':'';
  mount.innerHTML='<article class="pcard"><div class="topline"><span>'+esc(c.setId)+'</span><span>'+esc(c.id)+'</span></div>'+
    '<div class="prompt markdown-body">'+(c.promptHtml||fmt(c.prompt))+'</div>'+ctx+srcs+attemptUi+
    '<div class="confidence" id="confidence"><p class="label">Before reveal — how confident are you?</p><div class="conf-opts">'+confBtns+'</div></div>'+check+
    '<div class="reveal" id="reveal-panel"><div id="attempt-review"></div><p class="label">Expected answer</p><p class="short">'+fmt(c.shortAnswer)+'</p>'+
    '<details class="deep" id="deep"'+(deepOpen?' open':'')+'><summary><span class="deep-more">Show full explanation</span><span class="deep-less">Hide full explanation</span></summary>'+
    '<div class="expl markdown-body">'+(c.explanationHtml||fmt(c.explanation))+'</div>'+examples+mistakes+'</details>'+
    '<p class="label grade-label">Now that you\\'ve seen it — how well did you actually know it?</p>'+
    '<div class="actions grade"><button class="g1" data-r="1">Again<kbd>1</kbd></button><button class="g2" data-r="2">Hard<kbd>2</kbd></button><button class="g3" data-r="3">Good<kbd>3</kbd></button><button class="g4" data-r="4">Easy<kbd>4</kbd></button></div></div></article>';
  [].forEach.call(document.querySelectorAll('#confidence button'),function(b){b.addEventListener('click',function(){setConfidence(Number(b.getAttribute('data-c')));});});
  var checkBtn=document.getElementById('check-answer');if(checkBtn)checkBtn.addEventListener('click',reveal);
  wireParsons();
  [].forEach.call(document.querySelectorAll('.grade button'),function(b){b.addEventListener('click',function(){grade(Number(b.getAttribute('data-r')));});});
  var deep=document.getElementById('deep');
  if(deep)deep.addEventListener('toggle',function(){try{localStorage.setItem('ml-deep-open',deep.open?'1':'0');}catch(e){}});
}
function setConfidence(n){
  confidence=n;[].forEach.call(document.querySelectorAll('#confidence button'),function(b){b.classList.toggle('sel',Number(b.getAttribute('data-c'))===n);});
  var c=queue[pos];if(!c||!c.interaction||c.interaction.type==='flashcard')reveal();
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
  if(i.type==='self_response'){
    var text=(document.getElementById('attempt-text').value||'').trim();
    if(!text){statusMsg('Write an answer first.');return null;}
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
  if(a.interaction==='self_response')return '<p class="label">Your answer</p><p class="learner-answer">'+esc(a.responseText)+'</p>';
  if(a.interaction==='parsons'){
    var pi=c.interaction;var byId={};(pi.blocks||[]).forEach(function(b){byId[b.id]=b;});
    var correctHtml=(pi.correctOrder||[]).map(function(id){var b=byId[id]||{code:id};return '<li><pre><code>'+esc(b.code)+'</code></pre></li>';}).join('');
    var head='<p class="result '+(a.correct?'correct':'incorrect')+'">'+(a.correct?'Correct order':'Not quite')+'</p>';
    return head+(a.correct?'':'<p class="label">Correct order</p><ol class="p-solution">'+correctHtml+'</ol>');
  }
  var i=c.interaction;var selected=new Set(a.selectedOptionIds||[]);
  var feedback=i.options.filter(function(o){return selected.has(o.id);}).map(function(o){return '<li><strong>'+esc(o.text)+'</strong> — '+esc(o.feedback)+'</li>';}).join('');
  return '<p class="result '+(a.correct?'correct':'incorrect')+'">'+(a.correct?'Correct':'Not quite')+'</p><p class="label">Feedback on your choice</p><ul class="choice-feedback">'+feedback+'</ul>';
}
function reveal(){
  if(!confidence){statusMsg('Rate confidence (1-5) first.');return;}
  if(isRevealed())return;
  attempt=collectAttempt();if(!attempt)return;
  var c=queue[pos];document.getElementById('attempt-review').innerHTML=attemptReviewHtml(c,attempt);
  document.getElementById('reveal-panel').classList.add('show');
  var conf=document.getElementById('confidence');if(conf)conf.classList.add('locked');
  var area=document.querySelector('.attempt');if(area)area.classList.add('locked');
  var check=document.getElementById('check-answer');if(check)check.disabled=true;
  if(window.__mlMermaid)window.__mlMermaid();
}
function isRevealed(){var p=document.getElementById('reveal-panel');return p&&p.classList.contains('show');}
async function grade(r){
  var c=queue[pos];if(!c)return;
  if(!sessionId){statusMsg('no active session');return;}
  try{
    if(attempt){var deep=document.getElementById('deep');attempt.revealedFull=!!(deep&&deep.open);}
    var res=await fetch('/api/session/grade',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId:sessionId,cardId:c.id,setId:c.setId,rating:r,confidence:confidence||undefined,attempt:attempt||undefined})});
    var j=await res.json();
    if(!j.ok){statusMsg(j.error||'grade failed');return;}
    reviewed++;statusMsg('Graded · next due '+new Date(j.due).toLocaleDateString());
    pos++;render();
  }catch(e){statusMsg('grade failed');}
}
function endSession(sendit){if(!sessionId)return;var id=sessionId;sessionId=null;if(!sendit)return;try{var u=new URL('/api/session/end',location.origin);fetch(u.toString(),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId:id}),keepalive:true});}catch(e){}}
document.addEventListener('keydown',function(e){
  if(['INPUT','TEXTAREA','SELECT'].indexOf(e.target.tagName)>=0)return;
  if(e.key===' '||e.key==='Enter'){e.preventDefault();if(!isRevealed())reveal();return;}
  if(/^[1-5]$/.test(e.key)&&!isRevealed()){setConfidence(Number(e.key));return;}
  if(/^[1-4]$/.test(e.key)&&isRevealed())grade(Number(e.key));
});
window.addEventListener('beforeunload',function(){endSession(true);});
(async function(){
  var params=new URLSearchParams(location.search);var setParam=params.get('set');
  var lessonMode=params.get('mode')==='lesson'&&!!setParam;practiceMode=lessonMode?'lesson':'review';
  var filter=null;try{var raw=localStorage.getItem('ml-practice-filter');if(raw)filter=JSON.parse(raw);}catch(e){}
  if(setParam&&!lessonMode)filter={setIds:[setParam]};
  if(lessonMode){var h=document.querySelector('main h1');if(h)h.textContent='Learn';}
  var sessionBody=lessonMode?{lessonSetId:setParam}:(filter||{});
  try{
    var sr=await fetch('/api/session/start',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(sessionBody)});
    var sj=await sr.json();if(sj.ok)sessionId=sj.sessionId;
  }catch(e){statusMsg('session start failed');}
  try{
    var endpoint=lessonMode?'/api/lesson?set='+encodeURIComponent(setParam):'/api/due';
    var options=lessonMode?undefined:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(filter||{})};
    var res=await fetch(endpoint,options);
    var j=await res.json();queue=j.cards||[];
    // Continue: resume a partially-done lesson at its first unattempted card.
    if(lessonMode&&j.progress&&j.progress.resumeCardId){
      var ri=queue.findIndex(function(c){return c.id===j.progress.resumeCardId;});
      if(ri>0)pos=ri;
    }
  }catch(e){queue=[];}
  render();
})();
`;
}

// ---- HTTP helpers ----

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function sendHtml(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
  res.end(body);
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

type Tab = 'home' | 'practice' | 'set' | 'manage';

function pageShell(title: string, tab: Tab, body: string): string {
  const tabs: { id: Tab; href: string; label: string }[] = [
    { id: 'home', href: '/', label: 'Home' },
    { id: 'practice', href: '/practice', label: 'Practice' },
    { id: 'manage', href: '/manage', label: 'Manage' },
  ];
  const nav = tabs
    .map((t) => {
      const current = t.id === tab ? ' aria-current="page"' : '';
      return `<a href="${t.href}"${current}>${t.label}</a>`;
    })
    .join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" />` +
    `<meta name="viewport" content="width=device-width, initial-scale=1" />` +
    `<title>${escapeHtml(title)}</title><style>${style()}</style></head><body>` +
    `<header class="topbar"><span class="brand">MergeLearn</span>` +
    `<nav class="tabs">${nav}</nav>` +
    `<span class="hint">local · model-free</span></header>` +
    `<main>${body}</main><script>${mermaidLoader()}</script></body></html>`;
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
.tabs a[aria-current=page]{background:var(--accent);color:#fff}
.hint{margin-left:auto;color:var(--muted);font-size:12px}
main{max-width:820px;margin:0 auto;padding:28px 24px 64px}
h1{font-size:1.6rem;letter-spacing:-0.02em;margin:0 0 4px}
h2{font-size:1.15rem;margin:0 0 10px}
.muted{color:var(--muted)}
.empty{border:1px dashed var(--border);border-radius:var(--radius);padding:32px;text-align:center;color:var(--muted)}
.empty code{background:var(--overlay);padding:2px 6px;border-radius:4px;font-family:var(--mono);font-size:13px;color:var(--text)}
.due-banner{display:flex;align-items:baseline;gap:10px;margin:18px 0 24px}
.due-banner strong{font-size:2rem;color:var(--accent-hover);letter-spacing:-0.03em}
.cta{display:inline-block;margin-top:6px;padding:9px 18px;border-radius:var(--radius-sm);background:var(--accent);color:#fff;font-weight:600}
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
.pcard .topline{display:flex;gap:10px;color:var(--muted);font-size:12px;font-family:var(--mono);margin-bottom:12px}
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
.choice{display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--overlay);cursor:pointer}
.choice:hover{background:var(--hover)}
.choice input{margin-top:4px;accent-color:var(--accent)}
.check-answer{margin-top:14px}.check-answer kbd{font-family:var(--mono);font-size:11px;opacity:.75;margin-left:5px}
.check-answer:disabled{opacity:.55;cursor:default}
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
.active-filter{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:14px 16px;background:var(--raised);border:1px solid var(--border);border-radius:var(--radius);margin:18px 0}
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
.combo-hint{color:var(--muted);font-size:12px;font-family:var(--mono)}`;
}
