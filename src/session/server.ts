import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { summarizeCalibration } from '../core/calibration.js';
import { coursesSummary, upsertCourse } from '../core/courses.js';
import { evaluateCardQuality } from '../core/cardQuality.js';
import { completeDelayedProbe, delayedProbeSummary, dueDelayedProbes } from '../core/delayedProbes.js';
import { diffSnippetCss, renderDiffSnippetHtml } from '../core/diffView.js';
import { buildEvidenceTimeline, graphByType, type BuildEvidenceTimelineOptions } from '../core/evidenceTimeline.js';
import { addCorrection, recordReviewEvent } from '../core/events.js';
import { buildHistoryActivity } from '../core/historyActivity.js';
import { GRAPH_MAP_LANES, isRollupNode, limitEvidenceTimeline, MAP_DISPLAY_LIMITS, parseDisplayLimit, parseTimelineOffset, parseTimelinePageSize, selectGraphMapDisplay, selectSkillMapConcepts, selectTimelineDisplay, type GraphMapMode } from '../core/mapScaling.js';
import { activeLearningItems, generateCardBatch, recordAnswer } from '../core/planner.js';
import { loadPreferences, normalizePreferences, savePreferences } from '../core/preferences.js';
import { renderMarkdownHtml } from '../core/markdownHtml.js';
import { buildPracticeQueue, parseReviewedInSession, practiceItemAt } from '../core/practiceQueue.js';
import { buildLearningPathGraph } from '../core/learningPath.js';
import { buildProgressGraph } from '../core/progress.js';
import { bulkUpdateQuestionStatus, draftQuestionsForCourse, questionCandidates, questionSummary, updateQuestionStatus } from '../core/questions.js';
import { renderProgress, renderToday } from '../core/render.js';
import { assignStudyConditions, completePassiveReview, studySummary } from '../core/study.js';
import { loadState, saveState } from '../core/store.js';
import { buildWorkbenchSummary } from '../core/workbench.js';
import type { CardQualityResult, CorrectionType, EvidenceTimelineEdge, EvidenceTimelineNode, LearningItem, QuestionBankEntry, ReviewEventType, TutorState, UserPreferences } from '../core/types.js';

export type ReviewServer = {
  server: Server;
  url: string;
  close: () => Promise<void>;
};

export async function startReviewServer(repoPath: string, port = 0): Promise<ReviewServer> {
  const server = createServer(async (req, res) => {
    try {
      await handleRequest(repoPath, req, res);
    } catch (error) {
      sendText(res, 500, `MergeLearn Tutor session error: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  });
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not determine review server address.');
  const url = `http://127.0.0.1:${address.port}`;
  return { server, url, close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
}

async function handleRequest(repoPath: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method ?? 'GET';
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  if (method === 'GET' && url.pathname === '/') return sendHtml(res, 200, renderSessionHtml(await loadState(repoPath), await loadPreferences(repoPath)));
  if (method === 'GET' && url.pathname === '/practice') {
    const state = await loadState(repoPath);
    const preferences = await loadPreferences(repoPath);
    const indexParam = url.searchParams.get('index');
    const reviewedInSession = parseReviewedInSession(url.searchParams.get('reviewed'));
    const index = indexParam !== null ? Number.parseInt(indexParam, 10) : undefined;
    return sendHtml(res, 200, renderPracticeHtml(state, preferences, { index: Number.isFinite(index) ? index : undefined, reviewedInSession }));
  }
  if (method === 'GET' && url.pathname === '/api/practice/queue') {
    const state = await loadState(repoPath);
    const indexParam = url.searchParams.get('index');
    const reviewedInSession = parseReviewedInSession(url.searchParams.get('reviewed'));
    const index = indexParam !== null ? Number.parseInt(indexParam, 10) : undefined;
    return sendJson(res, 200, buildPracticeQueue(state, { index: Number.isFinite(index) ? index : undefined, reviewedInSession }));
  }
  if (method === 'GET' && url.pathname === '/map') return sendHtml(res, 200, renderMapHtml(await loadState(repoPath), url));
  if (method === 'GET' && url.pathname === '/workbench') return sendHtml(res, 200, renderWorkbenchHtml(await loadState(repoPath)));
  if (method === 'GET' && url.pathname === '/plan') return sendHtml(res, 200, renderPlanHtml(await loadState(repoPath)));
  if (method === 'GET' && url.pathname === '/courses') return sendHtml(res, 200, renderCoursesHtml(await loadState(repoPath)));
  if (method === 'GET' && url.pathname === '/questions') return sendHtml(res, 200, renderQuestionsHtml(await loadState(repoPath)));
  if (method === 'GET' && url.pathname === '/timeline') return sendHtml(res, 200, renderTimelineHtml(await loadState(repoPath), parseTimelinePageSize(url.searchParams.get('limit')), parseTimelineOffset(url.searchParams.get('offset'))));
  if (method === 'GET' && url.pathname === '/graph') return sendHtml(res, 200, renderGraphHtml(await loadState(repoPath)));
  if (method === 'GET' && url.pathname === '/progress') return sendHtml(res, 200, renderProgressHtml(await loadState(repoPath)));
  if (method === 'GET' && (url.pathname === '/learning-path' || url.pathname === '/path')) return sendHtml(res, 200, renderLearningPathHtml(await loadState(repoPath), url));
  if (method === 'GET' && url.pathname === '/audit') return sendHtml(res, 200, renderAuditHtml(await loadState(repoPath)));
  if (method === 'GET' && url.pathname === '/history') {
    const state = await loadState(repoPath);
    const type = url.searchParams.get('type') ?? undefined;
    const limit = parseDisplayLimit(url.searchParams.get('limit'), 20) ?? 20;
    const offset = parseTimelineOffset(url.searchParams.get('offset'));
    return sendHtml(res, 200, renderHistoryHtml(state, { type, limit, offset }));
  }
  if (method === 'GET' && url.pathname === '/api/history/activity') {
    const state = await loadState(repoPath);
    const type = url.searchParams.get('type') ?? undefined;
    const limit = parseDisplayLimit(url.searchParams.get('limit'), 20) ?? 20;
    const offset = parseTimelineOffset(url.searchParams.get('offset'));
    return sendJson(res, 200, buildHistoryActivity(state, { type: type ?? undefined, limit, offset }));
  }
  if (method === 'GET' && url.pathname === '/api/questions/candidates') {
    const state = await loadState(repoPath);
    return sendJson(res, 200, { candidates: questionCandidates(state) });
  }
  if (method === 'GET' && url.pathname === '/study') return sendHtml(res, 200, renderStudyHtml(await loadState(repoPath)));
  if (method === 'GET' && url.pathname === '/preferences') return sendHtml(res, 200, renderPreferencesHtml(await loadState(repoPath), await loadPreferences(repoPath)));
  if (method === 'GET' && (url.pathname === '/state.json' || url.pathname === '/api/state')) return sendJson(res, 200, await loadState(repoPath));
  if (method === 'GET' && url.pathname === '/api/workbench') return sendJson(res, 200, buildWorkbenchSummary(await loadState(repoPath)));
  if (method === 'GET' && url.pathname === '/api/progress') return sendJson(res, 200, buildProgressGraph(await loadState(repoPath)));
  if (method === 'GET' && url.pathname === '/api/learning-path') {
    const courseId = url.searchParams.get('course') ?? undefined;
    return sendJson(res, 200, buildLearningPathGraph(await loadState(repoPath), { courseId }));
  }
  if (method === 'GET' && url.pathname === '/api/calibration') return sendJson(res, 200, summarizeCalibration(await loadState(repoPath)));
  if (method === 'GET' && url.pathname === '/api/delayed-probes') return sendJson(res, 200, delayedProbeData(await loadState(repoPath)));
  if (method === 'GET' && url.pathname === '/api/study') return sendJson(res, 200, studyData(await loadState(repoPath)));
  if (method === 'GET' && url.pathname === '/api/cards/history') return sendJson(res, 200, cardHistoryData(await loadState(repoPath)));
  if (method === 'GET' && url.pathname === '/api/courses') return sendJson(res, 200, { courses: coursesSummary(await loadState(repoPath)) });
  if (method === 'GET' && url.pathname === '/api/questions') return sendJson(res, 200, questionBankData(await loadState(repoPath)));
  if (method === 'GET' && url.pathname === '/api/evidence-timeline') {
    const timeline = buildEvidenceTimeline(await loadState(repoPath), timelineOptionsFromUrl(url, true));
    const limit = parseDisplayLimit(url.searchParams.get('limit'));
    return sendJson(res, 200, limit ? limitEvidenceTimeline(timeline, limit) : timeline);
  }
  if (method === 'GET' && url.pathname === '/api/evidence-graph') {
    const timeline = buildEvidenceTimeline(await loadState(repoPath), timelineOptionsFromUrl(url, true));
    const limit = parseDisplayLimit(url.searchParams.get('limit'));
    return sendJson(res, 200, limit ? limitEvidenceTimeline(timeline, limit) : timeline);
  }
  if (method === 'GET' && url.pathname === '/api/preferences') return sendJson(res, 200, await loadPreferences(repoPath));
  if (method === 'POST' && url.pathname === '/api/cards/generate') {
    const body = await readJson(req) as { count?: number; mode?: string; reason?: string; courseId?: string };
    const mode = body.mode === 'regenerate' ? 'regenerate' : 'more';
    const next = generateCardBatch(await loadState(repoPath), await loadPreferences(repoPath), { count: body.count ?? 5, mode, reason: body.reason, courseId: body.courseId });
    await saveState(repoPath, next);
    const batch = next.cardBatches.at(-1)!;
    return sendJson(res, 200, { ok: true, batch, state: summarizeState(next) });
  }
  if (method === 'POST' && url.pathname === '/api/courses') {
    const body = await readJson(req) as { id?: string; title?: string; goal?: string; enabledPlanes?: never; materialPaths?: string[]; docPaths?: string[]; conceptIds?: string[] };
    if (!body.title || !body.goal) return sendJson(res, 400, { ok: false, error: 'title and goal are required' });
    const next = upsertCourse(await loadState(repoPath), { id: body.id, title: body.title, goal: body.goal, enabledPlanes: body.enabledPlanes, materialPaths: body.materialPaths, docPaths: body.docPaths, conceptIds: body.conceptIds });
    await saveState(repoPath, next);
    return sendJson(res, 200, { ok: true, courses: coursesSummary(next) });
  }
  if (method === 'POST' && url.pathname === '/api/questions/draft') {
    const body = await readJson(req) as { courseId?: string; provider?: string; model?: string; count?: number };
    const next = await draftQuestionsForCourse(await loadState(repoPath), { courseId: body.courseId, provider: body.provider as never, model: body.model, count: body.count ?? 6 });
    await saveState(repoPath, next);
    return sendJson(res, 200, { ok: true, questions: questionBankData(next) });
  }
  if (method === 'POST' && url.pathname === '/api/questions/bulk-status') {
    const body = await readJson(req) as { ids?: string[]; status?: 'accepted' | 'rejected' };
    if (!body.ids?.length || !body.status) return sendJson(res, 400, { ok: false, error: 'ids and status are required' });
    const next = bulkUpdateQuestionStatus(await loadState(repoPath), body.ids, body.status);
    await saveState(repoPath, next);
    return sendJson(res, 200, { ok: true, questions: questionBankData(next) });
  }
  if (method === 'POST' && url.pathname === '/api/questions/status') {
    const body = await readJson(req) as { id?: string; status?: 'accepted' | 'rejected' };
    if (!body.id || !body.status) return sendJson(res, 400, { ok: false, error: 'id and status are required' });
    const next = updateQuestionStatus(await loadState(repoPath), body.id, body.status);
    await saveState(repoPath, next);
    return sendJson(res, 200, { ok: true, questions: questionBankData(next) });
  }
  if (method === 'PUT' && url.pathname === '/api/preferences') {
    const body = await readJson(req) as Partial<UserPreferences>;
    const next = normalizePreferences(body);
    await savePreferences(repoPath, next);
    return sendJson(res, 200, { ok: true, preferences: next });
  }
  if (method === 'POST' && url.pathname === '/answer') {
    const body = await readJson(req) as { itemId?: string; answer?: string; correct?: boolean };
    if (!body.itemId || !body.answer) return sendJson(res, 400, { ok: false, error: 'itemId and answer are required' });
    const next = recordAnswer(await loadState(repoPath), body.itemId, body.answer, Boolean(body.correct));
    await saveState(repoPath, next);
    return sendJson(res, 200, { ok: true, state: summarizeState(next) });
  }
  if (method === 'POST' && url.pathname === '/api/delayed-probes/complete') {
    const body = await readJson(req) as { probeId?: string; answer?: string; correct?: boolean };
    if (!body.probeId || !body.answer) return sendJson(res, 400, { ok: false, error: 'probeId and answer are required' });
    const next = completeDelayedProbe(await loadState(repoPath), { probeId: body.probeId, answerText: body.answer, correct: Boolean(body.correct) });
    await saveState(repoPath, next);
    return sendJson(res, 200, { ok: true, state: summarizeState(next), delayedProbes: delayedProbeData(next) });
  }
  if (method === 'POST' && url.pathname === '/api/study/assign') {
    const body = await readJson(req) as { seed?: string; count?: number };
    const next = assignStudyConditions(await loadState(repoPath), { seed: body.seed, count: body.count });
    await saveState(repoPath, next);
    return sendJson(res, 200, { ok: true, state: summarizeState(next), study: studyData(next) });
  }
  if (method === 'POST' && url.pathname === '/api/study/passive-review/complete') {
    const body = await readJson(req) as { assignmentId?: string; durationMs?: number; note?: string };
    if (!body.assignmentId) return sendJson(res, 400, { ok: false, error: 'assignmentId is required' });
    const next = completePassiveReview(await loadState(repoPath), { assignmentId: body.assignmentId, durationMs: body.durationMs, note: body.note });
    await saveState(repoPath, next);
    return sendJson(res, 200, { ok: true, state: summarizeState(next), study: studyData(next) });
  }
  if (method === 'POST' && url.pathname === '/feedback') {
    const body = await readJson(req) as { itemId?: string; eventType?: ReviewEventType; confidenceBeforeReveal?: number; note?: string };
    if (!body.itemId || !body.eventType) return sendJson(res, 400, { ok: false, error: 'itemId and eventType are required' });
    const next = recordReviewEvent(await loadState(repoPath), { itemId: body.itemId, eventType: body.eventType, confidenceBeforeReveal: body.confidenceBeforeReveal, note: body.note });
    await saveState(repoPath, next);
    return sendJson(res, 200, { ok: true, state: summarizeState(next) });
  }
  if (method === 'POST' && url.pathname === '/correct') {
    const body = await readJson(req) as { conceptId?: string; correctionType?: CorrectionType; replacementLabel?: string; note?: string };
    if (!body.conceptId || !body.correctionType) return sendJson(res, 400, { ok: false, error: 'conceptId and correctionType are required' });
    const next = addCorrection(await loadState(repoPath), { targetId: body.conceptId, correctionType: body.correctionType, replacementLabel: body.replacementLabel, note: body.note });
    await saveState(repoPath, next);
    return sendJson(res, 200, { ok: true, state: summarizeState(next) });
  }
  return sendText(res, 404, 'Not found\n');
}

function summarizeState(state: TutorState): Record<string, number> {
  const active = activeLearningItems(state).length;
  const archived = state.learningItems.filter((item) => item.status === 'archived').length;
  return { concepts: state.concepts.length, cards: state.learningItems.length, activeCards: active, archivedCards: archived, batches: state.cardBatches.length, events: state.learningEvents.length, delayedProbes: (state.delayedProbes ?? []).length, studyAssignments: (state.studyAssignments ?? []).length, corrections: state.corrections.length };
}

function delayedProbeData(state: TutorState) {
  const due = dueDelayedProbes(state);
  return {
    summary: delayedProbeSummary(state),
    due,
    upcoming: (state.delayedProbes ?? []).filter((probe) => probe.status === 'scheduled' && !due.some((dueProbe) => dueProbe.id === probe.id)),
    completed: (state.delayedProbes ?? []).filter((probe) => probe.status === 'completed'),
  };
}

function studyData(state: TutorState) {
  return {
    summary: studySummary(state),
    assignments: state.studyAssignments ?? [],
  };
}

function cardHistoryData(state: TutorState) {
  return {
    summary: summarizeState(state),
    batches: state.cardBatches.slice().reverse(),
    cards: state.learningItems.map((item) => ({
      id: item.id,
      title: item.title,
      status: item.status,
      conceptId: item.conceptId,
      courseId: item.courseId,
      questionId: item.questionId,
      batchId: item.batchId,
      generation: item.generation,
      source: item.source,
      archivedAt: item.archivedAt,
      events: state.learningEvents.filter((event) => event.itemId === item.id),
    })),
  };
}

function questionBankData(state: TutorState) {
  return {
    summary: questionSummary(state),
    batches: state.questionDraftBatches.slice().reverse(),
    questions: state.questionBank.slice().reverse(),
  };
}

function qualityForCard(item: LearningItem): CardQualityResult {
  return item.quality ?? evaluateCardQuality(item);
}

function renderQualityPanel(quality: CardQualityResult): string {
  const warnings = quality.warnings.length ? `<p class="quality-warnings">${quality.warnings.map(escapeHtml).join(' · ')}</p>` : '<p class="quality-warnings">No warnings.</p>';
  const scores = `<div class="quality-scores"><span>Evidence ${score(quality.scores.evidence)}</span><span>Answerable ${score(quality.scores.answerability)}</span><span>Specific ${score(quality.scores.specificity)}</span><span>Duplicate risk ${score(quality.scores.duplicateRisk)}</span></div>`;
  return `<section class="quality-panel quality-${quality.verdict}"><div class="quality-summary"><div><p class="label">Quality gate</p><strong>${escapeHtml(quality.verdict.replace('_', ' '))}</strong></div>${warnings}</div><details class="quality-details"><summary>Show quality scores</summary>${scores}</details></section>`;
}

function questionQuality(entry: QuestionBankEntry): CardQualityResult {
  const evidence = entry.evidence.length > 0 ? 0.85 : 0;
  const answerability = (entry.prompt.trim().length >= 40 ? 0.35 : 0) + (entry.expectedAnswer.trim().length >= 40 ? 0.35 : 0) + (entry.expectedFocus.length >= 2 ? 0.3 : 0);
  const specificity = (entry.prompt.includes(entry.evidence[0]?.path ?? '___') ? 0.45 : 0.15) + (entry.prompt.length >= 70 ? 0.35 : 0) + (entry.conceptId ? 0.2 : 0);
  const sourceDiversity = entry.evidence.length > 1 ? 0.85 : entry.evidence.length === 1 ? 0.55 : 0;
  const warnings = [
    ...(entry.evidence.length === 0 ? ['missing evidence'] : []),
    ...(entry.prompt.trim().length < 40 ? ['prompt too vague'] : []),
    ...(entry.expectedAnswer.trim().length < 40 ? ['expected answer too thin'] : []),
    ...(entry.expectedFocus.length < 2 ? ['expected focus too thin'] : []),
  ];
  const blocked = evidence < 0.5 || answerability < 0.5 || specificity < 0.4;
  return { verdict: blocked ? 'blocked' : warnings.length ? 'needs_review' : 'ready', scores: { evidence, answerability, specificity, duplicateRisk: 0, sourceDiversity }, warnings };
}

function score(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function calibrationBuckets(state: TutorState): Array<{ label: string; total: number; correct: number }> {
  const buckets = [
    { label: 'Guessing', total: 0, correct: 0 },
    { label: 'Low', total: 0, correct: 0 },
    { label: 'Medium', total: 0, correct: 0 },
    { label: 'High', total: 0, correct: 0 },
    { label: 'Certain', total: 0, correct: 0 },
  ];
  const latestRevealByItem = new Map<string, number>();
  for (const event of state.learningEvents.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (event.eventType === 'revealed' && event.confidenceBeforeReveal !== undefined) {
      latestRevealByItem.set(event.itemId, event.confidenceBeforeReveal);
      continue;
    }
    if ((event.eventType === 'answered' || event.eventType === 'marked_correct' || event.eventType === 'marked_wrong') && event.correct !== undefined) {
      const confidence = latestRevealByItem.get(event.itemId);
      if (confidence === undefined || confidence < 1 || confidence > 5) continue;
      const bucket = buckets[confidence - 1]!;
      bucket.total += 1;
      if (event.correct) bucket.correct += 1;
    }
  }
  return buckets;
}

type PageShellOptions = {
  focus?: boolean;
  repoPath?: string;
  mapModeBar?: string;
  extraHead?: string;
  surface?: string;
  practiceIndex?: number;
  practiceTotal?: number;
  reviewedInSession?: string[];
};

function timelineOptionsFromUrl(url: URL, defaultIncludeEvents: boolean): BuildEvidenceTimelineOptions {
  const includeEvents = url.searchParams.has('includeEvents')
    ? url.searchParams.get('includeEvents') === 'true'
    : defaultIncludeEvents;
  const courseId = url.searchParams.get('course') ?? undefined;
  return { includeEvents, courseId: courseId || undefined };
}

function mapTimelineOptions(state: TutorState, url: URL): BuildEvidenceTimelineOptions {
  return { includeEvents: false, courseId: url.searchParams.get('course') ?? undefined };
}

function renderLearnMoreSection(item: LearningItem): string {
  const deep = item.bodyMarkdown?.trim();
  if (!deep || deep === item.explanationMarkdown.trim()) return '';
  return `<details class="learn-more"><summary class="learn-more-summary"><span>Learn more</span><button type="button" class="ghost learn-more-copy" data-action="copy-learn-more">Copy</button></summary><div class="learn-more-body markdown-body">${renderMarkdownHtml(deep)}</div><textarea class="learn-more-raw is-hidden" readonly aria-hidden="true">${escapeHtml(deep)}</textarea></details>`;
}

function shortRepoLabel(repoPath?: string): string {
  if (!repoPath) return 'local session';
  const normalized = repoPath.replace(/\\/g, '/').replace(/\/+$/, '');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length === 0) return 'local session';
  if (parts.length <= 2) return parts.join('/');
  return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
}

function renderPageIntro(eyebrow: string, title: string, description: string, statsHtml = ''): string {
  return `<header class="page-intro">${statsHtml}<p class="eyebrow">${escapeHtml(eyebrow)}</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></header>`;
}

function workbenchGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function shellOpts(state: TutorState, surface: string, extra: Partial<PageShellOptions> = {}): PageShellOptions {
  return { repoPath: state.repoPath, surface, ...extra };
}

function renderMapCourseFilter(state: TutorState, activeCourseId?: string): string {
  if (state.courses.length === 0) return '';
  const links = state.courses.map((course) => {
    const active = course.id === activeCourseId ? ' is-active' : '';
    return `<a class="ghost map-course-link${active}" href="/map?mode=local-graph&amp;course=${encodeURIComponent(course.id)}">${escapeHtml(course.title)}</a>`;
  }).join('');
  const allLink = !activeCourseId ? '<a class="ghost map-course-link is-active" href="/map?mode=local-graph">All courses</a>' : '<a class="ghost map-course-link" href="/map?mode=local-graph">All courses</a>';
  return `<section class="panel filter-panel"><div class="section-head"><div><p class="eyebrow">Course scope</p><h2>Filter map to one learning track</h2></div></div><div class="actions">${allLink}${links}</div></section>`;
}

function renderHistoryActivityPanel(state: TutorState, options: { type?: string; limit: number; offset: number }): string {
  const activity = buildHistoryActivity(state, options);
  const types = [...new Set(state.learningEvents.map((event) => event.eventType))].sort();
  const chips = types.map((type) => {
    const active = options.type === type ? ' aria-current="page"' : '';
    const query = new URLSearchParams({ type, limit: String(options.limit), offset: '0' });
    return `<a class="ghost history-type-chip${options.type === type ? ' is-active' : ''}" href="/history?${query}"${active}>${escapeHtml(type)}</a>`;
  }).join('');
  const rows = activity.items.map((row) => `<article class="timeline-row history-activity-row" data-event-type="${escapeHtml(row.eventType)}"><span>${escapeHtml(row.eventType)}</span><strong>${escapeHtml(row.title)}</strong><small>${escapeHtml(row.detail)}</small><time>${escapeHtml(row.createdAt)}</time></article>`).join('');
  const nextOffset = options.offset + activity.items.length;
  const pagination = nextOffset < activity.total
    ? `<a class="ghost" href="/history?limit=${options.limit}&offset=${nextOffset}${options.type ? `&type=${encodeURIComponent(options.type)}` : ''}">Load more</a>`
    : '';
  return `<section class="panel history-activity-panel"><div class="section-head"><div><p class="eyebrow">Learning events</p><h2>Activity timeline</h2><p>Chronological review events from local state. Filter by event type or open <a href="/api/history/activity">activity JSON</a>.</p></div></div><div class="actions"><a class="ghost history-type-chip${!options.type ? ' is-active' : ''}" href="/history?limit=${options.limit}">All types</a>${chips}</div><div class="timeline-list">${rows || '<p>No learning events yet.</p>'}</div><p class="setup-note">Showing ${Math.min(nextOffset, activity.total)} of ${activity.total} events.${pagination ? ` ${pagination}` : ''}</p></section>`;
}

function renderMapModeBar(activeMode: string, courseId?: string): string {
  const courseQuery = courseId ? `&course=${encodeURIComponent(courseId)}` : '';
  const coursePathQuery = courseId ? `?course=${encodeURIComponent(courseId)}` : '';
  const tabs = [
    { id: 'local-graph', label: 'Local graph', href: `/map?mode=local-graph${courseQuery}`, description: 'What concepts, cards, and evidence are related?' },
    { id: 'provenance', label: 'Provenance lane', href: `/map?mode=provenance${courseQuery}`, description: 'Where did each card and question come from?' },
    { id: 'skill-map', label: 'Skill map', href: '/map?mode=skill-map', description: 'Which concepts are weak, strong, or due for review?' },
    { id: 'learning-path', label: 'Learning path', href: `/learning-path${coursePathQuery}`, description: 'What order should I study concepts given prerequisites?' },
  ];
  const tabHtml = tabs.map((tab) => `<a class="map-mode-tab ${tab.id === activeMode ? 'is-active' : ''}" href="${tab.href}" ${tab.id === activeMode ? 'aria-current="page"' : ''}>${escapeHtml(tab.label)}</a>`).join('');
  const tabDescription = tabs.find((tab) => tab.id === activeMode)?.description ?? '';
  return `<nav class="map-mode-bar" aria-label="Map mode"><div class="map-mode-copy"><strong>Map mode</strong><p>${escapeHtml(tabDescription)}</p></div><div class="map-mode-tabs">${tabHtml}</div></nav>`;
}

function renderSkillMapHeatmap(state: TutorState): string {
  const graph = buildProgressGraph(state);
  const concepts = graph.nodes.filter((node) => node.kind !== 'group');
  const display = selectSkillMapConcepts(concepts);
  const cells = display.concepts.map((concept) => {
    const tone = concept.status === 'confident' ? 'skill-confident' : concept.status === 'needs_review' ? 'skill-weak' : concept.status === 'learning' ? 'skill-learning' : 'skill-new';
    return `<article class="skill-cell ${tone}" title="${escapeHtml(concept.label)} — ${Math.round(concept.mastery * 100)}% mastery"><strong>${escapeHtml(concept.label)}</strong><small>${Math.round(concept.mastery * 100)}% · ${escapeHtml(concept.status.replace(/_/g, ' '))}</small></article>`;
  }).join('');
  const overflow = display.hidden > 0
    ? `<p class="setup-note">Showing ${display.concepts.length} of ${display.total} concepts (weak and low-mastery first). <a class="ghost" href="/api/progress">Open progress JSON</a> for the full list.</p>`
    : '';
  return `<section class="panel"><div class="section-head"><div><p class="eyebrow">Skill map</p><h2>Concept mastery heatmap</h2><p>Green is confident, yellow is learning, red needs review, gray is new or unexposed.</p></div><a class="ghost" href="/api/progress">Open progress JSON</a></div><div class="skill-heatmap">${cells || '<p>No concepts yet. Ingest evidence to populate the skill map.</p>'}</div>${overflow}</section>`;
}

function renderGraphBody(state: TutorState, options: BuildEvidenceTimelineOptions = { includeEvents: false }): string {
  const timeline = buildEvidenceTimeline(state, options);
  const graphGroups = graphByType(timeline).filter((group) => group.type !== 'event');
  const groups = graphGroups.map((group) => `<section class="graph-column" data-graph-type="${escapeHtml(group.type)}"><h2>${escapeHtml(group.type)}</h2>${group.nodes.slice(0, MAP_DISPLAY_LIMITS.graphColumnNodes).map((node) => `<article class="graph-node"><strong>${escapeHtml(node.label)}</strong><small>${escapeHtml(node.subtitle ?? node.path ?? node.status ?? '')}</small></article>`).join('')}${group.nodes.length > MAP_DISPLAY_LIMITS.graphColumnNodes ? `<p class="setup-note">+${group.nodes.length - MAP_DISPLAY_LIMITS.graphColumnNodes} more ${escapeHtml(group.type)} nodes in raw JSON.</p>` : ''}</section>`).join('');
  const map = renderGraphMap(timeline.nodes, timeline.edges, 'local-graph', false);
  const raw = escapeHtml(JSON.stringify({ nodes: timeline.nodes, edges: timeline.edges }, null, 2));
  const courseFilter = renderMapCourseFilter(state, options.courseId);
  return `${courseFilter}${map}${renderGraphFocusPanel(graphGroups, timeline.edges.length)}<section class="graph-grid">${groups}</section><details class="panel"><summary><strong>Raw graph projection</strong></summary><pre>${raw}</pre></details>${graphMapHoverScript()}`;
}

function renderTimelineBody(state: TutorState, pageSize: number = MAP_DISPLAY_LIMITS.timelinePageSize, offset = 0, options: BuildEvidenceTimelineOptions = { includeEvents: true }): string {
  const timeline = buildEvidenceTimeline(state, options);
  const display = selectTimelineDisplay(timeline.nodes, pageSize, offset);
  const docs = timeline.nodes.filter((node) => node.type === 'doc').slice(0, MAP_DISPLAY_LIMITS.timelineDocsLimit);
  const hiddenDocs = Math.max(0, timeline.nodes.filter((node) => node.type === 'doc').length - docs.length);
  const items = display.nodes.map((node) => `<article class="timeline-row" data-node-type="${escapeHtml(node.type)}"><span>${escapeHtml(node.type)}</span><strong>${escapeHtml(node.label)}</strong><small>${escapeHtml(node.subtitle ?? node.path ?? '')}</small></article>`).join('');
  const metrics = `<div class="stats"><div>${timeline.summary.commit ?? 0}<span>commits</span></div><div>${timeline.summary.doc ?? 0}<span>docs</span></div><div>${timeline.summary.question ?? 0}<span>questions</span></div><div>${timeline.summary.card ?? 0}<span>cards</span></div></div>`;
  const timelineOverflow = display.hidden > 0
    ? `<div class="actions"><a class="ghost" href="/timeline?limit=${pageSize}&offset=${offset + display.nodes.length}">Load ${Math.min(pageSize, display.hidden)} more</a><a class="ghost" href="/api/evidence-timeline">Open full timeline JSON</a></div><p class="setup-note">Showing ${offset + display.nodes.length} of ${display.total} timeline nodes (newest first).</p>`
    : offset > 0
      ? `<p class="setup-note">Showing all ${display.total} timeline nodes.</p>`
      : '';
  return `${metrics}${renderTimelineFilterPanel(timeline.summary)}<section class="panel"><h2>Document lens</h2><div class="mini-grid">${docs.map((doc) => `<article class="mini-card"><strong>${escapeHtml(doc.label)}</strong><p>${escapeHtml(doc.path ?? doc.subtitle ?? '')}</p><small>${timeline.edges.filter((edge) => edge.from === doc.id || edge.to === doc.id).length} links</small></article>`).join('') || '<p>No markdown docs found yet.</p>'}</div>${hiddenDocs > 0 ? `<p class="setup-note">+${hiddenDocs} more docs in full timeline JSON.</p>` : ''}</section><section class="panel"><h2>Timeline</h2><div class="timeline-list">${items}</div>${timelineOverflow}</section>`;
}

function renderProvenanceBody(state: TutorState, options: BuildEvidenceTimelineOptions = { includeEvents: false }): string {
  const timeline = buildEvidenceTimeline(state, options);
  const flowLegend = '<div class="provenance-flow-legend"><span>commit</span><span>→</span><span>file</span><span>→</span><span>concept</span><span>→</span><span>question</span><span>→</span><span>card</span></div>';
  const courseFilter = renderMapCourseFilter(state, options.courseId);
  return `${courseFilter}<section class="panel provenance-panel"><div class="section-head"><div><p class="eyebrow">Provenance lane</p><h2>Evidence timeline</h2><p>Follow the left-to-right chain from git commits through changed files, extracted concepts, generated questions, and review cards.</p></div><a class="ghost" href="/timeline">Full timeline</a></div>${flowLegend}${renderGraphMap(timeline.nodes, timeline.edges, 'provenance', false)}</section>${renderTimelineBody(state, MAP_DISPLAY_LIMITS.timelinePageSize, 0, options)}${graphMapHoverScript()}`;
}

function renderProgressBody(state: TutorState): string {
  const graph = buildProgressGraph(state);
  const groups = graph.nodes.filter((node) => node.kind === 'group').map((group) => {
    const children = graph.edges.filter((edge) => edge.type === 'group' && edge.from === group.id).map((edge) => graph.nodes.find((node) => node.id === edge.to)).filter(Boolean);
    const rows = children.map((child) => `<li>${escapeHtml(child!.label)} — ${Math.round(child!.mastery * 100)}% mastery, ${escapeHtml(child!.status.replace(/_/g, ' '))}</li>`).join('');
    return `<section class="panel"><h2>${escapeHtml(group.label)}</h2>${rows ? `<ul>${rows}</ul>` : '<p>No concepts in this group yet.</p>'}</section>`;
  }).join('');
  const stats = `<div class="stats"><div>${graph.summary.new}<span>new</span></div><div>${graph.summary.learning}<span>learning</span></div><div>${graph.summary.confident}<span>confident</span></div><div>${graph.summary.needs_review}<span>needs review</span></div></div>`;
  return `${stats}${renderProgressGuide(state)}${renderSkillMapHeatmap(state)}${groups}<details class="panel"><summary>Show raw CLI progress</summary><pre>${escapeHtml(renderProgress(state))}</pre></details>`;
}

function graphMapHoverScript(): string {
  return `<script>(function(){var svg=document.querySelector('.graph-map');if(!svg)return;var nodes=[...svg.querySelectorAll('.graph-map-node')];var edges=[...svg.querySelectorAll('.graph-edge')];function reset(){nodes.forEach(function(node){node.classList.remove('is-dimmed','is-focused');});edges.forEach(function(edge){edge.style.opacity='';});}function focusNode(node){var id=node.dataset.graphNodeId;var related=new Set([id]);edges.forEach(function(edge){if(edge.dataset.edgeFrom===id)related.add(edge.dataset.edgeTo);if(edge.dataset.edgeTo===id)related.add(edge.dataset.edgeFrom);});nodes.forEach(function(item){item.classList.toggle('is-focused',item===node);item.classList.toggle('is-dimmed',item!==node&&!related.has(item.dataset.graphNodeId));});edges.forEach(function(edge){var active=edge.dataset.edgeFrom===id||edge.dataset.edgeTo===id;edge.style.opacity=active?'1':'0.15';});}nodes.forEach(function(node){node.addEventListener('mouseenter',function(){focusNode(node);});node.addEventListener('mouseleave',reset);});})();</script>`;
}

function auditPageScript(): string {
  return `<script>document.addEventListener('click',function(event){var card=event.target.closest('[data-action="audit-open"]');if(card){var key=card.dataset.auditKey;var title=card.dataset.auditTitle;var source=document.getElementById('audit-list-'+key);var modal=document.getElementById('audit-modal');if(modal&&source){modal.querySelector('.modal-title').textContent=title||'Audit details';modal.querySelector('.modal-body').innerHTML=source.innerHTML;modal.classList.remove('is-hidden');}return;}if(event.target.id==='audit-modal'||event.target.closest('[data-action="audit-close"]')){document.getElementById('audit-modal')?.classList.add('is-hidden');}});</script>`;
}

function renderAuditListItems(items: string[]): string {
  if (items.length === 0) return '<p class="setup-note">No matching items yet.</p>';
  return `<ul class="audit-list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function renderWorkbenchHtml(state: TutorState): string {
  const workbench = buildWorkbenchSummary(state);
  const metricCards = `<div class="stats workbench-stats"><div>${workbench.metrics.activeCards}<span>active cards</span></div><div>${workbench.metrics.dueDelayedProbes}<span>due probes</span></div><div>${workbench.metrics.weakConcepts}<span>weak concepts</span></div><div>${workbench.metrics.studyPending}<span>study pending</span></div></div>`;
  const chips = workbench.filters.map((filter) => `<button data-action="workbench-filter" data-filter-type="${filter.id}" aria-pressed="false">${escapeHtml(filter.label)} · ${filter.count}</button>`).join('');
  const nodes = workbench.nodes.slice(0, MAP_DISPLAY_LIMITS.workbenchMaxNodes).map((node) => `<button class="visual-node node-${escapeHtml(node.type)}" data-action="workbench-node" data-node-type="${escapeHtml(node.type)}" data-node-tags="${escapeHtml(node.tags.join(' '))}" data-node-id="${escapeHtml(node.id)}" data-node-label="${escapeHtml(node.label)}" data-node-status="${escapeHtml(node.status ?? 'ready')}" data-node-detail="${escapeHtml(node.detail)}" data-node-href="${escapeHtml(node.href ?? '')}"${node.path ? ` data-node-path="${escapeHtml(node.path)}"` : ''}${node.masteryPercent !== undefined ? ` data-node-mastery="${node.masteryPercent}"` : ''}${node.confidencePercent !== undefined ? ` data-node-confidence="${node.confidencePercent}"` : ''}><span>${escapeHtml(node.type)}</span><strong>${escapeHtml(node.label)}</strong><small>${escapeHtml(node.status ?? '')}</small></button>`).join('');
  const workbenchOverflow = workbench.nodes.length > MAP_DISPLAY_LIMITS.workbenchMaxNodes
    ? `<p class="setup-note">Showing ${MAP_DISPLAY_LIMITS.workbenchMaxNodes} of ${workbench.nodes.length} workbench nodes (due, weak, and recent items first). <a class="ghost" href="/api/workbench">Open workbench JSON</a></p>`
    : '';
  const drawer = '<aside class="workbench-drawer" id="workbench-detail" aria-live="polite"><p class="eyebrow">Node detail</p><h2>Select a node</h2><p class="drawer-detail">Click any Workbench node to inspect why it matters and where to go next.</p><p class="drawer-meta is-hidden" id="workbench-detail-status"></p><code class="drawer-path is-hidden" id="workbench-detail-path"></code><p class="drawer-mastery is-hidden" id="workbench-detail-mastery"></p><a class="btn-primary is-hidden" id="workbench-detail-cta" href="#">Open related page</a><a class="ghost is-hidden" id="workbench-detail-link" href="#">Open related page</a></aside>';
  const body = `<section class="workbench-layout"><div class="workbench-main"><section class="hero workbench-hero"><div><p class="eyebrow">Command center</p><h1>${escapeHtml(workbenchGreeting())} — Learning Workbench</h1><p>One navigable surface for active cards, due probes, weak concepts, study controls, and evidence links.</p><div class="actions"><a class="btn-primary" href="${workbench.nextAction.href}">${escapeHtml(workbench.nextAction.label)}</a></div><p class="setup-note">${escapeHtml(workbench.nextAction.reason)}</p></div></section>${metricCards}<section class="panel filter-panel"><div class="section-head"><div><p class="eyebrow">Interactive map</p><h2>Filter the learning graph</h2><p>Semantic filters for due probes, weak concepts, study controls, and evidence links.</p></div><a class="ghost" href="/api/workbench">Open workbench JSON</a></div><div class="actions"><button data-action="workbench-filter" data-filter-type="all" aria-pressed="true">All</button>${chips}</div><div class="workbench-map">${nodes || '<p>No workbench nodes yet. Ingest evidence and generate cards first.</p>'}</div>${workbenchOverflow}</section></div>${drawer}</section>${workbenchPageScript()}`;
  return pageShell('MergeLearn Tutor Workbench', body, 'Workbench', shellOpts(state, 'workbench'));
}

function workbenchPageScript(): string {
  return `<script>document.addEventListener('click',function(event){var button=event.target.closest('button[data-action="workbench-filter"],button[data-action="workbench-node"]');if(!button)return;if(button.dataset.action==='workbench-filter'){var type=button.dataset.filterType||'all';document.querySelectorAll('[data-action="workbench-node"]').forEach(function(node){var tags=(node.dataset.nodeTags||'').split(/\\s+/).filter(Boolean);var hidden=type!=='all'&&!tags.includes(type);node.classList.toggle('is-filtered-out',hidden);node.classList.toggle('is-dimmed',hidden);});document.querySelectorAll('[data-action="workbench-filter"]').forEach(function(chip){chip.setAttribute('aria-pressed',String(chip===button));});var detail=document.getElementById('workbench-detail');if(detail){detail.querySelector('h2').textContent=type==='all'?'All workbench nodes':'Focused on '+type;var detailCopy=detail.querySelector('.drawer-detail');if(detailCopy)detailCopy.textContent=type==='all'?'Showing all local learning nodes.':'Showing nodes tagged '+type+'.';['workbench-detail-path','workbench-detail-mastery','workbench-detail-cta','workbench-detail-link','workbench-detail-status'].forEach(function(id){var el=document.getElementById(id);if(el)el.classList.add('is-hidden');});}}if(button.dataset.action==='workbench-node'){document.querySelectorAll('[data-action="workbench-node"]').forEach(function(node){node.classList.toggle('is-focused',node===button);node.classList.toggle('is-dimmed',node!==button&&!node.classList.contains('is-filtered-out'));});var detail=document.getElementById('workbench-detail');var link=document.getElementById('workbench-detail-link');var cta=document.getElementById('workbench-detail-cta');var status=document.getElementById('workbench-detail-status');var pathEl=document.getElementById('workbench-detail-path');var masteryEl=document.getElementById('workbench-detail-mastery');if(detail){detail.querySelector('h2').textContent=button.dataset.nodeLabel||'Selected node';var detailCopy=detail.querySelector('.drawer-detail');if(detailCopy)detailCopy.textContent=button.dataset.nodeDetail||'';}if(status){status.textContent=button.dataset.nodeStatus||'';status.classList.toggle('is-hidden',!button.dataset.nodeStatus);}if(pathEl){var path=button.dataset.nodePath||'';pathEl.textContent=path;pathEl.classList.toggle('is-hidden',!path);}if(masteryEl){var mastery=button.dataset.nodeMastery;var confidence=button.dataset.nodeConfidence;var parts=[];if(mastery)parts.push('Mastery '+mastery+'%');if(confidence)parts.push('Confidence '+confidence+'%');masteryEl.textContent=parts.join(' · ');masteryEl.classList.toggle('is-hidden',parts.length===0);}var href=button.dataset.nodeHref||'';if(cta){cta.classList.toggle('is-hidden',!href);if(href){cta.setAttribute('href',href);cta.textContent=href.indexOf('/practice')===0?'Start practice':href.indexOf('/map')===0?'Open map':'Open related page';}}if(link){link.classList.add('is-hidden');if(href)link.setAttribute('href',href);}}});</script>`;
}

function renderSessionHtml(state: TutorState, preferences: UserPreferences): string {
  const active = activeLearningItems(state);
  const archived = state.learningItems.filter((item) => item.status === 'archived').length;
  const latestBatch = state.cardBatches.at(-1);
  const cards = active.slice(0, 8).map((item, index) => {
    const quality = qualityForCard(item);
    return `
    <article class="card recall-card" data-item="${escapeHtml(item.id)}">
      <div class="card-topline"><span>Card ${index + 1}</span>${item.courseId ? `<span>course ${escapeHtml(item.courseId)}</span>` : ''}${item.questionId ? '<span>accepted question</span>' : ''}<span>${escapeHtml(item.questionPlane.replace(/_/g, ' '))}</span><span>${escapeHtml(item.difficulty)}</span><span>quality ${escapeHtml(quality.verdict.replace('_', ' '))}</span><span class="card-state">not reviewed</span></div>
      <h2>${escapeHtml(item.title)}</h2>
      <p class="why">${escapeHtml(item.whyShown ?? 'Shown from recent repo evidence.')}</p>
      ${renderQualityPanel(quality)}
      <div class="snippet-head"><span>${escapeHtml(item.snippet.path)}</span><span>generation ${item.generation}</span></div>
      ${renderDiffSnippetHtml(item.snippet.code)}
      <section class="question-box"><p class="label">Active recall question</p><p>${escapeHtml(item.prompt)}</p></section>
      <textarea aria-label="Your answer" placeholder="First answer from memory. Then choose confidence, reveal the explanation, and self-grade."></textarea>
      <section class="confidence-panel" aria-label="Confidence before reveal">
        <p class="label">Before reveal: how confident are you?</p>
        <div class="confidence-options">
          <label><input type="radio" name="confidence-${escapeHtml(item.id)}" value="1" /> Guessing</label>
          <label><input type="radio" name="confidence-${escapeHtml(item.id)}" value="2" /> Low</label>
          <label><input type="radio" name="confidence-${escapeHtml(item.id)}" value="3" /> Medium</label>
          <label><input type="radio" name="confidence-${escapeHtml(item.id)}" value="4" /> High</label>
          <label><input type="radio" name="confidence-${escapeHtml(item.id)}" value="5" /> Certain</label>
        </div>
        <p class="setup-note">This local rating is recorded before explanation reveal so calibration can be measured later.</p>
      </section>
      <div class="actions primary-actions">
        <button data-action="reveal">Reveal explanation</button>
      </div>
      <section class="reveal-panel ${preferences.review.showExplanationsByDefault ? '' : 'is-hidden'}">
        <p class="label">Short answer</p>
        <p class="short-answer">${escapeHtml(item.explanationMarkdown)}</p>
        ${renderLearnMoreSection(item)}
        <p class="label">Expected focus</p>
        <ul>${item.expectedFocus.map((focus) => `<li>${escapeHtml(focus)}</li>`).join('')}</ul>
        <div class="actions grade-actions">
          <button data-action="answer-grade" data-correct="true">I knew it</button>
          <button data-action="feedback" data-event="marked_unsure">Partly</button>
          <button data-action="answer-grade" data-correct="false">Missed it</button>
          <button data-action="feedback" data-event="marked_bad_card">Bad card</button>
          <button data-action="feedback" data-event="marked_wrong_evidence">Wrong evidence</button>
        </div>
      </section>
    </article>`;
  }).join('\n');
  const hero = `<section class="hero"><div><p class="eyebrow">Local code learning queue</p><h1>Review your recent code as flashcards</h1><p>Generate focused snippets, answer from the diff, and keep your history local.</p></div><div class="hero-card"><strong>${active.length}</strong><span>active cards</span><strong>${archived}</strong><span>archived cards</span></div></section>`;
  const controls = `<section class="toolbar review-source-toolbar"><div><strong>Card queue</strong><p>${latestBatch ? `Latest batch ${escapeHtml(latestBatch.id)} · ${latestBatch.mode}` : 'No generated batch yet.'}</p><div class="progress-track"><span id="session-progress" style="width:0%"></span></div></div>${renderReviewSourceControls(state)}</section>`;
  return pageShell('MergeLearn Tutor Review', `${hero}${renderStartHerePanel(state)}${controls}<section class="review-grid">${cards || '<p>No cards yet. Follow Start here to ingest evidence and generate your first cards.</p>'}</section>`, 'Ready', shellOpts(state, 'practice'));
}

function renderPracticeHtml(state: TutorState, preferences: UserPreferences, options: { index?: number; reviewedInSession?: string[] } = {}): string {
  const { item, queue } = practiceItemAt(state, options);
  if (!item || queue.total === 0) {
    return pageShell('MergeLearn Tutor Practice', `<section class="hero"><div><p class="eyebrow">Focused Practice</p><h1>No active card yet</h1><p>Generate a card from local evidence, then come back for one-card retrieval practice.</p></div><div class="hero-card"><strong>0</strong><span>active cards</span><a class="ghost" href="/">Open legacy review</a></div></section>${nav()}${renderStartHerePanel(state)}`, 'Practice', shellOpts(state, 'practice'));
  }
  const quality = qualityForCard(item);
  const position = queue.index + 1;
  const progressPct = queue.total > 0 ? Math.round((position / queue.total) * 100) : 0;
  const reviewedQuery = queue.reviewedInSession.length > 0 ? `&reviewed=${encodeURIComponent(queue.reviewedInSession.join(','))}` : '';
  const prevLink = queue.index > 0 ? `<a class="ghost practice-nav-btn" href="/practice?index=${queue.index - 1}${reviewedQuery}">Previous</a>` : '<span class="practice-nav-btn is-disabled">Previous</span>';
  const nextLink = queue.index < queue.total - 1 ? `<a class="ghost practice-nav-btn" href="/practice?index=${queue.index + 1}${reviewedQuery}">Next</a>` : '<span class="practice-nav-btn is-disabled">Next</span>';
  const card = `<article class="card recall-card practice-card" data-item="${escapeHtml(item.id)}"><div class="card-topline"><span>Card ${position} of ${queue.total}</span><span title="${escapeHtml(item.id)}">${escapeHtml(item.id.slice(0, 12))}</span><span title="${escapeHtml(item.conceptId)}">${escapeHtml(item.conceptId)}</span>${item.courseId ? `<span>course ${escapeHtml(item.courseId)}</span>` : ''}${item.questionId ? '<span>accepted question</span>' : ''}<span>${escapeHtml(item.questionPlane.replace(/_/g, ' '))}</span><span>${escapeHtml(item.difficulty)}</span><span class="card-state">not reviewed</span></div><h2 class="practice-title">${escapeHtml(item.title)}</h2><p class="why">${escapeHtml(item.whyShown ?? 'Shown from recent repo evidence.')}</p><div class="snippet-head"><span>${escapeHtml(item.snippet.path)}</span><span>generation ${item.generation}</span></div>${renderDiffSnippetHtml(item.snippet.code)}<section class="question-box practice-question"><p class="label">Active recall question</p><p>${escapeHtml(item.prompt)}</p></section><textarea aria-label="Your answer" placeholder="Answer from memory before revealing the explanation."></textarea><section class="confidence-panel" aria-label="Confidence before reveal"><p class="label">Before reveal: how confident are you?</p><div class="confidence-options"><label><input type="radio" name="confidence-${escapeHtml(item.id)}" value="1" /> Guessing</label><label><input type="radio" name="confidence-${escapeHtml(item.id)}" value="2" /> Low</label><label><input type="radio" name="confidence-${escapeHtml(item.id)}" value="3" /> Medium</label><label><input type="radio" name="confidence-${escapeHtml(item.id)}" value="4" /> High</label><label><input type="radio" name="confidence-${escapeHtml(item.id)}" value="5" /> Certain</label></div></section><p class="setup-note" id="practice-outcome">Outcome will appear here after grading: calibration pairing, delayed probe scheduling, and weak-concept estimates update from this grade.</p><div class="actions primary-actions"><button data-action="reveal">Reveal explanation</button></div><section class="reveal-panel ${preferences.review.showExplanationsByDefault ? '' : 'is-hidden'}"><p class="label">Short answer</p><p class="short-answer">${escapeHtml(item.explanationMarkdown)}</p>${renderLearnMoreSection(item)}<p class="label">Expected focus</p><ul>${item.expectedFocus.map((focus) => `<li>${escapeHtml(focus)}</li>`).join('')}</ul><details class="practice-details"><summary>Evidence and quality details</summary>${renderQualityPanel(quality)}</details><div class="actions grade-actions"><button data-action="answer-grade" data-correct="true">I knew it <kbd class="shortcut-hint">Y</kbd></button><button data-action="feedback" data-event="marked_unsure">Partly</button><button data-action="answer-grade" data-correct="false">Missed it <kbd class="shortcut-hint">N</kbd></button><button data-action="feedback" data-event="marked_bad_card">Bad card</button><button data-action="feedback" data-event="marked_wrong_evidence">Wrong evidence</button></div></section></article>`;
  const focusBody = `<header class="practice-focus-header" aria-label="Focused Practice"><div class="practice-position"><span>${position} / ${queue.total}</span></div><div class="progress-track practice-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${queue.total}" aria-valuenow="${position}"><span id="session-progress" style="width:${progressPct}%"></span></div><span class="sr-only">Card ${position} of ${queue.total}</span></header><section class="review-grid practice-grid practice-focus">${card}</section><footer class="practice-queue-footer"><div class="practice-queue-nav">${prevLink}<strong class="practice-queue-position">${position} / ${queue.total}</strong>${nextLink}</div><p class="practice-shortcuts"><strong>Keyboard shortcuts</strong> · 1-5 confidence · Enter reveal · Y knew it · N missed it</p></footer>${practiceKeyboardScript()}`;
  return pageShell('MergeLearn Tutor Practice', focusBody, 'Practice', { ...shellOpts(state, 'practice'), focus: true, practiceIndex: queue.index, practiceTotal: queue.total, reviewedInSession: queue.reviewedInSession });
}

function practiceKeyboardScript(): string {
  return `<script>document.addEventListener('keydown',function(event){if(event.target&&['TEXTAREA','INPUT','SELECT'].includes(event.target.tagName))return;var card=document.querySelector('.practice-card');if(!card)return;if(/^[1-5]$/.test(event.key)){var input=card.querySelector('input[type=radio][value="'+event.key+'"]');if(input){input.checked=true;input.dispatchEvent(new Event('change',{bubbles:true}));}}if(event.key==='Enter'){card.querySelector('[data-action="reveal"]')?.click();}if(event.key.toLowerCase()==='y'){card.querySelector('[data-action="answer-grade"][data-correct="true"]')?.click();}if(event.key.toLowerCase()==='n'){card.querySelector('[data-action="answer-grade"][data-correct="false"]')?.click();}});</script>`;
}

function renderReviewSourceControls(state: TutorState): string {
  const courses = coursesSummary(state);
  const acceptedByCourse = new Map<string, number>();
  for (const entry of state.questionBank) {
    if (entry.status === 'accepted' && entry.courseId) acceptedByCourse.set(entry.courseId, (acceptedByCourse.get(entry.courseId) ?? 0) + 1);
  }
  const courseOptions = courses.map((course) => {
    const accepted = acceptedByCourse.get(course.id) ?? 0;
    const label = `${course.title} · ${accepted} accepted · ${course.activeCardCount} active`;
    return `<option value="${escapeHtml(course.id)}">${escapeHtml(label)}</option>`;
  }).join('');
  const selector = courses.length > 0
    ? `<label class="inline-field review-source-field">Review source <select id="review-course"><option value="">All due repo evidence</option>${courseOptions}</select></label><p class="setup-note">Choose a course to use its scoped evidence and accepted questions when generating cards. Leave all evidence selected for the broad daily queue.</p>`
    : '<p class="setup-note">Create a course and accept questions when you want generated cards to target a specific learning goal.</p>';
  return `<div class="review-source-controls"><div><strong>Generate from</strong>${selector}</div><div class="actions"><button data-action="generate-cards" data-mode="more">Generate 5 focused cards</button><button data-action="generate-cards" data-mode="regenerate">Regenerate from source</button><a class="ghost" href="/courses">Courses</a><a class="ghost" href="/questions">Questions</a><a class="ghost" href="/timeline">Timeline</a><a class="ghost" href="/graph">Graph</a><a class="ghost" href="/history">History</a></div></div>`;
}

function renderStartHerePanel(state: TutorState): string {
  const active = activeLearningItems(state).length;
  const acceptedQuestions = state.questionBank.filter((entry) => entry.status === 'accepted').length;
  const draftQuestions = state.questionBank.filter((entry) => entry.status === 'draft').length;
  const steps = [
    {
      label: 'Ingest repo evidence',
      done: state.artifacts.length > 0 && state.concepts.length > 0,
      detail: state.concepts.length > 0 ? `${state.concepts.length} concepts from ${state.artifacts.length} commits/docs` : 'Run init + ingest to build the local skill graph.',
      action: 'node dist/cli.js init --repo . && node dist/cli.js ingest --repo . --since 30d',
    },
    {
      label: 'Create a course goal',
      done: state.courses.length > 0,
      detail: state.courses.length > 0 ? `${state.courses.length} course${state.courses.length === 1 ? '' : 's'} ready` : 'Add the topic, code paths, and docs you want the tutor to emphasize.',
      action: 'Open Courses',
      href: '/courses',
    },
    {
      label: 'Draft and accept questions',
      done: acceptedQuestions > 0,
      detail: acceptedQuestions > 0 ? `${acceptedQuestions} accepted · ${draftQuestions} draft` : draftQuestions > 0 ? `${draftQuestions} drafts waiting for review` : 'Use fake/local drafting; no remote LLM calls are made.',
      action: 'Open Questions',
      href: '/questions',
    },
    {
      label: 'Generate and review cards',
      done: active > 0,
      detail: active > 0 ? `${active} active cards in today’s queue` : 'Generate cards once evidence, goals, or accepted questions exist.',
      action: 'Generate 5 more',
    },
  ];
  const items = steps.map((step, index) => `<li class="onboarding-step ${step.done ? 'is-done' : ''}"><span>${step.done ? '✓' : index + 1}</span><div><strong>${escapeHtml(step.label)}</strong><p>${escapeHtml(step.detail)}</p>${step.href ? `<a href="${step.href}">${escapeHtml(step.action)}</a>` : `<code>${escapeHtml(step.action)}</code>`}</div></li>`).join('');
  return `<section class="panel onboarding-panel"><div class="section-head"><div><p class="eyebrow">Start here</p><h2>From empty repo to useful review cards</h2><p>Follow this local-only path when you are setting up a repo for the first time, then come back here for daily recall.</p></div><div class="actions"><a class="ghost" href="/plan">Plan Builder</a><a class="ghost" href="/preferences">Tune questions</a></div></div><ol class="onboarding-steps">${items}</ol></section>`;
}

function renderPlanHtml(state: TutorState): string {
  const active = activeLearningItems(state).length;
  const acceptedQuestions = state.questionBank.filter((entry) => entry.status === 'accepted').length;
  const draftQuestions = state.questionBank.filter((entry) => entry.status === 'draft').length;
  const latestBatch = state.cardBatches.at(-1);
  const courses = coursesSummary(state);
  const primaryCourse = courses[0];
  const setupSteps = [
    {
      label: 'Repository setup',
      done: state.artifacts.length > 0 && state.concepts.length > 0,
      detail: state.repoPath ? `Target repo: ${state.repoPath}` : 'Point the tutor at a local git repository.',
      body: `<p class="setup-note">Run <code>node dist/cli.js init --repo . && node dist/cli.js ingest --repo . --since 30d</code> from the target repo, or inspect existing evidence on the timeline.</p><a class="ghost" href="/timeline">Inspect evidence</a>`,
    },
    {
      label: 'Select materials',
      done: courses.some((course) => course.materialPaths.length > 0 || course.docPaths.length > 0),
      detail: primaryCourse ? `Scoped paths: ${[...primaryCourse.materialPaths, ...primaryCourse.docPaths].join(', ') || 'defaults pending'}` : 'Choose folders and docs that should feed concept extraction.',
      body: `<p class="setup-note">Scope code and doc paths on the course form below or on the Courses page before drafting questions.</p><a class="ghost" href="/courses">Open course form</a>`,
    },
    {
      label: 'Generate questions',
      done: state.questionDraftBatches.length > 0 || acceptedQuestions > 0,
      detail: `${draftQuestions} draft · ${acceptedQuestions} accepted questions from local AST/fake drafting.`,
      body: `<p class="setup-note">Draft evidence-bound questions locally, then accept only prompts answerable from the repo.</p><a class="ghost" href="/questions">Open question bank</a>`,
    },
    {
      label: 'Configure mix',
      done: active > 0,
      detail: active > 0 ? `${active} active review cards ready for practice.` : 'Tune spaced-repetition mix and generate the first card batch.',
      body: `<p class="setup-note">Use presets for Deep Dive or Quick Daily Refresh, then generate cards from all due evidence or a selected course.</p><div class="mix-presets"><a class="ghost" href="/preferences">Deep Dive</a><a class="ghost" href="/preferences">Quick Daily Refresh</a><a class="ghost" href="/preferences">Tune question mix</a></div><a class="ghost" href="/practice">Start practice</a>`,
    },
  ];
  const setupCards = setupSteps.map((step, index) => `<li class="setup-step ${step.done ? 'is-done' : ''}"><span>${step.done ? '✓' : index + 1}</span><div><strong>${escapeHtml(step.label)}</strong><p>${escapeHtml(step.detail)}</p>${step.body}</div></li>`).join('');
  const steps = [
    {
      label: 'Local evidence source',
      done: state.artifacts.length > 0 && state.concepts.length > 0,
      detail: state.concepts.length > 0 ? `${state.concepts.length} concepts from ${state.artifacts.length} local artifacts.` : 'Ingest recent commits/docs so every later card has local provenance.',
      href: '/timeline',
      action: 'Inspect evidence',
    },
    {
      label: 'Course goal',
      done: courses.length > 0,
      detail: courses.length > 0 ? `${courses.length} course${courses.length === 1 ? '' : 's'} define the learning contract.` : 'Create one focused course before drafting goal-specific prompts.',
      href: '/courses',
      action: 'Build course',
    },
    {
      label: 'Accepted questions',
      done: acceptedQuestions > 0,
      detail: acceptedQuestions > 0 ? `${acceptedQuestions} accepted · ${draftQuestions} draft prompts ready for review.` : draftQuestions > 0 ? `${draftQuestions} drafts need accept/reject decisions.` : 'Draft locally and accept only questions that are answerable from evidence.',
      href: '/questions',
      action: 'Review questions',
    },
    {
      label: 'Review cards',
      done: active > 0,
      detail: active > 0 ? `${active} active cards in the queue${latestBatch ? ` from ${latestBatch.mode} batch ${latestBatch.id}` : ''}.` : 'Generate cards from all due evidence or a selected course.',
      href: '/',
      action: 'Open review',
    },
  ];
  const stepCards = steps.map((step, index) => `<li class="plan-step ${step.done ? 'is-done' : ''}"><span>${step.done ? '✓' : index + 1}</span><div><strong>${escapeHtml(step.label)}</strong><p>${escapeHtml(step.detail)}</p><a href="${step.href}">${escapeHtml(step.action)}</a></div></li>`).join('');
  const courseCards = courses.map((course) => `<article class="mini-card"><div class="card-topline"><span>${escapeHtml(course.id)}</span><span>${course.questionCount} questions</span><span>${course.activeCardCount} active</span></div><h3>${escapeHtml(course.title)}</h3><p>${escapeHtml(course.goal)}</p><small>${escapeHtml([...course.materialPaths, ...course.docPaths].join(', '))}</small></article>`).join('');
  return pageShell('MergeLearn Tutor Plan Builder', `<section class="hero"><div><p class="eyebrow">Learning plan</p><h1>Plan Builder connects setup to daily review</h1><p>Use this page as the single path from local evidence, to courses, to accepted questions, to review cards.</p></div><div class="hero-card"><strong>${courses.length}</strong><span>courses</span><strong>${acceptedQuestions}</strong><span>accepted questions</span></div></section>${nav()}<section class="panel plan-builder-panel setup-wizard"><div class="section-head"><div><p class="eyebrow">Setup wizard</p><h2>Learning plan wizard</h2><p>Follow these four steps in order to define your learning goal, scope evidence, draft and accept questions, then configure the review mix.</p></div><a class="ghost" href="/practice">Skip to practice</a></div><ol class="setup-steps">${setupCards}</ol></section><section class="panel plan-builder-panel"><div class="section-head"><div><p class="eyebrow">Progress tracker</p><h2>From empty repo to first focused practice</h2><p>Track completion across evidence, courses, accepted questions, and review cards.</p></div></div><ol class="plan-path">${stepCards}</ol><div class="actions"><a class="ghost" href="/preferences">Tune question mix</a><a class="ghost" href="/timeline">Inspect evidence</a><a class="ghost" href="/questions">Review questions</a></div></section><section class="panel"><div class="section-head"><div><p class="eyebrow">Quick course creator</p><h2>Create a course without leaving the plan</h2><p>If you do not have a course yet, create one here. The course is the contract between repo evidence and the review cards you will practice from.</p></div><a class="ghost" href="/courses">Full course form</a></div><div class="form-grid"><input id="course-id" placeholder="optional id, e.g. learn-typescript" /><input id="course-title" placeholder="title, e.g. Understand session auth" /><textarea id="course-goal" placeholder="goal: explain how login state moves from API route to UI and tests"></textarea><input id="course-materials" placeholder="materials: src/**,tests/**" /><input id="course-docs" placeholder="docs: README.md,docs/**" /><button data-action="save-course">Save course</button></div><p class="setup-note">Tip: leave the id blank to auto-generate one. Materials and docs use comma-separated paths; defaults are src/**, tests/**, README.md, and docs/**.</p></section><section class="panel"><div class="section-head"><div><p class="eyebrow">Local-only guardrails</p><h2>What this plan will and will not do</h2><p>The browser plan organizes already-local evidence. It does not enable remote LLM calls, publish data, or run target repo code.</p></div><a class="ghost" href="/graph">Trace graph</a></div><div class="mini-grid"><article class="mini-card"><strong>${state.concepts.length}</strong><p>Local concepts</p><small>Extracted from commits, docs, paths, and snippets.</small></article><article class="mini-card"><strong>${state.questionDraftBatches.length}</strong><p>Question draft batches</p><small>Fake/local drafts show network not used in their metadata.</small></article><article class="mini-card"><strong>${state.cardBatches.length}</strong><p>Card batches</p><small>Regenerated queues archive old cards instead of deleting history.</small></article><article class="mini-card"><strong>${state.learningEvents.length}</strong><p>Review events</p><small>Answers update mastery; quality feedback stays audited separately.</small></article></div></section><section class="panel"><div class="section-head"><div><h2>Course snapshot</h2><p>Courses are the bridge between repo evidence and the questions/cards you practice from.</p></div><a class="ghost" href="/courses">Manage courses</a></div><div class="mini-grid">${courseCards || '<p>No courses yet. Use the quick creator above to add your first learning plan.</p>'}</div></section>`, 'Plan Builder', shellOpts(state, 'setup'));
}

function renderCoursesHtml(state: TutorState): string {
  const courses = coursesSummary(state);
  const cards = courses.map((course) => `<article class="mini-card course-card"><div class="card-topline"><span>${course.id}</span><span>${course.enabledPlanes.length} planes</span></div><h3>${escapeHtml(course.title)}</h3><p>${escapeHtml(course.goal)}</p><p><strong>Materials</strong>: ${escapeHtml(course.materialPaths.join(', '))}</p><p><strong>Docs</strong>: ${escapeHtml(course.docPaths.join(', '))}</p><p>${course.questionCount} questions · ${course.activeCardCount} active cards</p><a class="ghost" href="/questions">Question bank</a><a class="ghost" href="/timeline">Evidence timeline</a></article>`).join('');
  return pageShell('MergeLearn Tutor Courses', `<section class="hero"><div><p class="eyebrow">Learning tracks</p><h1>Courses organize goals and material</h1><p>Each course defines what you are trying to learn, which repo paths/docs count as material, and which question categories should be prioritized.</p></div><div class="hero-card"><strong>${courses.length}</strong><span>courses</span><strong>${state.questionBank.filter((entry) => entry.status === 'accepted').length}</strong><span>accepted questions</span></div></section>${nav()}${renderCourseSetupGuide(state)}<section class="panel"><div class="section-head"><div><h2>Create or update a course</h2><p>Start broad, then narrow the paths after you see the first drafted questions.</p></div><a class="ghost" href="/preferences">Tune question mix</a></div><div class="form-grid"><input id="course-id" placeholder="optional id, e.g. learn-typescript" /><input id="course-title" placeholder="title, e.g. Understand session auth" /><textarea id="course-goal" placeholder="goal: explain how login state moves from API route to UI and tests"></textarea><input id="course-materials" placeholder="materials: src/**,tests/**" /><input id="course-docs" placeholder="docs: README.md,docs/**" /><button data-action="save-course">Save course</button></div><p class="setup-note">Tip: leave the id blank to auto-generate one. Materials and docs use comma-separated paths; defaults are src/**, tests/**, README.md, and docs/**.</p></section><section class="panel"><h2>Course tracks</h2><div class="mini-grid">${cards || '<p>No courses yet. Use the guided form above or CLI to create one.</p>'}</div></section>`, 'Courses', shellOpts(state, 'setup'));
}

function renderCourseSetupGuide(state: TutorState): string {
  const courses = coursesSummary(state);
  const accepted = state.questionBank.filter((entry) => entry.status === 'accepted').length;
  const drafts = state.questionBank.filter((entry) => entry.status === 'draft').length;
  const active = activeLearningItems(state).length;
  const steps = [
    {
      label: 'Pick a learning outcome',
      done: courses.length > 0,
      detail: courses.length > 0 ? `${courses.length} course${courses.length === 1 ? '' : 's'} define the learning target.` : 'Name the skill you want from this repo, not just the folder name.',
    },
    {
      label: 'Scope evidence paths',
      done: courses.some((course) => course.materialPaths.length > 0 || course.docPaths.length > 0),
      detail: state.concepts.length > 0 ? `${state.concepts.length} extracted concepts can be filtered by material/doc paths.` : 'Ingest recent commits first if the concept count is still zero.',
    },
    {
      label: 'Draft course questions',
      done: drafts + accepted > 0,
      detail: drafts + accepted > 0 ? `${drafts} draft · ${accepted} accepted questions are linked to courses.` : 'Open Questions and draft fake/local questions for this course.',
      href: '/questions',
      action: 'Draft questions',
    },
    {
      label: 'Generate review cards',
      done: active > 0,
      detail: active > 0 ? `${active} active cards are ready for recall.` : 'Accepted questions can become course-specific review cards.',
      href: '/',
      action: 'Review queue',
    },
  ];
  const items = steps.map((step, index) => `<li class="onboarding-step ${step.done ? 'is-done' : ''}"><span>${step.done ? '✓' : index + 1}</span><div><strong>${escapeHtml(step.label)}</strong><p>${escapeHtml(step.detail)}</p>${step.href ? `<a href="${step.href}">${escapeHtml(step.action)}</a>` : ''}</div></li>`).join('');
  return `<section class="panel onboarding-panel"><div class="section-head"><div><p class="eyebrow">Course setup guide</p><h2>Turn repo evidence into a focused track</h2><p>Use this page when “what should I study?” is still fuzzy. The course is the contract between repo paths, docs, question drafting, and review cards.</p></div><a class="ghost" href="/timeline">Inspect evidence</a></div><ol class="onboarding-steps">${items}</ol></section>`;
}

function renderQuestionsHtml(state: TutorState): string {
  const data = questionBankData(state);
  const courses = coursesSummary(state);
  const batches = data.batches.map((batch) => `<article class="mini-card"><strong>${escapeHtml(batch.provider)}</strong><p>${escapeHtml(batch.id)} · ${batch.entryIds.length} drafts · network ${batch.networkUsed ? 'used' : 'not used'}</p><small>${escapeHtml(batch.createdAt)}</small></article>`).join('');
  const questions = data.questions.map((entry) => {
    const quality = questionQuality(entry);
    return `<article class="mini-card question-card"><div class="card-topline"><span>${escapeHtml(entry.status)}</span><span>${escapeHtml(entry.author.provider)}</span><span>${escapeHtml(entry.questionPlane.replace(/_/g, ' '))}</span><span>quality ${escapeHtml(quality.verdict.replace('_', ' '))}</span></div><h3>${escapeHtml(entry.prompt)}</h3><p>course ${escapeHtml(entry.courseId ?? 'none')} · concept ${escapeHtml(entry.conceptId)}</p>${renderQualityPanel(quality)}<details><summary>Expected answer</summary><p>${escapeHtml(entry.expectedAnswer)}</p></details><details><summary>${entry.evidence.length} evidence paths</summary><ul>${entry.evidence.map((item) => `<li>${escapeHtml(item.path)}${item.commit ? ` · ${escapeHtml(item.commit.slice(0, 8))}` : ''}</li>`).join('')}</ul></details>${entry.status === 'draft' ? `<button data-action="question-status" data-question="${escapeHtml(entry.id)}" data-status="accepted">Accept</button><button data-action="question-status" data-question="${escapeHtml(entry.id)}" data-status="rejected">Reject</button>` : ''}</article>`;
  }).join('');
  const metrics = `<div class="stats"><div>${data.summary.draft}<span>draft</span></div><div>${data.summary.accepted}<span>accepted</span></div><div>${data.summary.rejected}<span>rejected</span></div><div>${data.summary.networkUsed ? 'yes' : 'no'}<span>network used</span></div></div>`;
  const courseOptions = courses.map((course) => `<option value="${escapeHtml(course.id)}">${escapeHtml(course.title)} · ${course.questionCount} questions</option>`).join('');
  const courseSelector = courses.length > 0 ? `<label class="inline-field">Target course <select id="question-course"><option value="">First course / all matching evidence</option>${courseOptions}</select></label>` : '<p class="setup-note">No courses yet. Drafting still works from all repo concepts, but creating a course first makes questions goal-specific.</p>';
  return pageShell('MergeLearn Tutor Questions', `<section class="hero"><div><p class="eyebrow">Question bank</p><h1>Evidence-bound LLM-style questions</h1><p>Drafts can be generated by fake/local providers, then accepted into the question bank before cards use them. Remote LLM is still gated.</p></div></section>${nav()}${metrics}${renderQuestionWorkflowGuide(state)}<section class="toolbar"><div><strong>Draft questions</strong><p>Choose a course, draft locally, accept the useful questions, then generate review cards.</p>${courseSelector}</div><button data-action="draft-questions">Draft 5 fake/local questions</button></section><section class="panel"><h2>Draft batches</h2><div class="mini-grid">${batches || '<p>No draft batches yet. Draft questions from a course to create the first batch.</p>'}</div></section><section class="panel"><h2>Questions</h2><div class="mini-grid">${questions || '<p>No questions yet. Draft a local batch, then accept the questions you want cards to use.</p>'}</div></section>`, 'Questions', shellOpts(state, 'audit'));
}

function renderQuestionWorkflowGuide(state: TutorState): string {
  const drafts = state.questionBank.filter((entry) => entry.status === 'draft').length;
  const accepted = state.questionBank.filter((entry) => entry.status === 'accepted').length;
  const rejected = state.questionBank.filter((entry) => entry.status === 'rejected').length;
  const courseLinked = state.questionBank.filter((entry) => entry.courseId).length;
  const steps = [
    {
      label: 'Select a course',
      done: state.courses.length > 0,
      detail: state.courses.length > 0 ? `${state.courses.length} course${state.courses.length === 1 ? '' : 's'} available for targeted drafting.` : 'Create a course first if you want goal-specific questions.',
      href: '/courses',
      action: 'Open Courses',
    },
    {
      label: 'Draft locally',
      done: state.questionDraftBatches.length > 0,
      detail: state.questionDraftBatches.length > 0 ? `${state.questionDraftBatches.length} draft batch${state.questionDraftBatches.length === 1 ? '' : 'es'} created; network remains off.` : 'The fake/local provider creates evidence-bound drafts without remote calls.',
    },
    {
      label: 'Accept only useful prompts',
      done: accepted > 0,
      detail: `${accepted} accepted · ${drafts} still draft · ${rejected} rejected. Accepted prompts feed course cards.`,
    },
    {
      label: 'Keep questions connected',
      done: courseLinked > 0,
      detail: courseLinked > 0 ? `${courseLinked} questions are linked to course goals.` : 'Course-linked questions make the Timeline and Graph easier to explain.',
      href: '/graph',
      action: 'View graph',
    },
  ];
  const items = steps.map((step, index) => `<li class="onboarding-step ${step.done ? 'is-done' : ''}"><span>${step.done ? '✓' : index + 1}</span><div><strong>${escapeHtml(step.label)}</strong><p>${escapeHtml(step.detail)}</p>${step.href ? `<a href="${step.href}">${escapeHtml(step.action)}</a>` : ''}</div></li>`).join('');
  return `<section class="panel onboarding-panel"><div class="section-head"><div><p class="eyebrow">Question workflow</p><h2>Draft, accept, then review</h2><p>The bank is intentionally a staging area: drafts are cheap, accepted questions are the stable source for course cards.</p></div><a class="ghost" href="/api/questions">Open question JSON</a></div><ol class="onboarding-steps">${items}</ol></section>`;
}

function renderTimelineHtml(state: TutorState, pageSize: number = MAP_DISPLAY_LIMITS.timelinePageSize, offset = 0): string {
  const body = `<section class="hero"><div><p class="eyebrow">Evidence timeline</p><h1>GitLens-style learning provenance</h1><p>See the commits, files, docs, questions, cards, and answer events that explain why each study item exists.</p></div></section>${nav()}${renderTimelineBody(state, pageSize, offset)}`;
  return pageShell('MergeLearn Tutor Evidence Timeline', body, 'Timeline', shellOpts(state, 'map'));
}

function renderTimelineFilterPanel(summary: Record<string, number>): string {
  const preferredTypes = ['commit', 'file', 'doc', 'concept', 'course', 'question', 'batch', 'card', 'event'];
  const chips = preferredTypes.filter((type) => (summary[type] ?? 0) > 0).map((type) => `<button data-action="timeline-filter" data-filter-type="${type}">${escapeHtml(type)} · ${summary[type]}</button>`).join('');
  return `<section class="panel filter-panel"><div class="section-head"><div><p class="eyebrow">Provenance filters</p><h2>Scan one evidence type at a time</h2><p>Timeline can get noisy after several card generations. Use these local filters to focus on docs, accepted questions, cards, or review events without leaving the page.</p></div><a class="ghost" href="/api/evidence-timeline">Open timeline JSON</a></div><div class="actions"><button data-action="timeline-filter" data-filter-type="all">All types</button>${chips}</div><p class="setup-note" id="timeline-filter-note">Showing all timeline nodes.</p></section>`;
}

function renderMapHtml(state: TutorState, url: URL): string {
  const validModes = ['local-graph', 'provenance', 'skill-map'];
  const activeMode = validModes.includes(url.searchParams.get('mode') ?? '') ? url.searchParams.get('mode')! : 'local-graph';
  const mapOptions = mapTimelineOptions(state, url);
  let body = '';
  if (activeMode === 'provenance') body = renderProvenanceBody(state, mapOptions);
  else if (activeMode === 'skill-map') body = renderProgressBody(state);
  else body = renderGraphBody(state, mapOptions);
  const activeCards = state.learningItems.filter((item) => item.status !== 'archived').length;
  const courseNote = mapOptions.courseId ? ` · course ${escapeHtml(mapOptions.courseId)}` : '';
  const intro = renderPageIntro('Unified Map', 'One surface for relationships, provenance, and mastery', `Switch modes to answer three questions: what is related, where did this come from, and what is weak or due.${courseNote}`, `<div class="page-intro-stats"><span>${state.concepts.length} concepts</span><span>${activeCards} active cards</span></div>`);
  return pageShell('MergeLearn Tutor Map', `${intro}${body}`, 'Map', { ...shellOpts(state, 'map'), mapModeBar: renderMapModeBar(activeMode, mapOptions.courseId) });
}

function renderGraphHtml(state: TutorState): string {
  const timeline = buildEvidenceTimeline(state);
  const body = `<section class="hero"><div><p class="eyebrow">Learning graph</p><h1>Courses, docs, questions, cards</h1><p>This is now a visual relationship map backed by /api/evidence-graph. It shows the product chain from evidence to courses, concepts, questions, cards, and review events.</p></div><div class="hero-card"><strong>${timeline.nodes.length}</strong><span>nodes</span><strong>${timeline.edges.length}</strong><span>edges</span></div></section>${nav()}${renderGraphBody(state)}`;
  return pageShell('MergeLearn Tutor Graph', body, 'Graph', shellOpts(state, 'map'));
}

function renderGraphFocusPanel(groups: Array<{ type: string; nodes: EvidenceTimelineNode[] }>, edgeCount: number): string {
  const chips = groups.map((group) => `<button data-action="graph-filter" data-filter-type="${escapeHtml(group.type)}">${escapeHtml(group.type)} · ${group.nodes.length}</button>`).join('');
  const hiddenNodes = groups.reduce((count, group) => count + Math.max(0, group.nodes.length - MAP_DISPLAY_LIMITS.graphColumnNodes), 0);
  return `<section class="panel filter-panel"><div class="section-head"><div><p class="eyebrow">Graph focus</p><h2>Drill into one lane before reading raw JSON</h2><p>The map shows up to ${MAP_DISPLAY_LIMITS.graphNodesPerLane} nodes per lane (most relevant first) and ${MAP_DISPLAY_LIMITS.graphMaxEdges} of ${edgeCount} relationships. Focus a lane below to inspect courses, concepts, questions, cards, or events as the graph grows.</p></div><a class="ghost" href="/timeline">Open timeline</a></div><div class="actions"><button data-action="graph-filter" data-filter-type="all">All lanes</button>${chips}</div><p class="setup-note" id="graph-filter-note">Showing all graph lanes${hiddenNodes > 0 ? `; ${hiddenNodes} additional nodes are summarized in lane rollups or raw JSON.` : '.'}</p></section>`;
}

function renderGraphMap(nodes: EvidenceTimelineNode[], edges: EvidenceTimelineEdge[], mode: GraphMapMode = 'local-graph', includeEvents = true): string {
  const display = selectGraphMapDisplay(nodes, edges, { mode });
  const laneSpecs = includeEvents ? GRAPH_MAP_LANES : GRAPH_MAP_LANES.filter((lane) => lane.id !== 'event');
  const lanes = laneSpecs.map((lane) => ({ ...lane, nodes: display.nodes.filter((node) => lane.types.includes(node.type)) }));
  const maxRows = Math.max(2, ...lanes.map((lane) => lane.nodes.length));
  const width = 1080;
  const laneWidth = width / lanes.length;
  const top = 72;
  const rowHeight = 86;
  const height = top + maxRows * rowHeight + 46;
  const positions = new Map<string, { x: number; y: number }>();
  const laneRects = lanes.map((lane, laneIndex) => {
    const x = laneIndex * laneWidth + 10;
    return `<g><rect x="${x}" y="16" width="${laneWidth - 20}" height="${height - 32}" rx="20" class="graph-lane-bg"/><text x="${x + 16}" y="46" class="graph-lane-title">${escapeHtml(lane.label)}</text></g>`;
  }).join('');
  const labelWidth = Math.max(80, laneWidth - 68);
  const nodeRects = lanes.flatMap((lane, laneIndex) => lane.nodes.map((node, rowIndex) => {
    const x = laneIndex * laneWidth + 22;
    const y = top + rowIndex * rowHeight;
    positions.set(node.id, { x: x + 68, y: y + 30 });
    const rollupClass = isRollupNode(node) ? ' graph-map-node-rollup' : '';
    return `<g class="graph-map-node${rollupClass}" data-graph-node-id="${escapeHtml(node.id)}"><title>${escapeHtml(node.label)}${node.path ? ` · ${escapeHtml(node.path)}` : ''}</title><rect x="${x}" y="${y}" width="${laneWidth - 44}" height="62" rx="14"/><text x="${x + 12}" y="${y + 24}" class="graph-node-type">${escapeHtml(node.type)}</text><foreignObject x="${x + 10}" y="${y + 28}" width="${labelWidth}" height="34"><div xmlns="http://www.w3.org/1999/xhtml" class="graph-node-label-wrap">${escapeHtml(node.label)}</div></foreignObject></g>`;
  })).join('');
  const edgeLines = display.edges.filter((edge) => positions.has(edge.from) && positions.has(edge.to)).map((edge) => {
    const from = positions.get(edge.from)!;
    const to = positions.get(edge.to)!;
    return `<path class="graph-edge" data-edge-from="${escapeHtml(edge.from)}" data-edge-to="${escapeHtml(edge.to)}" d="M ${from.x} ${from.y} C ${(from.x + to.x) / 2} ${from.y}, ${(from.x + to.x) / 2} ${to.y}, ${to.x} ${to.y}"><title>${escapeHtml(edge.type)}</title></path>`;
  }).join('');
  const overflowNote = display.overflowByLane.length > 0
    ? `<p class="setup-note graph-overflow-note">Map shows ${display.nodes.length} of ${display.totalNodes} nodes across lanes (${display.edges.length} of ${display.totalEdges} edges). Rollup tiles summarize hidden ${display.overflowByLane.map((lane) => `${lane.hidden} ${lane.laneLabel.toLowerCase()}`).join(', ')}.</p>`
    : `<p class="setup-note graph-overflow-note">Map shows ${display.nodes.length} nodes and ${display.edges.length} of ${display.totalEdges} prioritized edges.</p>`;
  const legend = includeEvents
    ? '<div class="graph-legend"><span>commit/doc/file → concept</span><span>course → question</span><span>question → card</span><span>card → review event</span></div>'
    : '<div class="graph-legend"><span>commit/doc/file → concept</span><span>course → question</span><span>question → card</span></div>';
  return `<section class="panel graph-map-panel"><div class="section-head"><div><h2>Evidence graph map</h2><p>Follow the chain from repository evidence to concepts, accepted questions, and review cards.</p></div><a class="ghost" href="/api/evidence-graph?includeEvents=false">Open graph JSON</a></div>${overflowNote}${legend}<svg class="graph-map" viewBox="0 0 ${width} ${height}" role="img" aria-label="Evidence graph map"><defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L9,3 z" fill="#38bdf8"/></marker></defs>${laneRects}<g>${edgeLines}</g><g>${nodeRects}</g></svg></section>`;
}

function shortGraphLabel(label: string): string {
  return label.length > 31 ? `${label.slice(0, 28)}...` : label;
}

function renderProgressHtml(state: TutorState): string {
  const body = `<section class="hero"><div><p class="eyebrow">Learning map</p><h1>Progress map</h1><p>Track what you have seen, what needs review, and which concepts are becoming confident.</p></div></section>${nav()}${renderProgressBody(state)}`;
  return pageShell('MergeLearn Tutor Progress', body, 'Progress map', shellOpts(state, 'map'));
}

const LEARNING_PATH_CDN_SCRIPTS = '<script src="https://cdn.jsdelivr.net/npm/cytoscape@3.30.2/dist/cytoscape.min.js"></script><script src="https://cdn.jsdelivr.net/npm/dagre@0.8.5/dist/dagre.min.js"></script><script src="https://cdn.jsdelivr.net/npm/cytoscape-dagre@2.5.0/cytoscape-dagre.js"></script>';

function renderLearningPathCourseFilter(state: TutorState, activeCourseId?: string): string {
  if (state.courses.length === 0) return '';
  const links = state.courses.map((course) => {
    const active = course.id === activeCourseId ? ' is-active' : '';
    return `<a class="ghost map-course-link${active}" href="/learning-path?course=${encodeURIComponent(course.id)}">${escapeHtml(course.title)}</a>`;
  }).join('');
  const allLink = !activeCourseId ? '<a class="ghost map-course-link is-active" href="/learning-path">All courses</a>' : '<a class="ghost map-course-link" href="/learning-path">All courses</a>';
  return `<section class="panel filter-panel"><div class="section-head"><div><p class="eyebrow">Course scope</p><h2>Filter path to one learning track</h2></div></div><div class="actions">${allLink}${links}</div></section>`;
}

function renderLearningPathLegend(): string {
  const items = [
    { className: 'skill-new', label: 'New' },
    { className: 'skill-learning', label: 'Learning' },
    { className: 'skill-confident', label: 'Confident' },
    { className: 'skill-weak', label: 'Needs review' },
  ];
  return `<div class="learning-path-legend" aria-label="Mastery legend">${items.map((item) => `<span class="learning-path-legend-item ${item.className}">${escapeHtml(item.label)}</span>`).join('')}</div>`;
}

function learningPathPageScript(): string {
  return `<script>(function(){var el=document.getElementById('learning-path-cy');var raw=document.getElementById('learning-path-data');if(!el||!raw||typeof cytoscape==='undefined')return;var payload=JSON.parse(raw.textContent);var statusFill={new:'#161b22',learning:'rgba(210,153,34,0.15)',confident:'rgba(63,185,80,0.15)',needs_review:'rgba(248,81,73,0.15)'};var statusBorder={new:'#484f58',learning:'#d29922',confident:'#3fb950',needs_review:'#f85149'};var statusText={new:'#8b949e',learning:'#e6edf3',confident:'#e6edf3',needs_review:'#e6edf3'};if(typeof cytoscapeDagre!=='undefined')cytoscape.use(cytoscapeDagre);var cy=cytoscape({container:el,elements:{nodes:payload.nodes,edges:payload.edges},style:[{selector:'node',style:{'label':'data(label)','text-valign':'center','text-halign':'center','font-size':'11px','font-family':'Inter, system-ui, sans-serif','color':function(ele){return statusText[ele.data('status')]||'#e6edf3';},'background-color':function(ele){return statusFill[ele.data('status')]||'#161b22';},'border-width':2,'border-color':function(ele){return statusBorder[ele.data('status')]||'#484f58';},'width':'label','height':'label','padding':'12px','shape':'roundrectangle','text-wrap':'wrap','text-max-width':'120px'}},{selector:'node.lp-cycle',style:{'border-width':3,'border-style':'dashed'}},{selector:'edge',style:{'width':1.5,'line-color':'#58a6ff','target-arrow-color':'#58a6ff','target-arrow-shape':'triangle','curve-style':'bezier','arrow-scale':0.8}}],layout:{name:'dagre',rankDir:'TB',nodeSep:40,rankSep:60,padding:24},minZoom:0.3,maxZoom:2.5,wheelSensitivity:0.2});cy.on('tap','node',function(evt){var id=evt.target.id();var href=payload.practiceLinks[id]||'/map?mode=skill-map';window.location.href=href;});})();</script>`;
}

function renderLearningPathHtml(state: TutorState, url: URL): string {
  const courseId = url.searchParams.get('course') ?? undefined;
  const graph = buildLearningPathGraph(state, { courseId });
  const practiceByConcept = new Map<string, string>();
  for (const item of state.learningItems) {
    if (item.status !== 'archived') practiceByConcept.set(item.conceptId, '/practice');
  }
  const courseFilter = renderLearningPathCourseFilter(state, courseId);
  const cycleWarning = graph.cycleDetected
    ? `<p class="setup-note learning-path-cycle">Cycle detected among prerequisites. Recommended order is partial; involved nodes: ${graph.cycleNodes.map((id) => escapeHtml(id)).join(', ')}.</p>`
    : '';
  const orderedList = graph.recommendedOrder.length > 0
    ? `<ol class="learning-path-order">${graph.recommendedOrder.map((id) => {
      const node = graph.nodes.find((entry) => entry.id === id);
      const label = node?.label ?? id;
      const href = practiceByConcept.get(id) ?? '/map?mode=skill-map';
      const status = node?.status.replace(/_/g, ' ') ?? '';
      return `<li><a href="${href}">${escapeHtml(label)}</a><small>${escapeHtml(id)} · ${escapeHtml(status)}</small></li>`;
    }).join('')}</ol>`
    : '<p>No concepts in scope yet. Ingest evidence or widen course filter.</p>';
  const graphPayload = safeJsonEmbed({
    nodes: graph.nodes.map((node) => ({
      data: { id: node.id, label: node.label, status: node.status, mastery: node.mastery },
      classes: `lp-${node.status}${graph.cycleNodes.includes(node.id) ? ' lp-cycle' : ''}`,
    })),
    edges: graph.edges.map((edge) => ({ data: { id: `${edge.from}->${edge.to}`, source: edge.from, target: edge.to, type: edge.type } })),
    practiceLinks: Object.fromEntries(practiceByConcept.entries()),
  });
  const emptyState = graph.nodes.length === 0
    ? '<p class="setup-note">No concepts to display. Ingest repo evidence or select a course with linked concepts.</p>'
    : '';
  const stats = `<div class="stats"><div>${graph.nodes.length}<span>concepts</span></div><div>${graph.edges.length}<span>dependencies</span></div><div>${graph.summary.confident}<span>confident</span></div><div>${graph.summary.needs_review}<span>needs review</span></div></div>`;
  const courseNote = courseId ? ` · course ${escapeHtml(courseId)}` : '';
  const intro = renderPageIntro('Learning path', 'Prerequisite DAG with recommended study order', `Follow parent and prerequisite edges top-to-bottom. Colors match the skill map mastery states.${courseNote}`, `<div class="page-intro-stats"><span>${graph.recommendedOrder.length} in order</span><span>${graph.nodes.length} concepts</span></div>`);
  const cyPanel = graph.nodes.length > 0
    ? `<section class="panel learning-path-panel"><div class="section-head"><div><h2>Concept dependency graph</h2><p>Pan and zoom. Click a node to open practice or the skill map.</p></div></div><div class="learning-path-scroll"><div id="learning-path-cy" class="learning-path-cy" role="img" aria-label="Learning path directed acyclic graph"></div></div></section>`
    : '';
  const body = `${intro}${stats}${courseFilter}${cycleWarning}${emptyState}${renderLearningPathLegend()}${cyPanel}<section class="panel"><div class="section-head"><div><p class="eyebrow">Accessibility</p><h2>Recommended study order</h2><p>Ordered list fallback when the interactive graph is unavailable.</p></div><a class="ghost" href="/api/learning-path${courseId ? `?course=${encodeURIComponent(courseId)}` : ''}">Open path JSON</a></div>${orderedList}</section><script type="application/json" id="learning-path-data">${graphPayload}</script>${graph.nodes.length > 0 ? learningPathPageScript() : ''}`;
  return pageShell('MergeLearn Tutor Learning Path', body, 'Learning path', {
    ...shellOpts(state, 'map'),
    mapModeBar: renderMapModeBar('learning-path', courseId),
    extraHead: graph.nodes.length > 0 ? LEARNING_PATH_CDN_SCRIPTS : '',
  });
}

function renderProgressGuide(state: TutorState): string {
  const answeredEvents = state.learningEvents.filter((event) => event.eventType === 'answered');
  const active = activeLearningItems(state).length;
  const courseCards = state.learningItems.filter((item) => item.courseId).length;
  const acceptedQuestionCards = state.learningItems.filter((item) => item.questionId).length;
  const steps = [
    {
      label: 'Generate cards from a visible source',
      done: state.learningItems.length > 0,
      detail: state.learningItems.length > 0 ? `${active} active · ${state.learningItems.length - active} archived cards are counted in this map.` : 'Use Review source to generate the first broad or course-scoped queue.',
      href: '/',
      action: 'Open Review',
    },
    {
      label: 'Answer from memory',
      done: answeredEvents.length > 0,
      detail: answeredEvents.length > 0 ? `${answeredEvents.length} answered events are updating mastery estimates.` : 'Reveal/grade cards after answering; feedback-only card-quality events do not reduce mastery.',
      href: '/history',
      action: 'Audit answers',
    },
    {
      label: 'Separate source scope from mastery',
      done: courseCards > 0 || acceptedQuestionCards > 0,
      detail: `${courseCards} course-scoped cards · ${acceptedQuestionCards} accepted-question cards. Source explains why a card exists; answers explain mastery.`,
      href: '/history',
      action: 'Check source audit',
    },
    {
      label: 'Use raw progress only when debugging',
      done: state.concepts.length > 0,
      detail: `${state.concepts.length} concepts are grouped below; raw CLI progress stays collapsed for audit detail.`,
    },
  ];
  const items = steps.map((step, index) => `<li class="onboarding-step ${step.done ? 'is-done' : ''}"><span>${step.done ? '✓' : index + 1}</span><div><strong>${escapeHtml(step.label)}</strong><p>${escapeHtml(step.detail)}</p>${step.href ? `<a href="${step.href}">${escapeHtml(step.action)}</a>` : ''}</div></li>`).join('');
  return `<section class="panel onboarding-panel"><div class="section-head"><div><p class="eyebrow">Progress guide</p><h2>What changes these numbers?</h2><p>Progress is driven by review events, not by the source filter alone. Use this panel to understand the next action when the map looks empty or unchanged.</p></div><a class="ghost" href="/api/progress">Open progress JSON</a></div><ol class="onboarding-steps">${items}</ol></section>`;
}

function renderStudyHtml(state: TutorState): string {
  const data = studyData(state);
  const assignments = data.assignments;
  const rows = assignments.slice().reverse().map((assignment) => {
    const item = state.learningItems.find((candidate) => candidate.id === assignment.itemId);
    const action = assignment.condition === 'active_control' && assignment.status === 'assigned'
      ? `<button data-action="complete-passive-review" data-assignment-id="${escapeHtml(assignment.id)}">Mark passive review done</button>`
      : '';
    return `<article class="mini-card ${assignment.status === 'completed' ? 'completed' : ''}"><div class="card-topline"><span>${escapeHtml(assignment.condition.replace('_', ' '))}</span><span>${escapeHtml(assignment.status)}</span><span>${escapeHtml(assignment.seed)}</span></div><h3>${escapeHtml(item?.title ?? assignment.itemId)}</h3><p>${escapeHtml(assignment.itemId)} · concept ${escapeHtml(assignment.conceptId)}</p><small>${escapeHtml(assignment.assignedAt)}${assignment.completedAt ? ` · completed ${escapeHtml(assignment.completedAt)}` : ''}</small>${action}</article>`;
  }).join('');
  const summary = data.summary;
  const body = `<section class="hero"><div><p class="eyebrow">Experiment mode</p><h1>Active-control pilot</h1><p>Assign comparable cards to MergeLearn active recall or passive-review controls. This gives future evaluations a baseline stronger than “no treatment”.</p></div><div class="hero-card"><strong>${summary.total}</strong><span>assignments</span><strong>${summary.completed}</strong><span>completed</span></div></section>${nav()}<section class="panel"><div class="section-head"><div><p class="eyebrow">Crossover assignment</p><h2>Build a local active-control set</h2><p>MergeLearn assignments use the normal answer-first review flow. Active-control assignments ask the learner to passively read the same evidence and mark the control review complete without changing mastery.</p></div><button data-action="assign-study">Assign next pilot set</button></div><div class="mini-grid"><article class="mini-card"><strong>${summary.mergelearn}</strong><p>MergeLearn active recall</p><small>Answer, reveal, self-grade, calibration, delayed probes.</small></article><article class="mini-card"><strong>${summary.activeControl}</strong><p>Active-control passive review</p><small>Read evidence without retrieval practice; useful baseline for experiments.</small></article><article class="mini-card"><strong>${summary.pending}</strong><p>Pending assignments</p><small>Complete these before comparing delayed outcomes.</small></article><article class="mini-card"><strong>${summary.passiveCompleted}</strong><p>Passive controls complete</p><small>Recorded as events without increasing mastery.</small></article></div></section><section class="panel"><div class="section-head"><div><h2>Assignments</h2><p>Use this as a pilot ledger. It is intentionally local and inspectable.</p></div><a class="ghost" href="/api/study">Open study JSON</a></div><div class="mini-grid">${rows || '<p>No study assignments yet. Assign a pilot set after generating review cards.</p>'}</div></section>${studyPageScript()}`;
  return pageShell('MergeLearn Tutor Study', body, 'Active-control study', shellOpts(state, 'practice'));
}

function studyPageScript(): string {
  return `<script>document.addEventListener('click',async function(event){var button=event.target.closest('button[data-action="assign-study"],button[data-action="complete-passive-review"]');if(!button)return;if(button.dataset.action==='assign-study'){button.disabled=true;var res=await fetch('/api/study/assign',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({seed:'browser-pilot',count:6})});var json=await res.json();if(json.ok)location.reload();else document.getElementById('status').textContent=json.error||'Study assignment failed';}if(button.dataset.action==='complete-passive-review'){button.disabled=true;var done=await fetch('/api/study/passive-review/complete',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({assignmentId:button.dataset.assignmentId,durationMs:120000,note:'browser passive review'})});var body=await done.json();if(body.ok)location.reload();else document.getElementById('status').textContent=body.error||'Passive review failed';}});</script>`;
}

function renderAuditHtml(state: TutorState): string {
  const broadCards = state.learningItems.filter((item) => !item.courseId).length;
  const courseCards = state.learningItems.filter((item) => item.courseId).length;
  const acceptedQuestionCards = state.learningItems.filter((item) => item.questionId).length;
  const qualityEvents = state.learningEvents.filter((event) => ['marked_bad_card', 'marked_wrong_evidence', 'marked_duplicate'].includes(event.eventType));
  const calibration = summarizeCalibration(state);
  const buckets = calibrationBuckets(state);
  const delayed = delayedProbeSummary(state);
  const drafts = state.questionBank.filter((entry) => entry.status === 'draft');
  const accepted = state.questionBank.filter((entry) => entry.status === 'accepted');
  const rejected = state.questionBank.filter((entry) => entry.status === 'rejected');
  const pipelineCards = [
    { key: 'draft', title: 'Draft questions', count: drafts.length, detail: 'Locally drafted prompts awaiting review.', tone: 'pipeline-draft' },
    { key: 'accepted', title: 'Accepted questions', count: accepted.length, detail: 'Stable source for generated review cards.', tone: 'pipeline-accepted' },
    { key: 'rejected', title: 'Rejected questions', count: rejected.length, detail: 'Kept for audit; not used to generate cards.', tone: 'pipeline-rejected' },
    { key: 'quality', title: 'Card-quality events', count: qualityEvents.length, detail: 'Bad-card, wrong-evidence, and duplicate feedback.', tone: 'pipeline-quality' },
  ];
  const pipelineHtml = `<section class="panel"><div class="section-head"><div><p class="eyebrow">Quality pipeline</p><h2>From drafted questions to accepted review cards</h2><p>Click a metric card to inspect the matching local items.</p></div><a class="ghost" href="/questions">Manage questions</a></div><div class="pipeline-grid">${pipelineCards.map((card) => `<button type="button" class="pipeline-card ${card.tone}" data-action="audit-open" data-audit-key="${card.key}" data-audit-title="${escapeHtml(card.title)}"><strong>${card.count}</strong><p>${escapeHtml(card.title)}</p><small>${escapeHtml(card.detail)}</small></button>`).join('')}</div><div class="is-hidden" id="audit-list-draft">${renderAuditListItems(drafts.map((entry) => entry.prompt))}</div><div class="is-hidden" id="audit-list-accepted">${renderAuditListItems(accepted.map((entry) => entry.prompt))}</div><div class="is-hidden" id="audit-list-rejected">${renderAuditListItems(rejected.map((entry) => entry.prompt))}</div><div class="is-hidden" id="audit-list-quality">${renderAuditListItems(qualityEvents.map((event) => `${event.eventType} · ${event.itemId}${event.note ? ` · ${event.note}` : ''}`))}</div></section>`;
  const bucketRows = buckets.map((bucket) => {
    const accuracy = bucket.total > 0 ? Math.round((bucket.correct / bucket.total) * 100) : 0;
    return `<div class="calibration-row"><span>${escapeHtml(bucket.label)}</span><div class="calibration-bar"><span style="width:${accuracy}%"></span></div><strong>${bucket.total ? `${accuracy}% · ${bucket.correct}/${bucket.total}` : '—'}</strong></div>`;
  }).join('');
  const activity = recentHistoryActivity(state);
  const auditHtml = `<section class="audit-split"><section class="panel"><div class="section-head"><div><p class="eyebrow">Source audit</p><h2>Activity timeline</h2><p>Recent reviews, delayed probe responses, and card-quality feedback.</p></div></div><div class="timeline-list">${activity || '<p>No learning activity yet.</p>'}</div></section><section class="panel"><div class="section-head"><div><p class="eyebrow">Calibration</p><h2>Calibrated answers</h2><p>${calibration.pairedCount} paired answers · confidence ${score(calibration.averageConfidence)} · accuracy ${score(calibration.accuracy)} · Brier ${calibration.brierScore.toFixed(2)}</p></div></div><div class="calibration-chart">${bucketRows}</div><div class="mini-grid audit-source-grid"><article class="mini-card"><strong>${broadCards}</strong><p>Broad repo cards</p></article><article class="mini-card"><strong>${courseCards}</strong><p>Course cards</p></article><article class="mini-card"><strong>${acceptedQuestionCards}</strong><p>Accepted-question cards</p></article><article class="mini-card"><strong>${delayed.due}</strong><p>Delayed probes due</p></article></div></section></section>`;
  const modal = '<div class="modal-overlay is-hidden" id="audit-modal" data-action="audit-close"><div class="modal-panel" role="dialog" aria-modal="true"><div class="modal-head"><h2 class="modal-title">Audit details</h2><button type="button" class="ghost" data-action="audit-close">Close</button></div><div class="modal-body"></div></div></div>';
  const intro = renderPageIntro('Audit and quality', 'One audit view for cards, questions, and study events', 'History and Questions share one quality lens here: every badge is deterministic and computed from local state.', `<div class="page-intro-stats"><span>${state.learningEvents.length} review events</span><span>${state.questionBank.length} questions</span></div>`);
  return pageShell('MergeLearn Tutor Audit', `${intro}${nav()}${pipelineHtml}${auditHtml}${modal}${auditPageScript()}`, 'Audit', shellOpts(state, 'audit'));
}

function renderHistoryHtml(state: TutorState, options: { type?: string; limit: number; offset: number } = { limit: 20, offset: 0 }): string {
  const data = cardHistoryData(state);
  const batches = data.batches.map((batch) => `<article class="mini-card"><strong>${escapeHtml(batch.mode)}</strong><p>${escapeHtml(batch.id)} · ${batch.itemIds.length} created · ${batch.archivedItemIds.length} archived</p><small>${escapeHtml(batch.createdAt)}</small></article>`).join('');
  const activeCards = data.cards.filter((card) => card.status !== 'archived');
  const archivedCards = data.cards.filter((card) => card.status === 'archived');
  const cardList = (cards: typeof data.cards) => cards.slice().reverse().map((card) => `<article class="mini-card ${card.status === 'archived' ? 'is-archived' : ''}"><div class="card-topline"><span>${escapeHtml(card.status)}</span><span>gen ${card.generation}</span><span>${escapeHtml(card.source)}</span></div><h3>${escapeHtml(card.title)}</h3><p>${escapeHtml(card.id)}${card.courseId ? ` · course ${escapeHtml(card.courseId)}` : ''}${card.questionId ? ` · question ${escapeHtml(card.questionId)}` : ''}</p><details><summary>${card.events.length} timeline events</summary><ul>${card.events.map((event) => `<li><strong>${escapeHtml(event.eventType)}</strong>${event.correct === undefined ? '' : ` · ${event.correct ? 'correct' : 'missed'}`} ${event.answerText ? `— ${escapeHtml(event.answerText)}` : ''}${event.note ? ` — ${escapeHtml(event.note)}` : ''}</li>`).join('')}</ul></details></article>`).join('');
  const metrics = `<div class="stats"><div>${data.summary.activeCards}<span>active</span></div><div>${data.summary.archivedCards}<span>archived</span></div><div>${data.summary.batches}<span>batches</span></div><div>${data.summary.events}<span>events</span></div></div>`;
  return pageShell('MergeLearn Tutor History', `<section class="hero"><div><p class="eyebrow">Learning memory</p><h1>History without the wall of cards</h1><p>Activity timeline first. Dense card details stay grouped below.</p></div></section>${nav()}${metrics}${renderHistoryActivityPanel(state, options)}${renderHistorySourceAudit(state)}<section class="panel"><h2>Batches</h2><div class="mini-grid">${batches || '<p>No batches yet. Use Review source to generate a queue; batch details will appear here.</p>'}</div></section><details class="panel"><summary><strong>Active cards</strong> · ${activeCards.length}</summary><div class="mini-grid">${cardList(activeCards) || '<p>No active cards. Generate cards from all evidence or a selected course on Review.</p>'}</div></details><details class="panel"><summary><strong>Archived cards</strong> · ${archivedCards.length}</summary><div class="mini-grid">${cardList(archivedCards) || '<p>No archived cards. Regenerate from source to preserve the old queue here.</p>'}</div></details><p><a href="/api/cards/history">Raw history JSON</a></p>`, 'History', shellOpts(state, 'audit'));
}

function renderHistorySourceAudit(state: TutorState): string {
  const broadCards = state.learningItems.filter((item) => !item.courseId).length;
  const courseCards = state.learningItems.filter((item) => item.courseId).length;
  const acceptedQuestionCards = state.learningItems.filter((item) => item.questionId).length;
  const qualityEvents = state.learningEvents.filter((event) => ['marked_bad_card', 'marked_wrong_evidence', 'marked_duplicate'].includes(event.eventType)).length;
  const calibration = summarizeCalibration(state);
  const delayed = delayedProbeSummary(state);
  const study = studySummary(state);
  return `<section class="panel"><div class="section-head"><div><p class="eyebrow">Source audit</p><h2>Why did these cards exist?</h2><p>Use this before inspecting individual cards: it separates broad repo evidence, course-scoped generation, accepted-question cards, delayed probes, study controls, and card-quality feedback.</p></div><a class="ghost" href="/">Change Review source</a></div><div class="mini-grid"><article class="mini-card"><strong>${broadCards}</strong><p>All due repo evidence cards</p><small>Cards without a course id came from the broad queue.</small></article><article class="mini-card"><strong>${courseCards}</strong><p>Course-scoped cards</p><small>These should show a course id on the card and in history.</small></article><article class="mini-card"><strong>${acceptedQuestionCards}</strong><p>Accepted-question cards</p><small>These were generated from approved prompts in the question bank.</small></article><article class="mini-card"><strong>${qualityEvents}</strong><p>Card-quality events</p><small>Bad-card/wrong-evidence/duplicate feedback is audited without lowering mastery.</small></article><article class="mini-card"><strong>${delayed.due}</strong><p>Delayed probes due</p><small>${delayed.scheduled} scheduled · ${delayed.completed} completed · <a href="/api/delayed-probes">Open delayed-probe JSON</a></small></article><article class="mini-card"><strong>${study.total}</strong><p>Study assignments</p><small>${study.mergelearn} active recall · ${study.activeControl} passive controls · <a href="/study">Open Study</a></small></article><article class="mini-card"><strong>${calibration.pairedCount}</strong><p>Calibrated answers</p><small>Confidence ${score(calibration.averageConfidence)} · accuracy ${score(calibration.accuracy)} · Brier ${calibration.brierScore.toFixed(2)}</small></article></div></section>`;
}

function recentHistoryActivity(state: TutorState): string {
  const cardById = new Map(state.learningItems.map((item) => [item.id, item]));
  const rows = [
    ...state.learningEvents.map((event) => {
      const item = cardById.get(event.itemId);
      return { at: event.createdAt, kind: event.eventType, title: item?.title ?? event.itemId, detail: event.correct === undefined ? event.note ?? 'review feedback' : event.correct ? 'answered correctly' : 'missed answer' };
    }),
    ...state.cardBatches.map((batch) => ({ at: batch.createdAt, kind: `batch_${batch.mode}`, title: batch.id, detail: `${batch.itemIds.length} created · ${batch.archivedItemIds.length} archived${batch.reason ? ` · ${batch.reason}` : ''}` })),
    ...state.corrections.map((correction) => ({ at: correction.createdAt, kind: correction.correctionType, title: correction.targetId, detail: correction.note ?? correction.replacementLabel ?? 'correction recorded' })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12);
  return rows.map((row) => `<article class="timeline-row"><span>${escapeHtml(row.kind)}</span><strong>${escapeHtml(row.title)}</strong><small>${escapeHtml(row.detail)}</small></article>`).join('');
}

function renderPreferencesHtml(state: TutorState, preferences: UserPreferences): string {
  const options = [
    ['language_mechanics', 'Language mechanics', 'Syntax, types, and runtime rules.', 'Example: What does this union type allow and reject?'],
    ['local_behavior', 'Function and block behavior', 'What the highlighted code does locally.', 'Example: What happens when this input is undefined?'],
    ['file_role', 'File/module role', 'Why this code belongs here.', 'Example: Why does this snippet belong in this file?'],
    ['architecture_flow', 'Architecture and repo flow', 'Callers, dependencies, and cross-file movement.', 'Example: What calls this code and what depends on the result?'],
    ['risk_and_tests', 'Risk and testing', 'Bugs, validation, security, and regression tests.', 'Example: What could break, and what test should catch it?'],
    ['repo_domain', 'Repo-specific vocabulary', 'Project terms and domain language.', 'Example: What does this project mean by this term here?'],
  ] as const;
  const presets = [
    { label: 'Daily code comprehension', detail: 'Best default for understanding recent changes without too many categories.', planes: ['local_behavior', 'file_role', 'risk_and_tests'], snippetLines: 14, explain: false },
    { label: 'Risk and test review', detail: 'Use before refactors or PR review to emphasize failure modes and coverage.', planes: ['risk_and_tests', 'local_behavior', 'architecture_flow'], snippetLines: 18, explain: false },
    { label: 'Repo onboarding', detail: 'Use when learning an unfamiliar codebase and needing more explanation.', planes: ['repo_domain', 'architecture_flow', 'file_role', 'local_behavior'], snippetLines: 20, explain: true },
  ] as const;
  const presetCards = presets.map((preset) => `<article class="preset-card"><div><strong>${escapeHtml(preset.label)}</strong><p>${escapeHtml(preset.detail)}</p><small>${preset.planes.map(escapeHtml).join(' · ')} · ${preset.snippetLines} snippet lines${preset.explain ? ' · explanations on' : ''}</small></div><button data-action="preferences-preset" data-planes="${preset.planes.join(',')}" data-snippet-lines="${preset.snippetLines}" data-show-explanations="${preset.explain}">Use this mix</button></article>`).join('');
  const checks = options.map(([plane, label, detail, example]) => `<label class="choice"><input type="checkbox" data-plane="${plane}" ${preferences.review.enabledPlanes.includes(plane) ? 'checked' : ''} /><span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(detail)} ${escapeHtml(example)}</small></span></label>`).join('');
  const selectedSummary = `${preferences.review.enabledPlanes.length} question categories · ${preferences.review.snippetLineCount} snippet lines · explanations ${preferences.review.showExplanationsByDefault ? 'on' : 'off'}`;
  const body = `<section class="hero"><div><p class="eyebrow">Personalize the tutor</p><h1>Question preferences setup</h1><p>Choose a recommended question mix, then adjust the categories before drafting questions or generating cards.</p></div><div class="hero-card"><strong>${preferences.review.enabledPlanes.length}</strong><span>enabled categories</span><strong>${preferences.review.snippetLineCount}</strong><span>snippet lines</span></div></section>${nav()}<section class="panel onboarding-panel preferences-wizard"><div class="section-head"><div><p class="eyebrow">Setup wizard</p><h2>Start with a recommended mix</h2><p>These presets only change local preferences in <code>.skilltrace/preferences.json</code>. They do not enable remote LLM calls.</p></div><a class="ghost" href="/plan">Back to Plan Builder</a></div><div class="preset-grid">${presetCards}</div><p class="setup-note" id="preferences-summary">Current setup: ${escapeHtml(selectedSummary)}.</p></section><section class="panel"><div class="section-head"><div><h2>Fine-tune question categories</h2><p>Pick the kinds of prompts you want in the Review queue. A small focused mix is usually better than every category.</p></div><a class="ghost" href="/questions">Draft questions next</a></div><div class="choices">${checks}</div><div class="preference-controls"><label>Snippet lines <input id="snippet-lines" type="number" min="4" max="40" value="${preferences.review.snippetLineCount}" /></label><label class="choice"><input id="show-explanations" type="checkbox" ${preferences.review.showExplanationsByDefault ? 'checked' : ''} /><span><strong>Show explanations by default</strong><small>Useful while learning a new repo; turn off for active recall.</small></span></label></div><div class="actions"><button data-action="save-preferences">Save preferences</button><a class="ghost" href="/plan">Return to Plan Builder</a></div></section>`;
  return pageShell('MergeLearn Tutor Preferences', body, 'Question preferences', shellOpts(state, 'setup'));
}

function nav(): string {
  return '';
}

function appNav(): string {
  return '<nav class="app-nav" aria-label="Primary navigation"><a href="/workbench">Workbench</a><a href="/practice">Practice</a><a href="/map">Map</a><a href="/audit">Audit</a><a href="/plan">Setup</a></nav>';
}

function appSubnav(): string {
  return '<nav class="app-subnav" aria-label="Secondary navigation"><span class="subnav-group" data-group="practice">Practice</span><a href="/practice" data-group="practice">Focused practice</a><a href="/" data-group="practice">Review cards</a><a href="/study" data-group="practice">Study controls</a><span class="subnav-group" data-group="map">Map</span><a href="/map?mode=local-graph" data-group="map">Local graph</a><a href="/map?mode=provenance" data-group="map">Provenance lane</a><a href="/map?mode=skill-map" data-group="map">Skill map</a><a href="/learning-path" data-group="map">Learning path</a><a href="/graph" data-group="map">Legacy graph</a><a href="/timeline" data-group="map">Legacy timeline</a><a href="/progress" data-group="map">Legacy progress</a><span class="subnav-group" data-group="audit">Audit</span><a href="/audit" data-group="audit">Audit overview</a><a href="/history" data-group="audit">History</a><a href="/questions" data-group="audit">Questions</a><span class="subnav-group" data-group="setup">Setup</span><a href="/plan" data-group="setup">Plan Builder</a><a href="/courses" data-group="setup">Courses</a><a href="/preferences" data-group="setup">Preferences</a></nav>';
}

function pageShell(title: string, body: string, status: string, options: PageShellOptions = {}): string {
  const bodyClasses = [
    options.focus ? 'practice-focus-shell' : '',
    options.surface ? `surface-${options.surface}` : '',
  ].filter(Boolean).join(' ');
  const bodyAttrs = [
    bodyClasses ? `class="${bodyClasses}"` : '',
    options.practiceIndex !== undefined ? `data-practice-index="${options.practiceIndex}"` : '',
    options.practiceTotal !== undefined ? `data-practice-total="${options.practiceTotal}"` : '',
    options.reviewedInSession ? `data-practice-reviewed="${escapeHtml(options.reviewedInSession.join(','))}"` : '',
  ].filter(Boolean).join(' ');
  const repoBadge = escapeHtml(shortRepoLabel(options.repoPath));
  const mapBar = options.mapModeBar ? options.mapModeBar.replace('class="map-mode-bar"', 'class="map-mode-bar map-mode-bar--shell"') : '';
  const headExtras = options.extraHead ?? '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"><style>${style()}</style>${headExtras}</head><body${bodyAttrs ? ` ${bodyAttrs}` : ''}><div class="status" id="status">${escapeHtml(status)}</div><header class="global-header" role="banner"><div class="header-brand"><span class="app-logo">MergeLearn Tutor</span><span class="repo-badge" id="shell-repo-badge" title="${escapeHtml(options.repoPath ?? '')}">${repoBadge}</span><span class="sr-only">Local learning workbench</span><span class="sr-only">No remote LLM calls. State is read from this local session.</span></div>${appNav()}<div class="header-metrics" aria-label="Current local plan snapshot"><span class="metric-pill">Due probes <strong id="shell-due-probes">—</strong></span><span class="metric-pill">Active cards <strong id="shell-cards">—</strong></span><a class="header-cta" id="shell-next-action" href="/plan">Loading plan state…</a><span class="sr-only" id="shell-concepts">—</span><span class="sr-only" id="shell-courses">—</span><span class="sr-only" id="shell-questions">—</span></div></header>${mapBar}${appSubnav()}<main class="content-area">${body}</main><script>${script()}</script></body></html>`;
}

function style(): string {
  return `
*,*:before,*:after{box-sizing:border-box}
:root{
  --color-bg-void:#010409;
  --color-bg-base:#0d1117;
  --color-bg-raised:#161b22;
  --color-bg-overlay:#1c2128;
  --color-bg-hover:#21262d;
  --color-bg-selected:#1f3a5f;
  --color-border-subtle:rgba(48,54,61,0.8);
  --color-border-default:rgba(48,54,61,1);
  --color-border-muted:rgba(78,96,120,0.5);
  --color-border-emphasis:rgba(99,102,241,0.5);
  --color-text-primary:#e6edf3;
  --color-text-secondary:#8b949e;
  --color-text-muted:#484f58;
  --color-text-link:#58a6ff;
  --color-text-inverse:#0d1117;
  --color-accent-primary:#6366f1;
  --color-accent-primary-hover:#7c7ff7;
  --color-accent-primary-bg:rgba(99,102,241,0.12);
  --color-accent-primary-border:rgba(99,102,241,0.35);
  --color-success:#3fb950;
  --color-success-bg:rgba(63,185,80,0.1);
  --color-success-border:rgba(63,185,80,0.35);
  --color-warning:#d29922;
  --color-warning-bg:rgba(210,153,34,0.12);
  --color-warning-border:rgba(210,153,34,0.35);
  --color-danger:#f85149;
  --color-danger-bg:rgba(248,81,73,0.1);
  --color-danger-border:rgba(248,81,73,0.35);
  --color-info:#388bfd;
  --color-info-bg:rgba(56,139,253,0.1);
  --color-info-border:rgba(56,139,253,0.35);
  --color-concept:#a78bfa;
  --color-concept-bg:rgba(167,139,250,0.1);
  --color-concept-border:rgba(167,139,250,0.35);
  --font-sans:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
  --font-mono:'JetBrains Mono','Fira Code',ui-monospace,'Cascadia Code',monospace;
  --text-xs:0.75rem;
  --text-sm:0.875rem;
  --text-base:1rem;
  --text-lg:1.125rem;
  --text-xl:1.25rem;
  --text-2xl:1.5rem;
  --text-3xl:1.875rem;
  --text-4xl:2.25rem;
  --font-regular:400;
  --font-medium:500;
  --font-semibold:600;
  --font-bold:700;
  --leading-tight:1.25;
  --leading-snug:1.375;
  --leading-normal:1.5;
  --leading-relaxed:1.625;
  --tracking-tight:-0.025em;
  --tracking-normal:0;
  --tracking-wide:0.05em;
  --tracking-wider:0.1em;
  --space-1:0.25rem;
  --space-2:0.5rem;
  --space-3:0.75rem;
  --space-4:1rem;
  --space-5:1.25rem;
  --space-6:1.5rem;
  --space-8:2rem;
  --space-10:2.5rem;
  --space-12:3rem;
  --space-16:4rem;
  --radius-sm:6px;
  --radius-md:10px;
  --radius-lg:14px;
  --radius-xl:20px;
  --radius-full:9999px;
  --max-w-sm:480px;
  --max-w-md:720px;
  --max-w-lg:960px;
  --max-w-xl:1120px;
  --max-w-2xl:1280px;
  --shadow-sm:0 1px 3px rgba(1,4,9,0.4),0 1px 2px rgba(1,4,9,0.24);
  --shadow-md:0 4px 6px rgba(1,4,9,0.5),0 2px 4px rgba(1,4,9,0.3);
  --shadow-lg:0 10px 20px rgba(1,4,9,0.6),0 4px 8px rgba(1,4,9,0.35);
  --shadow-glow-indigo:0 0 0 3px rgba(99,102,241,0.25);
  --shadow-glow-success:0 0 0 3px rgba(63,185,80,0.25);
  --transition-fast:100ms cubic-bezier(0.16,1,0.3,1);
  --transition-base:200ms cubic-bezier(0.16,1,0.3,1);
  --transition-slow:350ms cubic-bezier(0.16,1,0.3,1);
}
body{margin:0;font-family:var(--font-sans);font-size:var(--text-base);line-height:var(--leading-normal);color:var(--color-text-primary);background:var(--color-bg-void);-webkit-font-smoothing:antialiased}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.status{position:sticky;top:0;z-index:50;background:var(--color-bg-overlay);padding:var(--space-2) var(--space-6);border-bottom:1px solid var(--color-border-subtle);color:var(--color-info);font-size:var(--text-sm);font-weight:var(--font-semibold)}
.global-header{position:sticky;top:0;z-index:40;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:var(--space-4);height:48px;padding:0 var(--space-6);background:var(--color-bg-base);backdrop-filter:blur(12px);border-bottom:1px solid var(--color-border-subtle)}
.header-brand{display:flex;align-items:center;gap:var(--space-3);min-width:0}
.app-logo{font-size:15px;font-weight:var(--font-bold);letter-spacing:var(--tracking-tight);background:linear-gradient(135deg,var(--color-text-primary),var(--color-accent-primary-hover));-webkit-background-clip:text;-webkit-text-fill-color:transparent;white-space:nowrap}
.repo-badge{font-family:var(--font-mono);font-size:var(--text-xs);color:var(--color-text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:12rem}
.header-metrics{display:flex;align-items:center;gap:var(--space-3);flex-wrap:wrap;justify-content:flex-end}
.metric-pill{font-size:var(--text-xs);color:var(--color-text-secondary);white-space:nowrap}
.metric-pill strong{color:var(--color-text-primary);font-weight:var(--font-semibold)}
.header-cta{font-size:var(--text-xs);font-weight:var(--font-semibold);color:var(--color-text-link);text-decoration:none;padding:var(--space-1) var(--space-3);border-radius:var(--radius-md);border:1px solid var(--color-border-subtle);background:var(--color-bg-overlay);transition:background var(--transition-fast),border-color var(--transition-fast)}
.header-cta:hover{background:var(--color-bg-hover);border-color:var(--color-border-muted);text-decoration:none}
.app-nav{display:flex;flex-wrap:wrap;gap:var(--space-2);justify-content:center;align-items:center}
.app-nav a{display:inline-flex;align-items:center;padding:var(--space-2) var(--space-3);font-size:var(--text-sm);font-weight:var(--font-medium);color:var(--color-text-secondary);text-decoration:none;border-radius:var(--radius-full);border:1px solid transparent;transition:background var(--transition-fast),color var(--transition-fast),border-color var(--transition-fast)}
.app-nav a:hover{color:var(--color-text-primary);background:var(--color-bg-hover)}
.app-nav a[aria-current="page"]{color:var(--color-text-primary);background:var(--color-bg-selected);border-color:var(--color-border-emphasis)}
.app-subnav{display:flex;flex-wrap:wrap;gap:var(--space-2);align-items:center;padding:var(--space-2) var(--space-6);background:var(--color-bg-base);border-bottom:1px solid var(--color-border-subtle)}
.app-subnav span{color:var(--color-text-muted);font-size:var(--text-xs);font-weight:var(--font-bold);letter-spacing:var(--tracking-wider);text-transform:uppercase;margin-left:var(--space-2)}
.app-subnav a{font-size:var(--text-xs);padding:var(--space-1) var(--space-3);color:var(--color-text-secondary);text-decoration:none;border-radius:var(--radius-full);border:1px solid transparent;transition:background var(--transition-fast),color var(--transition-fast)}
.app-subnav a:hover{color:var(--color-text-primary);background:var(--color-bg-hover)}
.app-subnav a[aria-current="page"]{color:var(--color-text-primary);border-color:var(--color-info-border);background:var(--color-info-bg)}
.content-area{max-width:var(--max-w-xl);margin:0 auto;padding:var(--space-6) var(--space-6) var(--space-16)}
a{color:var(--color-text-link);text-decoration:none;transition:color var(--transition-fast)}
a:hover{text-decoration:underline}
.hero{display:grid;grid-template-columns:minmax(0,1fr) 220px;gap:var(--space-6);align-items:stretch;margin:0 0 var(--space-6);padding:var(--space-8);border:1px solid var(--color-border-subtle);border-radius:var(--radius-lg);background:var(--color-bg-raised)}
.hero h1{font-size:var(--text-3xl);line-height:var(--leading-tight);margin:var(--space-1) 0 var(--space-3);letter-spacing:var(--tracking-tight);font-weight:var(--font-bold)}
.hero p{color:var(--color-text-secondary);font-size:var(--text-base);line-height:var(--leading-normal);margin:0}
.hero-card{border:1px solid var(--color-border-subtle);border-radius:var(--radius-lg);background:var(--color-bg-overlay);padding:var(--space-6);display:grid;align-content:center;gap:var(--space-2);transition:transform var(--transition-base),border-color var(--transition-fast)}
.hero-card:hover{border-color:var(--color-border-muted);transform:translateY(-1px)}
.hero-card strong{font-size:var(--text-4xl);font-weight:var(--font-bold);letter-spacing:var(--tracking-tight);color:var(--color-text-primary)}
.hero-card span{color:var(--color-text-muted);font-size:var(--text-xs);text-transform:uppercase;letter-spacing:var(--tracking-wide);font-weight:var(--font-semibold)}
.nav,.toolbar{display:flex;flex-wrap:wrap;gap:var(--space-3);align-items:center;background:var(--color-bg-raised);border:1px solid var(--color-border-subtle);border-radius:var(--radius-lg);padding:var(--space-4) var(--space-5);margin:0 0 var(--space-6)}
.toolbar{justify-content:space-between}
.toolbar p{margin:0;color:var(--color-text-secondary);font-size:var(--text-sm)}
.nav a,.ghost,button{display:inline-flex;align-items:center;justify-content:center;padding:var(--space-2) var(--space-4);font-size:var(--text-sm);font-weight:var(--font-semibold);text-decoration:none;border-radius:var(--radius-md);border:1px solid var(--color-border-default);background:var(--color-bg-overlay);color:var(--color-text-primary);transition:background var(--transition-fast),border-color var(--transition-fast),transform var(--transition-base);cursor:pointer;font-family:inherit}
.ghost{background:transparent;color:var(--color-text-secondary);border-color:transparent}
.nav a:hover,.ghost:hover,button:hover{background:var(--color-bg-hover);border-color:var(--color-border-muted);color:var(--color-text-primary);text-decoration:none;transform:translateY(-1px)}
button:focus-visible,.ghost:focus-visible,.app-nav a:focus-visible,a:focus-visible{outline:none;box-shadow:var(--shadow-glow-indigo)}
button:first-child,.actions button:first-child,.primary-actions button{background:var(--color-accent-primary);border-color:var(--color-accent-primary);color:#fff}
button:first-child:hover,.actions button:first-child:hover,.primary-actions button:hover{background:var(--color-accent-primary-hover);transform:translateY(-1px)}
button:disabled{opacity:.4;cursor:not-allowed;transform:none!important}
.card,.panel{background:var(--color-bg-raised);border:1px solid var(--color-border-subtle);border-radius:var(--radius-lg);padding:var(--space-6);margin:0 0 var(--space-6)}
.card.completed{border-color:var(--color-success-border);background:linear-gradient(180deg,var(--color-success-bg),var(--color-bg-raised))}
.review-grid{display:grid;gap:var(--space-6)}
.practice-focus{max-width:var(--max-w-md);margin:0 auto}
.practice-progress{height:6px;max-width:none;margin-top:var(--space-3)}
.card-topline{display:flex;flex-wrap:wrap;gap:var(--space-2);margin-bottom:var(--space-4);align-items:center}
.card-topline span,.eyebrow{border:1px solid var(--color-info-border);border-radius:var(--radius-full);padding:3px 8px;color:var(--color-info);background:var(--color-info-bg);text-transform:uppercase;font-size:var(--text-xs);font-weight:var(--font-semibold);letter-spacing:var(--tracking-wider)}
.eyebrow{display:inline-flex;margin-bottom:var(--space-3)}
.why{color:var(--color-text-secondary);font-size:var(--text-sm);line-height:var(--leading-normal);margin-top:0}
.snippet-head{display:flex;justify-content:space-between;gap:var(--space-3);margin:var(--space-4) 0 0;padding:var(--space-3) var(--space-4);background:var(--color-bg-overlay);border:1px solid var(--color-border-subtle);border-radius:var(--radius-md) var(--radius-md) 0 0;color:var(--color-info);font-family:var(--font-mono);font-size:var(--text-sm);font-weight:var(--font-medium)}
.question-box,.reveal-panel,.confidence-panel{border:1px solid var(--color-border-subtle);border-radius:var(--radius-lg);background:var(--color-bg-overlay);padding:var(--space-4);margin:var(--space-4) 0}
.reveal-panel{background:var(--color-accent-primary-bg);border-color:var(--color-accent-primary-border)}
.confidence-options{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:var(--space-2)}
.confidence-options label{display:flex;gap:var(--space-2);align-items:center;border:1px solid var(--color-border-default);border-radius:var(--radius-full);background:var(--color-bg-overlay);padding:var(--space-2) var(--space-3);color:var(--color-text-secondary);font-weight:var(--font-semibold);font-size:var(--text-sm);cursor:pointer;transition:background var(--transition-fast),border-color var(--transition-fast)}
.confidence-options label:hover{border-color:var(--color-border-emphasis);color:var(--color-text-primary);background:var(--color-bg-hover)}
.confidence-options input{margin:0;width:auto;cursor:pointer}
.quality-panel{display:grid;gap:var(--space-3);border:1px solid var(--color-border-subtle);border-radius:var(--radius-lg);background:var(--color-bg-overlay);padding:var(--space-4);margin:var(--space-4) 0}
.quality-summary{display:flex;justify-content:space-between;gap:var(--space-3);align-items:center}
.quality-panel strong{text-transform:capitalize;font-size:var(--text-base)}
.quality-ready{border-color:var(--color-success-border);background:var(--color-success-bg)}
.quality-needs_review{border-color:var(--color-warning-border);background:var(--color-warning-bg)}
.quality-blocked{border-color:var(--color-danger-border);background:var(--color-danger-bg)}
.quality-details summary{cursor:pointer;color:var(--color-text-link);font-weight:var(--font-semibold);font-size:var(--text-sm)}
.quality-scores{display:flex;flex-wrap:wrap;gap:var(--space-2);margin-top:var(--space-3)}
.quality-scores span{border:1px solid var(--color-border-subtle);border-radius:var(--radius-full);padding:3px 8px;color:var(--color-text-secondary);background:var(--color-bg-overlay);font-size:var(--text-xs);font-weight:var(--font-medium)}
.quality-warnings{margin:0;color:var(--color-warning);font-size:var(--text-sm);font-weight:var(--font-medium)}
.is-hidden{display:none}
.label{font-size:var(--text-xs);text-transform:uppercase;letter-spacing:var(--tracking-wider);color:var(--color-info);font-weight:var(--font-bold);margin:0 0 var(--space-2)}
textarea,input,select{width:100%;border:1px solid var(--color-border-default);border-radius:var(--radius-md);background:var(--color-bg-overlay);color:var(--color-text-primary);padding:var(--space-3) var(--space-4);font:inherit;transition:border-color var(--transition-fast),box-shadow var(--transition-fast)}
textarea:hover,input:hover,select:hover{border-color:var(--color-border-muted)}
textarea:focus,input:focus,select:focus{outline:none;border-color:var(--color-accent-primary);box-shadow:var(--shadow-glow-indigo)}
textarea{min-height:96px;resize:vertical}
.actions{display:flex;flex-wrap:wrap;gap:var(--space-2)}
.progress-track{height:8px;max-width:340px;background:var(--color-bg-overlay);border:1px solid var(--color-border-subtle);border-radius:var(--radius-full);margin-top:var(--space-3);overflow:hidden}
.progress-track span{display:block;height:100%;background:linear-gradient(90deg,var(--color-accent-primary),var(--color-success));transition:width var(--transition-base)}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:var(--space-4);margin:0 0 var(--space-6)}
.stats div,.mini-card{border:1px solid var(--color-border-subtle);border-radius:var(--radius-lg);background:var(--color-bg-raised);padding:var(--space-6);transition:transform var(--transition-base),border-color var(--transition-fast)}
.stats div{font-size:var(--text-4xl);font-weight:var(--font-bold);letter-spacing:var(--tracking-tight);color:var(--color-text-primary)}
.stats div:hover,.mini-card:hover{border-color:var(--color-border-muted);transform:translateY(-1px)}
.stats span{display:block;color:var(--color-text-muted);font-size:var(--text-xs);font-weight:var(--font-semibold);text-transform:uppercase;letter-spacing:var(--tracking-wide);margin-top:var(--space-1)}
.mini-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:var(--space-4)}
.mini-card h3{margin:0 0 var(--space-2);font-size:var(--text-lg);font-weight:var(--font-bold)}
.mini-card p{color:var(--color-text-secondary);font-size:var(--text-sm);line-height:var(--leading-normal);margin:0 0 var(--space-3)}
.mini-card small{color:var(--color-text-muted);font-size:var(--text-xs)}
.question-card h3{font-size:var(--text-base);line-height:var(--leading-snug);font-weight:var(--font-semibold);display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow:hidden}
.mini-card.is-archived{opacity:.5}
.timeline-list{display:grid;gap:var(--space-3)}
.timeline-row{display:grid;grid-template-columns:110px minmax(0,1fr) minmax(120px,.55fr);gap:var(--space-3);align-items:center;border:1px solid var(--color-border-subtle);border-radius:var(--radius-md);background:var(--color-bg-overlay);padding:var(--space-3) var(--space-4);transition:background var(--transition-fast),border-color var(--transition-fast)}
.timeline-row:hover{border-color:var(--color-border-muted);background:var(--color-bg-hover)}
.timeline-row span{color:var(--color-info);text-transform:uppercase;font-size:var(--text-xs);font-weight:var(--font-bold);letter-spacing:var(--tracking-wider)}
.timeline-row small,.graph-node small{color:var(--color-text-muted);font-size:var(--text-xs)}
.section-head{display:flex;justify-content:space-between;gap:var(--space-4);align-items:start;margin-bottom:var(--space-5)}
.section-head h2{margin:0;font-size:var(--text-xl);font-weight:var(--font-bold)}
.section-head p{color:var(--color-text-secondary);margin:var(--space-2) 0 0;font-size:var(--text-sm);line-height:var(--leading-snug)}
.graph-map-panel{overflow:hidden}
.graph-legend{display:flex;flex-wrap:wrap;gap:var(--space-2);margin:var(--space-3) 0 var(--space-4)}
.graph-legend span{border:1px solid var(--color-info-border);border-radius:var(--radius-full);background:var(--color-info-bg);color:var(--color-info);padding:var(--space-1) var(--space-3);font-size:var(--text-xs);font-weight:var(--font-semibold)}
.graph-map{width:100%;height:auto;border:1px solid var(--color-border-subtle);border-radius:var(--radius-lg);background:var(--color-bg-base)}
.graph-lane-bg{fill:var(--color-bg-overlay);stroke:var(--color-border-subtle);stroke-width:1}
.graph-lane-title{fill:var(--color-text-secondary);font-size:var(--text-xs);font-weight:var(--font-bold);letter-spacing:var(--tracking-wider);text-transform:uppercase}
.graph-edge{fill:none;stroke:var(--color-accent-primary);stroke-width:1.5;stroke-opacity:.4;marker-end:url(#arrow)}
.graph-map-node rect{fill:var(--color-bg-raised);stroke:var(--color-accent-primary-border);stroke-width:1.5;rx:8;ry:8;transition:stroke var(--transition-fast),fill var(--transition-fast)}
.graph-map-node:hover rect{stroke:var(--color-success-border);fill:var(--color-success-bg)}
.graph-node-type{fill:var(--color-text-muted);font-size:9px;font-weight:var(--font-bold);text-transform:uppercase;letter-spacing:var(--tracking-wider)}
.graph-node-label{fill:var(--color-text-primary);font-size:11px;font-weight:var(--font-semibold)}
.graph-node-label-wrap{font:600 11px/1.25 Inter,system-ui,sans-serif;color:var(--color-text-primary);word-wrap:break-word;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.map-course-link.is-active,.history-type-chip.is-active{border-color:var(--color-accent-primary-border);color:var(--color-accent-primary)}
.history-activity-row time{display:block;font-size:var(--text-xs);color:var(--color-text-muted);margin-top:var(--space-1)}
.learn-more{margin:var(--space-3) 0;border:1px solid var(--color-border-subtle);border-radius:var(--radius-md);background:var(--color-bg-base);padding:var(--space-3) var(--space-4)}
.learn-more-summary{display:flex;align-items:center;justify-content:space-between;gap:var(--space-3);cursor:pointer;color:var(--color-text-primary);font-weight:var(--font-semibold);list-style:none}
.learn-more-summary::-webkit-details-marker{display:none}
.learn-more-copy{padding:var(--space-1) var(--space-3);font-size:var(--text-xs);flex-shrink:0}
.learn-more-body{color:var(--color-text-primary);font-size:var(--text-sm);line-height:var(--leading-relaxed);margin-top:var(--space-3)}
.markdown-body h1,.markdown-body h2,.markdown-body h3,.markdown-body h4{margin:var(--space-4) 0 var(--space-2);font-weight:var(--font-bold);line-height:var(--leading-snug);color:var(--color-text-primary)}
.markdown-body h1{font-size:var(--text-xl)}
.markdown-body h2{font-size:var(--text-lg)}
.markdown-body h3{font-size:var(--text-base)}
.markdown-body p{margin:0 0 var(--space-3);color:var(--color-text-primary)}
.markdown-body ul,.markdown-body ol{margin:0 0 var(--space-3);padding-left:var(--space-5);color:var(--color-text-primary)}
.markdown-body li{margin:var(--space-1) 0}
.markdown-body code{font-family:var(--font-mono);font-size:0.92em;background:var(--color-bg-overlay);border:1px solid var(--color-border-subtle);border-radius:var(--radius-sm);padding:0.1em 0.35em;color:var(--color-info)}
.markdown-body pre{margin:0 0 var(--space-3);overflow:auto;background:var(--color-bg-overlay);border:1px solid var(--color-border-subtle);border-radius:var(--radius-md);padding:var(--space-3)}
.markdown-body pre code{display:block;border:0;padding:0;background:transparent;color:var(--color-text-primary);font-size:var(--text-sm);white-space:pre-wrap}
.markdown-body a{color:var(--color-text-link)}
.short-answer{font-size:var(--text-base);line-height:var(--leading-relaxed)}
.graph-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:var(--space-4)}
.graph-column{border:1px solid var(--color-border-subtle);border-radius:var(--radius-lg);background:var(--color-bg-overlay);padding:var(--space-5)}
.graph-node{border:1px solid var(--color-border-subtle);border-radius:var(--radius-md);background:var(--color-bg-raised);padding:var(--space-3) var(--space-4);margin:var(--space-2) 0;display:grid;gap:var(--space-2);transition:background var(--transition-fast),border-color var(--transition-fast)}
.graph-node:hover{border-color:var(--color-border-muted);background:var(--color-bg-hover);transform:translateY(-1px)}
.graph-node strong{display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden;font-size:var(--text-sm);font-weight:var(--font-semibold)}
.choices{display:grid;gap:var(--space-3);margin:var(--space-3) 0}
.choice{display:flex;gap:var(--space-3);padding:var(--space-3) var(--space-4);border:1px solid var(--color-border-subtle);border-radius:var(--radius-md);background:var(--color-bg-overlay);transition:background var(--transition-fast),border-color var(--transition-fast)}
.choice:hover{border-color:var(--color-border-muted);background:var(--color-bg-hover)}
.choice input{width:auto;margin-top:4px}
.choice small{display:block;color:var(--color-text-muted);margin-top:var(--space-1);line-height:var(--leading-normal);font-size:var(--text-xs)}
pre{overflow:auto;background:var(--color-bg-overlay);border:1px solid var(--color-border-subtle);border-radius:var(--radius-md);padding:var(--space-4);font-family:var(--font-mono);font-size:var(--text-sm);line-height:var(--leading-normal)}
.onboarding-panel,.plan-builder-panel{border-color:var(--color-accent-primary-border);background:linear-gradient(180deg,var(--color-accent-primary-bg),var(--color-bg-raised))}
.review-source-toolbar{align-items:stretch}
.review-source-controls{display:grid;grid-template-columns:minmax(260px,1fr) auto;gap:var(--space-3);align-items:end;flex:1}
.review-source-controls .actions{justify-content:flex-end}
.review-source-field{max-width:520px}
.review-source-controls .setup-note{max-width:620px;margin:var(--space-2) 0 0}
.onboarding-steps,.plan-path{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:var(--space-3);list-style:none;margin:var(--space-4) 0 0;padding:0}
.onboarding-step,.plan-step{display:grid;grid-template-columns:38px minmax(0,1fr);gap:var(--space-3);border:1px solid var(--color-border-subtle);border-radius:var(--radius-lg);background:var(--color-bg-overlay);padding:var(--space-4);transition:background var(--transition-fast),border-color var(--transition-fast)}
.onboarding-step:hover,.plan-step:hover{border-color:var(--color-border-muted);background:var(--color-bg-hover)}
.onboarding-step>span,.plan-step>span{display:grid;place-items:center;width:30px;height:30px;border-radius:var(--radius-full);background:var(--color-bg-hover);color:var(--color-text-secondary);font-weight:var(--font-bold);font-size:var(--text-sm)}
.onboarding-step.is-done>span,.plan-step.is-done>span{background:var(--color-success-bg);color:var(--color-success)}
.onboarding-step.is-done,.plan-step.is-done{border-color:var(--color-success-border)}
.onboarding-step p,.plan-step p{color:var(--color-text-secondary);margin:var(--space-1) 0 var(--space-2);font-size:var(--text-sm);line-height:var(--leading-snug)}
.onboarding-step code{display:block;white-space:normal;word-break:break-word;color:var(--color-warning);background:var(--color-bg-overlay);border:1px solid var(--color-border-subtle);border-radius:var(--radius-sm);padding:var(--space-2) var(--space-3);font-size:var(--text-xs);font-family:var(--font-mono)}
.setup-note{color:var(--color-text-secondary);background:var(--color-bg-overlay);border:1px solid var(--color-border-subtle);border-radius:var(--radius-md);padding:var(--space-3) var(--space-4);font-size:var(--text-sm);line-height:var(--leading-snug)}
.filter-panel .actions{margin-top:var(--space-3)}
.filter-panel button[aria-pressed="true"]{background:var(--color-accent-primary);color:#fff;border-color:var(--color-accent-primary)}
.is-filtered-out{display:none!important}
.workbench-layout{display:grid;grid-template-columns:1fr 340px;gap:var(--space-6);align-items:start}
.workbench-map{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:var(--space-3);margin-top:var(--space-4)}
.workbench-drawer{position:sticky;top:calc(48px + var(--space-6));border:1px solid var(--color-border-subtle);border-radius:var(--radius-lg);background:var(--color-bg-raised);padding:var(--space-6);box-shadow:var(--shadow-sm)}
.workbench-drawer h2{margin:var(--space-1) 0 var(--space-2);font-size:var(--text-xl);font-weight:var(--font-bold)}
.workbench-drawer p{color:var(--color-text-secondary);font-size:var(--text-sm);line-height:var(--leading-normal)}
.visual-node{display:grid;text-align:left;gap:var(--space-2);border:1px solid var(--color-border-subtle);border-radius:var(--radius-lg);min-height:112px;align-content:start;background:var(--color-bg-overlay);padding:var(--space-3) var(--space-4);transition:transform var(--transition-base),border-color var(--transition-fast),box-shadow var(--transition-base);cursor:pointer;font-family:inherit}
.visual-node:hover{transform:scale(1.02);border-color:var(--color-border-muted);box-shadow:var(--shadow-glow-indigo)}
.visual-node span{font-size:var(--text-xs);text-transform:uppercase;letter-spacing:var(--tracking-wider);color:var(--color-text-muted);font-weight:var(--font-bold)}
.visual-node strong{font-size:var(--text-sm);font-weight:var(--font-semibold);color:var(--color-text-primary)}
.visual-node small{color:var(--color-info);font-size:var(--text-xs);font-weight:var(--font-medium)}
.node-concept{border-color:var(--color-concept-border);background:linear-gradient(180deg,var(--color-concept-bg),var(--color-bg-overlay))}
.node-card{border-color:var(--color-accent-primary-border);background:linear-gradient(180deg,var(--color-accent-primary-bg),var(--color-bg-overlay))}
.node-event,.node-probe{border-color:var(--color-warning-border);background:linear-gradient(180deg,var(--color-warning-bg),var(--color-bg-overlay))}
.node-evidence{border-color:var(--color-info-border);background:linear-gradient(180deg,var(--color-info-bg),var(--color-bg-overlay))}
.node-study{border-color:var(--color-concept-border);background:linear-gradient(180deg,var(--color-concept-bg),var(--color-bg-overlay))}
.inline-field{display:grid;gap:var(--space-2);max-width:440px;margin-top:var(--space-3);color:var(--color-text-primary);font-weight:var(--font-semibold);font-size:var(--text-sm)}
.preferences-wizard code{color:var(--color-warning);font-family:var(--font-mono)}
.preset-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:var(--space-3);margin-top:var(--space-4)}
.preset-card{display:grid;gap:var(--space-3);align-content:space-between;border:1px solid var(--color-border-subtle);border-radius:var(--radius-lg);background:var(--color-bg-overlay);padding:var(--space-5);transition:transform var(--transition-base),border-color var(--transition-fast)}
.preset-card:hover{border-color:var(--color-border-muted);background:var(--color-bg-hover);transform:translateY(-1px)}
.preset-card p{color:var(--color-text-secondary);margin:var(--space-1) 0 var(--space-2);font-size:var(--text-sm);line-height:var(--leading-normal)}
.preset-card small{display:block;color:var(--color-info);line-height:var(--leading-normal);font-size:var(--text-xs);font-weight:var(--font-medium)}
.preference-controls{display:grid;grid-template-columns:minmax(180px,280px) minmax(260px,1fr);gap:var(--space-5);margin:var(--space-4) 0;align-items:start}
.map-tabs .actions{display:flex;flex-wrap:wrap;gap:var(--space-2)}
.map-tabs a.is-active{background:var(--color-bg-selected);border-color:var(--color-border-emphasis);color:var(--color-text-primary)}
.map-mode-bar{display:flex;flex-wrap:wrap;justify-content:space-between;gap:var(--space-4);align-items:center;padding:var(--space-3) var(--space-5);margin:0 0 var(--space-6);background:var(--color-bg-raised);border:1px solid var(--color-border-subtle);border-radius:var(--radius-lg)}
.map-mode-bar--shell{margin:0;border-radius:0;border-left:0;border-right:0;border-top:0;background:var(--color-bg-base);padding:var(--space-2) var(--space-6)}
.map-mode-copy strong{display:block;font-size:var(--text-sm)}
.map-mode-copy p{margin:var(--space-1) 0 0;color:var(--color-text-secondary);font-size:var(--text-sm)}
.map-mode-tabs{display:flex;flex-wrap:wrap;gap:var(--space-2)}
.map-mode-tab{display:inline-flex;padding:var(--space-2) var(--space-3);font-size:var(--text-sm);font-weight:var(--font-medium);color:var(--color-text-secondary);text-decoration:none;border-radius:var(--radius-full);border:1px solid transparent}
.map-mode-tab:hover{color:var(--color-text-primary);background:var(--color-bg-hover)}
.map-mode-tab.is-active,.map-mode-tab[aria-current="page"]{color:var(--color-text-primary);background:var(--color-bg-selected);border-color:var(--color-border-emphasis)}
.provenance-flow-legend{display:flex;flex-wrap:wrap;gap:var(--space-2);align-items:center;margin:0 0 var(--space-4);color:var(--color-text-secondary);font-size:var(--text-xs);font-weight:var(--font-semibold);text-transform:uppercase;letter-spacing:var(--tracking-wider)}
.provenance-flow-legend span:nth-child(odd){padding:var(--space-1) var(--space-3);border-radius:var(--radius-full);border:1px solid var(--color-border-subtle);background:var(--color-bg-overlay)}
.skill-heatmap{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:var(--space-3)}
.skill-cell{border:1px solid var(--color-border-subtle);border-radius:var(--radius-md);padding:var(--space-3) var(--space-4);min-height:84px}
.skill-cell strong{display:block;font-size:var(--text-sm);margin-bottom:var(--space-1)}
.skill-cell small{font-size:var(--text-xs);color:var(--color-text-secondary)}
.skill-confident{border-color:var(--color-success-border);background:var(--color-success-bg)}
.skill-learning{border-color:var(--color-warning-border);background:var(--color-warning-bg)}
.skill-weak{border-color:var(--color-danger-border);background:var(--color-danger-bg)}
.skill-new{border-color:var(--color-border-subtle);background:var(--color-bg-overlay);color:var(--color-text-secondary)}
.learning-path-panel{margin-bottom:var(--space-6)}
.learning-path-scroll{overflow:auto;border:1px solid var(--color-border-subtle);border-radius:var(--radius-lg);background:var(--color-bg-overlay);min-height:480px;-webkit-overflow-scrolling:touch}
.learning-path-cy{width:100%;min-height:480px;height:520px}
.learning-path-legend{display:flex;flex-wrap:wrap;gap:var(--space-2);margin:0 0 var(--space-4)}
.learning-path-legend-item{display:inline-flex;align-items:center;padding:var(--space-1) var(--space-3);border-radius:var(--radius-full);font-size:var(--text-xs);font-weight:var(--font-semibold);border:1px solid var(--color-border-subtle)}
.learning-path-order{margin:0;padding-left:var(--space-6);display:grid;gap:var(--space-3)}
.learning-path-order li{display:grid;gap:var(--space-1)}
.learning-path-order small{color:var(--color-text-secondary);font-size:var(--text-xs)}
.learning-path-cycle{color:var(--color-warning)}
.graph-map-node.is-dimmed{opacity:.4}
.graph-map-node.is-focused rect{stroke:var(--color-success-border);fill:var(--color-success-bg)}
.graph-map-node-rollup rect{stroke-dasharray:4 3;fill:var(--color-bg-surface)}
.graph-map-node-rollup .graph-node-label{fill:var(--color-text-muted)}
.graph-overflow-note{margin:0 0 var(--space-3)}
.btn-primary{display:inline-flex;align-items:center;justify-content:center;padding:var(--space-2) var(--space-4);font-size:var(--text-sm);font-weight:var(--font-semibold);text-decoration:none;border-radius:var(--radius-md);border:1px solid var(--color-accent-primary);background:var(--color-accent-primary);color:#fff;transition:background var(--transition-fast),transform var(--transition-base)}
.btn-primary:hover{background:var(--color-accent-primary-hover);transform:translateY(-1px);text-decoration:none}
.workbench-main{display:grid;gap:var(--space-6)}
.workbench-hero{margin:0}
.workbench-stats{margin:0}
.visual-node.is-dimmed{opacity:.45;transform:none}
.visual-node.is-focused{box-shadow:var(--shadow-glow-indigo);border-color:var(--color-border-emphasis)}
.practice-hero{margin-bottom:var(--space-4)}
.practice-focus-header{margin:0 0 var(--space-4)}
.practice-focus-header .practice-progress{height:6px;max-width:none;margin:0;border-radius:0;border-left:0;border-right:0}
body.practice-focus-shell .app-subnav{display:none}
body.practice-focus-shell .content-area{max-width:var(--max-w-md);padding-top:var(--space-4)}
body.practice-focus-shell .status{font-size:var(--text-xs);padding:var(--space-1) var(--space-4)}
.practice-focus-footer{margin-top:var(--space-4);text-align:center}
.practice-queue-footer{margin-top:var(--space-4);padding:var(--space-3) 0;border-top:1px solid var(--color-border-muted)}
.practice-queue-nav{display:flex;align-items:center;justify-content:space-between;gap:var(--space-3);margin-bottom:var(--space-2)}
.practice-queue-position{font-size:var(--text-sm);color:var(--color-text-muted)}
.practice-nav-btn.is-disabled{opacity:.4;pointer-events:none;font-size:var(--text-sm)}
.practice-position{text-align:center;font-size:var(--text-sm);color:var(--color-text-muted);margin-bottom:var(--space-2)}
.practice-shortcuts{margin:0;text-align:center;color:var(--color-text-muted);font-size:var(--text-xs);line-height:var(--leading-normal)}
.page-intro{margin:0 0 var(--space-6);padding:0 0 var(--space-4);border-bottom:1px solid var(--color-border-subtle)}
.page-intro h1{font-size:var(--text-2xl);line-height:var(--leading-tight);margin:var(--space-1) 0 var(--space-2);letter-spacing:var(--tracking-tight);font-weight:var(--font-bold)}
.page-intro p{color:var(--color-text-secondary);font-size:var(--text-sm);line-height:var(--leading-normal);margin:0;max-width:52rem}
.page-intro-stats{display:flex;flex-wrap:wrap;gap:var(--space-3);margin-bottom:var(--space-3)}
.page-intro-stats span{font-family:var(--font-mono);font-size:var(--text-xs);color:var(--color-text-secondary);padding:var(--space-1) var(--space-3);border:1px solid var(--color-border-subtle);border-radius:var(--radius-full);background:var(--color-bg-overlay)}
.mix-presets{display:flex;flex-wrap:wrap;gap:var(--space-2);margin:var(--space-3) 0}
.drawer-path{display:block;margin:var(--space-3) 0;padding:var(--space-2) var(--space-3);font-family:var(--font-mono);font-size:var(--text-xs);color:var(--color-info);background:var(--color-bg-overlay);border:1px solid var(--color-border-subtle);border-radius:var(--radius-sm);word-break:break-all}
.drawer-mastery{margin:var(--space-2) 0;color:var(--color-text-secondary);font-size:var(--text-sm);font-weight:var(--font-semibold)}
#workbench-detail-cta{margin-top:var(--space-4)}
body.surface-practice .app-subnav [data-group]:not([data-group="practice"]){opacity:.38}
body.surface-map .app-subnav [data-group]:not([data-group="map"]){opacity:.38}
body.surface-audit .app-subnav [data-group]:not([data-group="audit"]){opacity:.38}
body.surface-setup .app-subnav [data-group]:not([data-group="setup"]){opacity:.38}
body.surface-workbench .app-subnav [data-group]{opacity:.38}
body[class*="surface-"] .app-subnav [data-group][data-group]{transition:opacity var(--transition-fast)}
body[class*="surface-"] .app-subnav [data-group]:hover,body[class*="surface-"] .app-subnav a[data-group]:hover{opacity:1}
.practice-title{font-size:var(--text-lg);line-height:var(--leading-snug)}
.practice-question p{font-size:var(--text-lg);line-height:var(--leading-relaxed)}
.shortcut-hint{display:inline-flex;align-items:center;justify-content:center;min-width:1.25rem;padding:0 var(--space-1);margin-left:var(--space-1);border-radius:var(--radius-sm);border:1px solid var(--color-border-muted);background:var(--color-bg-overlay);font-size:var(--text-xs);font-family:var(--font-mono);font-weight:var(--font-bold);line-height:1.4}
.setup-steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:var(--space-3);list-style:none;margin:var(--space-4) 0 0;padding:0}
.setup-step{display:grid;grid-template-columns:38px minmax(0,1fr);gap:var(--space-3);border:1px solid var(--color-border-subtle);border-radius:var(--radius-lg);background:var(--color-bg-overlay);padding:var(--space-4)}
.setup-step>span{display:grid;place-items:center;width:30px;height:30px;border-radius:var(--radius-full);background:var(--color-bg-hover);color:var(--color-text-secondary);font-weight:var(--font-bold);font-size:var(--text-sm)}
.setup-step.is-done>span{background:var(--color-success-bg);color:var(--color-success)}
.setup-step.is-done{border-color:var(--color-success-border)}
.pipeline-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:var(--space-4)}
.pipeline-card{display:grid;gap:var(--space-2);text-align:left;border:1px solid var(--color-border-subtle);border-radius:var(--radius-lg);background:var(--color-bg-raised);padding:var(--space-5);cursor:pointer;transition:transform var(--transition-base),border-color var(--transition-fast)}
.pipeline-card:hover{transform:translateY(-1px);border-color:var(--color-border-muted)}
.pipeline-card strong{font-size:var(--text-4xl);letter-spacing:var(--tracking-tight)}
.pipeline-card p{margin:0;font-size:var(--text-sm);font-weight:var(--font-semibold)}
.pipeline-card small{color:var(--color-text-secondary);font-size:var(--text-xs);line-height:var(--leading-snug)}
.pipeline-draft{border-color:var(--color-info-border);background:linear-gradient(180deg,var(--color-info-bg),var(--color-bg-raised))}
.pipeline-accepted{border-color:var(--color-success-border);background:linear-gradient(180deg,var(--color-success-bg),var(--color-bg-raised))}
.pipeline-rejected{border-color:var(--color-danger-border);background:linear-gradient(180deg,var(--color-danger-bg),var(--color-bg-raised))}
.pipeline-quality{border-color:var(--color-warning-border);background:linear-gradient(180deg,var(--color-warning-bg),var(--color-bg-raised))}
.audit-split{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--space-4);margin:0 0 var(--space-6)}
.audit-source-grid{grid-template-columns:repeat(2,minmax(0,1fr));margin-top:var(--space-4)}
.calibration-chart{display:grid;gap:var(--space-3)}
.calibration-row{display:grid;grid-template-columns:88px 1fr auto;gap:var(--space-3);align-items:center;font-size:var(--text-sm)}
.calibration-bar{height:8px;border-radius:var(--radius-full);background:var(--color-bg-overlay);border:1px solid var(--color-border-subtle);overflow:hidden}
.calibration-bar span{display:block;height:100%;background:linear-gradient(90deg,var(--color-accent-primary),var(--color-success))}
.audit-list{margin:0;padding-left:var(--space-5);color:var(--color-text-secondary);font-size:var(--text-sm);line-height:var(--leading-relaxed)}
.modal-overlay{position:fixed;inset:0;z-index:50;display:grid;place-items:center;padding:var(--space-6);background:rgba(1,4,9,0.72)}
.modal-overlay.is-hidden{display:none}
.modal-panel{width:min(720px,100%);max-height:80vh;overflow:auto;border:1px solid var(--color-border-subtle);border-radius:var(--radius-lg);background:var(--color-bg-raised);box-shadow:var(--shadow-lg)}
.modal-head{display:flex;justify-content:space-between;gap:var(--space-3);align-items:center;padding:var(--space-5);border-bottom:1px solid var(--color-border-subtle)}
.modal-head h2{margin:0;font-size:var(--text-xl)}
.modal-body{padding:var(--space-5)}
.form-grid{display:grid;gap:var(--space-3)}
@media(max-width:768px){
  .global-header{grid-template-columns:1fr;grid-template-rows:auto auto;height:auto;padding:var(--space-3) var(--space-4);gap:var(--space-2)}
  .app-nav{justify-content:flex-start}
  .header-metrics{justify-content:flex-start}
  .content-area{padding:var(--space-4) var(--space-4) var(--space-12)}
  .hero{grid-template-columns:1fr;padding:var(--space-6)}
  .hero h1{font-size:var(--text-2xl)}
  .review-source-controls{grid-template-columns:1fr}
  .review-source-controls .actions{justify-content:flex-start}
  .workbench-layout{grid-template-columns:1fr}
  .workbench-drawer{position:static}
  .pipeline-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .audit-split{grid-template-columns:1fr}
}
${diffSnippetCss()}`;
}

function script(): string {
  return `
function status(text){document.getElementById('status').textContent=text;}
async function post(path, body){const res=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const json=await res.json();status(json.ok?'Saved locally':json.error||'Request failed');return json;}
async function put(path, body){const res=await fetch(path,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const json=await res.json();status(json.ok?'Preferences saved':'Could not save preferences');return json;}
function csv(value){return String(value||'').split(',').map((item)=>item.trim()).filter(Boolean);}
function countActiveCards(state){return (state.learningItems||[]).filter((item)=>item.status!=='archived').length;}
function shellNext(state){const concepts=(state.concepts||[]).length;const courses=(state.courses||[]).length;const accepted=(state.questionBank||[]).filter((entry)=>entry.status==='accepted').length;const active=countActiveCards(state);if(!concepts)return {label:'Next: ingest local evidence',href:'/timeline'};if(!courses)return {label:'Next: create a course goal',href:'/courses'};if(!accepted)return {label:'Next: accept useful questions',href:'/questions'};if(!active)return {label:'Next: generate review cards',href:'/'};return {label:'Next: focused practice',href:'/practice'};}
function primaryNavHref(path){if(path==='/workbench')return '/workbench';if(path==='/'||path==='/practice'||path==='/study')return '/practice';if(path==='/map'||path==='/graph'||path==='/timeline'||path==='/progress')return '/map';if(path==='/audit'||path==='/history'||path==='/questions')return '/audit';if(path==='/plan'||path==='/courses'||path==='/preferences')return '/plan';return path;}
function activateShellNav(){const path=location.pathname==='/'?'/':location.pathname;const primary=primaryNavHref(path);document.querySelectorAll('.app-nav a').forEach((link)=>{const active=link.getAttribute('href')===primary;if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});document.querySelectorAll('.app-subnav a').forEach((link)=>{const active=link.getAttribute('href')===path;if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});}
async function updateShellContext(){try{const res=await fetch('/api/state');if(!res.ok)throw new Error('state unavailable');const state=await res.json();const accepted=(state.questionBank||[]).filter((entry)=>entry.status==='accepted').length;const due=(state.delayedProbes||[]).filter((probe)=>probe.status==='scheduled'&&(!probe.dueAt||probe.dueAt<=new Date().toISOString())).length;const fields=[['shell-concepts',(state.concepts||[]).length],['shell-courses',(state.courses||[]).length],['shell-questions',accepted],['shell-cards',countActiveCards(state)],['shell-due-probes',due]];fields.forEach(([id,value])=>{const el=document.getElementById(id);if(el)el.textContent=String(value);});const next=shellNext(state);const action=document.getElementById('shell-next-action');if(action){action.textContent=next.label;action.setAttribute('href',next.href);}}catch(error){const action=document.getElementById('shell-next-action');if(action)action.textContent='Plan state unavailable';}}
function updateProgress(){const cards=[...document.querySelectorAll('.recall-card')];const done=cards.filter((card)=>card.classList.contains('completed')).length;const bar=document.getElementById('session-progress');if(bar&&cards.length){bar.style.width=Math.round(done/cards.length*100)+'%';}}
function markComplete(card,label){card.classList.add('completed');const state=card.querySelector('.card-state');if(state)state.textContent=label;card.querySelectorAll('.grade-actions button').forEach((button)=>button.disabled=true);const outcome=document.getElementById('practice-outcome');if(outcome)outcome.textContent='Outcome saved locally: confidence can be paired with correctness, delayed probes are scheduled after answered cards, and weak-concept estimates update from this grade.';updateProgress();if(document.body.classList.contains('practice-focus-shell')){advancePracticeQueue(card);}}
function advancePracticeQueue(card){const total=Number(document.body.dataset.practiceTotal||0);const itemId=card.dataset.item;let reviewed=(document.body.dataset.practiceReviewed||'').split(',').filter(Boolean);if(itemId&&!reviewed.includes(itemId))reviewed.push(itemId);if(total>0&&reviewed.length<total){const query='?reviewed='+encodeURIComponent(reviewed.join(','));setTimeout(()=>{location.href='/practice'+query;},350);}else{status('Practice session complete for this queue.');}}
async function copyLearnMore(button){const details=button.closest('.learn-more');const raw=details?.querySelector('.learn-more-raw')?.value||'';if(!raw)return;try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(raw);}else{const area=details.querySelector('.learn-more-raw');if(area){area.classList.remove('is-hidden');area.select();document.execCommand('copy');area.classList.add('is-hidden');}}status('Learn more copied to clipboard.');}catch(error){status('Could not copy learn-more text.');}}
function updatePreferenceSummary(){const enabled=[...document.querySelectorAll('input[data-plane]:checked')].map((input)=>input.dataset.plane);const snippet=document.getElementById('snippet-lines')?.value||14;const explanations=document.getElementById('show-explanations')?.checked?'on':'off';const summary=document.getElementById('preferences-summary');if(summary)summary.textContent='Current setup: '+enabled.length+' question categories · '+snippet+' snippet lines · explanations '+explanations+'.';}
document.addEventListener('click',async(event)=>{const target=event.target;if(!(target instanceof Element))return;if(target.closest('[data-action="copy-learn-more"]')){event.preventDefault();await copyLearnMore(target.closest('[data-action="copy-learn-more"]'));return;}const button=target.closest('button');if(!button)return;if(button.dataset.action==='timeline-filter'){const type=button.dataset.filterType||'all';const rows=[...document.querySelectorAll('[data-node-type]')];rows.forEach((row)=>row.classList.toggle('is-filtered-out',type!=='all'&&row.dataset.nodeType!==type));document.querySelectorAll('[data-action="timeline-filter"]').forEach((chip)=>chip.setAttribute('aria-pressed',String(chip===button)));const note=document.getElementById('timeline-filter-note');if(note)note.textContent=type==='all'?'Showing all timeline nodes.':'Showing '+rows.filter((row)=>row.dataset.nodeType===type).length+' '+type+' timeline nodes.';status(type==='all'?'Timeline filter cleared':'Timeline filtered to '+type);return;}if(button.dataset.action==='graph-filter'){const type=button.dataset.filterType||'all';const columns=[...document.querySelectorAll('[data-graph-type]')];columns.forEach((column)=>column.classList.toggle('is-filtered-out',type!=='all'&&column.dataset.graphType!==type));document.querySelectorAll('[data-action="graph-filter"]').forEach((chip)=>chip.setAttribute('aria-pressed',String(chip===button)));const note=document.getElementById('graph-filter-note');if(note)note.textContent=type==='all'?'Showing all graph lanes.':'Showing the '+type+' graph lane.';status(type==='all'?'Graph filter cleared':'Graph focused on '+type);return;}if(button.dataset.action==='generate-cards'){button.disabled=true;const courseId=document.getElementById('review-course')?.value||undefined;status(courseId?'Generating course cards...':'Generating cards...');const json=await post('/api/cards/generate',{count:5,mode:button.dataset.mode,reason:courseId?'website selected course':'website button',courseId});if(json.ok) location.reload();return;}if(button.dataset.action==='preferences-preset'){const planes=String(button.dataset.planes||'').split(',').filter(Boolean);document.querySelectorAll('input[data-plane]').forEach((input)=>{input.checked=planes.includes(input.dataset.plane);});const snippet=document.getElementById('snippet-lines');if(snippet)snippet.value=button.dataset.snippetLines||snippet.value;const explanations=document.getElementById('show-explanations');if(explanations)explanations.checked=button.dataset.showExplanations==='true';updatePreferenceSummary();status('Preset applied locally. Save preferences to keep it.');return;}if(button.dataset.action==='save-preferences'){const enabledPlanes=[...document.querySelectorAll('input[data-plane]:checked')].map((input)=>input.dataset.plane);const snippetLineCount=Number(document.getElementById('snippet-lines').value||14);const showExplanationsByDefault=document.getElementById('show-explanations').checked;await put('/api/preferences',{review:{enabledPlanes,snippetLineCount,showExplanationsByDefault}});updatePreferenceSummary();return;}if(button.dataset.action==='save-course'){const title=document.getElementById('course-title').value;const goal=document.getElementById('course-goal').value;if(!title||!goal){status('Course title and goal are required.');return;}const json=await post('/api/courses',{id:document.getElementById('course-id').value,title,goal,materialPaths:csv(document.getElementById('course-materials').value),docPaths:csv(document.getElementById('course-docs').value)});if(json.ok)location.reload();return;}if(button.dataset.action==='draft-questions'){const courseId=document.getElementById('question-course')?.value||undefined;const json=await post('/api/questions/draft',{provider:'fake',count:5,courseId});if(json.ok)location.reload();return;}if(button.dataset.action==='question-status'){const json=await post('/api/questions/status',{id:button.dataset.question,status:button.dataset.status});if(json.ok)location.reload();return;}const card=button.closest('.recall-card');if(!card)return;const itemId=card.dataset.item;const textarea=card.querySelector('textarea');if(button.dataset.action==='reveal'){const selectedConfidence=card.querySelector('input[name="confidence-'+itemId+'"]:checked');if(!selectedConfidence){status('Choose confidence before reveal.');return;}const confidenceBeforeReveal=Number(selectedConfidence.value);const json=await post('/feedback',{itemId,eventType:'revealed',confidenceBeforeReveal,note:'confidence before reveal'});if(!json.ok)return;card.querySelector('.reveal-panel')?.classList.remove('is-hidden');button.disabled=true;status('Explanation revealed. Self-grade when ready.');return;}if(button.dataset.action==='answer-grade'){const correct=button.dataset.correct==='true';const answer=textarea.value.trim();if(correct&&!answer){status('Write an answer before marking this as known.');textarea.focus();return;}const json=await post('/answer',{itemId,answer:answer||'I missed this after reveal.',correct});if(json.ok)markComplete(card,correct?'knew it':'missed it');return;}if(button.dataset.action==='feedback'){const json=await post('/feedback',{itemId,eventType:button.dataset.event,note:'from local review session'});if(json.ok)markComplete(card,button.dataset.event==='marked_bad_card'?'quality issue':button.textContent.trim().toLowerCase());}});
activateShellNav();updateShellContext();updateProgress();`;
}

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

function safeJsonEmbed(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
}
