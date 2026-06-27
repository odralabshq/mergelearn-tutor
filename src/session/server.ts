import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { summarizeCalibration } from '../core/calibration.js';
import { coursesSummary, upsertCourse } from '../core/courses.js';
import { evaluateCardQuality } from '../core/cardQuality.js';
import { diffSnippetCss, renderDiffSnippetHtml } from '../core/diffView.js';
import { buildEvidenceTimeline, graphByType } from '../core/evidenceTimeline.js';
import { addCorrection, recordReviewEvent } from '../core/events.js';
import { activeLearningItems, generateCardBatch, recordAnswer } from '../core/planner.js';
import { loadPreferences, normalizePreferences, savePreferences } from '../core/preferences.js';
import { buildProgressGraph } from '../core/progress.js';
import { draftQuestionsForCourse, questionSummary, updateQuestionStatus } from '../core/questions.js';
import { renderProgress, renderToday } from '../core/render.js';
import { loadState, saveState } from '../core/store.js';
import type { CardQualityResult, CorrectionType, EvidenceTimelineNode, LearningItem, QuestionBankEntry, ReviewEventType, TutorState, UserPreferences } from '../core/types.js';

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
  if (method === 'GET' && url.pathname === '/plan') return sendHtml(res, 200, renderPlanHtml(await loadState(repoPath)));
  if (method === 'GET' && url.pathname === '/courses') return sendHtml(res, 200, renderCoursesHtml(await loadState(repoPath)));
  if (method === 'GET' && url.pathname === '/questions') return sendHtml(res, 200, renderQuestionsHtml(await loadState(repoPath)));
  if (method === 'GET' && url.pathname === '/timeline') return sendHtml(res, 200, renderTimelineHtml(await loadState(repoPath)));
  if (method === 'GET' && url.pathname === '/graph') return sendHtml(res, 200, renderGraphHtml(await loadState(repoPath)));
  if (method === 'GET' && url.pathname === '/progress') return sendHtml(res, 200, renderProgressHtml(await loadState(repoPath)));
  if (method === 'GET' && url.pathname === '/history') return sendHtml(res, 200, renderHistoryHtml(await loadState(repoPath)));
  if (method === 'GET' && url.pathname === '/preferences') return sendHtml(res, 200, renderPreferencesHtml(await loadPreferences(repoPath)));
  if (method === 'GET' && (url.pathname === '/state.json' || url.pathname === '/api/state')) return sendJson(res, 200, await loadState(repoPath));
  if (method === 'GET' && url.pathname === '/api/progress') return sendJson(res, 200, buildProgressGraph(await loadState(repoPath)));
  if (method === 'GET' && url.pathname === '/api/calibration') return sendJson(res, 200, summarizeCalibration(await loadState(repoPath)));
  if (method === 'GET' && url.pathname === '/api/cards/history') return sendJson(res, 200, cardHistoryData(await loadState(repoPath)));
  if (method === 'GET' && url.pathname === '/api/courses') return sendJson(res, 200, { courses: coursesSummary(await loadState(repoPath)) });
  if (method === 'GET' && url.pathname === '/api/questions') return sendJson(res, 200, questionBankData(await loadState(repoPath)));
  if (method === 'GET' && url.pathname === '/api/evidence-timeline') return sendJson(res, 200, buildEvidenceTimeline(await loadState(repoPath)));
  if (method === 'GET' && url.pathname === '/api/evidence-graph') return sendJson(res, 200, buildEvidenceTimeline(await loadState(repoPath)));
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
    const next = draftQuestionsForCourse(await loadState(repoPath), { courseId: body.courseId, provider: body.provider as never, model: body.model, count: body.count ?? 6 });
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
  return { concepts: state.concepts.length, cards: state.learningItems.length, activeCards: active, archivedCards: archived, batches: state.cardBatches.length, events: state.learningEvents.length, corrections: state.corrections.length };
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
        <p class="label">Explanation and expected focus</p>
        <p>${escapeHtml(item.explanationMarkdown)}</p>
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
  return pageShell('MergeLearn Tutor Review', `${hero}${renderStartHerePanel(state)}${controls}<section class="review-grid">${cards || '<p>No cards yet. Follow Start here to ingest evidence and generate your first cards.</p>'}</section>`, 'Ready');
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
  const next = steps.find((step) => !step.done) ?? steps.at(-1)!;
  const stepCards = steps.map((step, index) => `<li class="plan-step ${step.done ? 'is-done' : ''}"><span>${step.done ? '✓' : index + 1}</span><div><strong>${escapeHtml(step.label)}</strong><p>${escapeHtml(step.detail)}</p><a href="${step.href}">${escapeHtml(step.action)}</a></div></li>`).join('');
  const courseCards = courses.map((course) => `<article class="mini-card"><div class="card-topline"><span>${escapeHtml(course.id)}</span><span>${course.questionCount} questions</span><span>${course.activeCardCount} active</span></div><h3>${escapeHtml(course.title)}</h3><p>${escapeHtml(course.goal)}</p><small>${escapeHtml([...course.materialPaths, ...course.docPaths].join(', '))}</small></article>`).join('');
  return pageShell('MergeLearn Tutor Plan Builder', `<section class="hero"><div><p class="eyebrow">Learning plan</p><h1>Plan Builder connects setup to daily review</h1><p>Use this page as the single path from local evidence, to courses, to accepted questions, to review cards.</p></div><div class="hero-card"><strong>${courses.length}</strong><span>courses</span><strong>${acceptedQuestions}</strong><span>accepted questions</span></div></section>${nav()}<section class="panel plan-builder-panel"><div class="section-head"><div><p class="eyebrow">Next best action</p><h2>${escapeHtml(next.label)}</h2><p>${escapeHtml(next.detail)}</p></div><a class="ghost" href="${next.href}">${escapeHtml(next.action)}</a></div><ol class="plan-path">${stepCards}</ol></section><section class="panel"><div class="section-head"><div><p class="eyebrow">Local-only guardrails</p><h2>What this plan will and will not do</h2><p>The browser plan organizes already-local evidence. It does not enable remote LLM calls, publish data, or run target repo code.</p></div><a class="ghost" href="/graph">Trace graph</a></div><div class="mini-grid"><article class="mini-card"><strong>${state.concepts.length}</strong><p>Local concepts</p><small>Extracted from commits, docs, paths, and snippets.</small></article><article class="mini-card"><strong>${state.questionDraftBatches.length}</strong><p>Question draft batches</p><small>Fake/local drafts show network not used in their metadata.</small></article><article class="mini-card"><strong>${state.cardBatches.length}</strong><p>Card batches</p><small>Regenerated queues archive old cards instead of deleting history.</small></article><article class="mini-card"><strong>${state.learningEvents.length}</strong><p>Review events</p><small>Answers update mastery; quality feedback stays audited separately.</small></article></div></section><section class="panel"><div class="section-head"><div><h2>Course snapshot</h2><p>Courses are the bridge between repo evidence and the questions/cards you want next.</p></div><a class="ghost" href="/courses">Edit courses</a></div><div class="mini-grid">${courseCards || '<p>No courses yet. Create one to turn a fuzzy topic into a focused learning track.</p>'}</div></section>`, 'Plan Builder');
}

function renderCoursesHtml(state: TutorState): string {
  const courses = coursesSummary(state);
  const cards = courses.map((course) => `<article class="mini-card course-card"><div class="card-topline"><span>${course.id}</span><span>${course.enabledPlanes.length} planes</span></div><h3>${escapeHtml(course.title)}</h3><p>${escapeHtml(course.goal)}</p><p><strong>Materials</strong>: ${escapeHtml(course.materialPaths.join(', '))}</p><p><strong>Docs</strong>: ${escapeHtml(course.docPaths.join(', '))}</p><p>${course.questionCount} questions · ${course.activeCardCount} active cards</p><a class="ghost" href="/questions">Question bank</a><a class="ghost" href="/timeline">Evidence timeline</a></article>`).join('');
  return pageShell('MergeLearn Tutor Courses', `<section class="hero"><div><p class="eyebrow">Learning tracks</p><h1>Courses organize goals and material</h1><p>Each course defines what you are trying to learn, which repo paths/docs count as material, and which question categories should be prioritized.</p></div><div class="hero-card"><strong>${courses.length}</strong><span>courses</span><strong>${state.questionBank.filter((entry) => entry.status === 'accepted').length}</strong><span>accepted questions</span></div></section>${nav()}${renderCourseSetupGuide(state)}<section class="panel"><div class="section-head"><div><h2>Create or update a course</h2><p>Start broad, then narrow the paths after you see the first drafted questions.</p></div><a class="ghost" href="/preferences">Tune question mix</a></div><div class="form-grid"><input id="course-id" placeholder="optional id, e.g. learn-typescript" /><input id="course-title" placeholder="title, e.g. Understand session auth" /><textarea id="course-goal" placeholder="goal: explain how login state moves from API route to UI and tests"></textarea><input id="course-materials" placeholder="materials: src/**,tests/**" /><input id="course-docs" placeholder="docs: README.md,docs/**" /><button data-action="save-course">Save course</button></div><p class="setup-note">Tip: leave the id blank to auto-generate one. Materials and docs use comma-separated paths; defaults are src/**, tests/**, README.md, and docs/**.</p></section><section class="panel"><h2>Course tracks</h2><div class="mini-grid">${cards || '<p>No courses yet. Use the guided form above or CLI to create one.</p>'}</div></section>`, 'Courses');
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
  return pageShell('MergeLearn Tutor Questions', `<section class="hero"><div><p class="eyebrow">Question bank</p><h1>Evidence-bound LLM-style questions</h1><p>Drafts can be generated by fake/local providers, then accepted into the question bank before cards use them. Remote LLM is still gated.</p></div></section>${nav()}${metrics}${renderQuestionWorkflowGuide(state)}<section class="toolbar"><div><strong>Draft questions</strong><p>Choose a course, draft locally, accept the useful questions, then generate review cards.</p>${courseSelector}</div><button data-action="draft-questions">Draft 5 fake/local questions</button></section><section class="panel"><h2>Draft batches</h2><div class="mini-grid">${batches || '<p>No draft batches yet. Draft questions from a course to create the first batch.</p>'}</div></section><section class="panel"><h2>Questions</h2><div class="mini-grid">${questions || '<p>No questions yet. Draft a local batch, then accept the questions you want cards to use.</p>'}</div></section>`, 'Questions');
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

function renderTimelineHtml(state: TutorState): string {
  const timeline = buildEvidenceTimeline(state);
  const docs = timeline.nodes.filter((node) => node.type === 'doc');
  const items = timeline.nodes.slice().reverse().map((node) => `<article class="timeline-row" data-node-type="${escapeHtml(node.type)}"><span>${escapeHtml(node.type)}</span><strong>${escapeHtml(node.label)}</strong><small>${escapeHtml(node.subtitle ?? node.path ?? '')}</small></article>`).join('');
  const metrics = `<div class="stats"><div>${timeline.summary.commit ?? 0}<span>commits</span></div><div>${timeline.summary.doc ?? 0}<span>docs</span></div><div>${timeline.summary.question ?? 0}<span>questions</span></div><div>${timeline.summary.card ?? 0}<span>cards</span></div></div>`;
  return pageShell('MergeLearn Tutor Evidence Timeline', `<section class="hero"><div><p class="eyebrow">Evidence timeline</p><h1>GitLens-style learning provenance</h1><p>See the commits, files, docs, questions, cards, and answer events that explain why each study item exists.</p></div></section>${nav()}${metrics}${renderTimelineFilterPanel(timeline.summary)}<section class="panel"><h2>Document lens</h2><div class="mini-grid">${docs.map((doc) => `<article class="mini-card"><strong>${escapeHtml(doc.label)}</strong><p>${escapeHtml(doc.path ?? doc.subtitle ?? '')}</p><small>${timeline.edges.filter((edge) => edge.from === doc.id || edge.to === doc.id).length} links</small></article>`).join('') || '<p>No markdown docs found yet.</p>'}</div></section><section class="panel"><h2>Timeline</h2><div class="timeline-list">${items}</div></section>`, 'Timeline');
}

function renderTimelineFilterPanel(summary: Record<string, number>): string {
  const preferredTypes = ['commit', 'file', 'doc', 'concept', 'course', 'question', 'batch', 'card', 'event'];
  const chips = preferredTypes.filter((type) => (summary[type] ?? 0) > 0).map((type) => `<button data-action="timeline-filter" data-filter-type="${type}">${escapeHtml(type)} · ${summary[type]}</button>`).join('');
  return `<section class="panel filter-panel"><div class="section-head"><div><p class="eyebrow">Provenance filters</p><h2>Scan one evidence type at a time</h2><p>Timeline can get noisy after several card generations. Use these local filters to focus on docs, accepted questions, cards, or review events without leaving the page.</p></div><a class="ghost" href="/api/evidence-timeline">Open timeline JSON</a></div><div class="actions"><button data-action="timeline-filter" data-filter-type="all">All types</button>${chips}</div><p class="setup-note" id="timeline-filter-note">Showing all timeline nodes.</p></section>`;
}

function renderGraphHtml(state: TutorState): string {
  const timeline = buildEvidenceTimeline(state);
  const graphGroups = graphByType(timeline);
  const groups = graphGroups.map((group) => `<section class="graph-column" data-graph-type="${escapeHtml(group.type)}"><h2>${escapeHtml(group.type)}</h2>${group.nodes.slice(0, 12).map((node) => `<article class="graph-node"><strong>${escapeHtml(node.label)}</strong><small>${escapeHtml(node.subtitle ?? node.path ?? node.status ?? '')}</small></article>`).join('')}</section>`).join('');
  const map = renderGraphMap(timeline.nodes, timeline.edges);
  const raw = escapeHtml(JSON.stringify({ nodes: timeline.nodes, edges: timeline.edges }, null, 2));
  return pageShell('MergeLearn Tutor Graph', `<section class="hero"><div><p class="eyebrow">Learning graph</p><h1>Courses, docs, questions, cards</h1><p>This is now a visual relationship map backed by /api/evidence-graph. It shows the product chain from evidence to courses, concepts, questions, cards, and review events.</p></div><div class="hero-card"><strong>${timeline.nodes.length}</strong><span>nodes</span><strong>${timeline.edges.length}</strong><span>edges</span></div></section>${nav()}${map}${renderGraphFocusPanel(graphGroups, timeline.edges.length)}<section class="graph-grid">${groups}</section><details class="panel"><summary><strong>Raw graph projection</strong></summary><pre>${raw}</pre></details>`, 'Graph');
}

function renderGraphFocusPanel(groups: Array<{ type: string; nodes: EvidenceTimelineNode[] }>, edgeCount: number): string {
  const chips = groups.map((group) => `<button data-action="graph-filter" data-filter-type="${escapeHtml(group.type)}">${escapeHtml(group.type)} · ${group.nodes.length}</button>`).join('');
  const hiddenNodes = groups.reduce((count, group) => count + Math.max(0, group.nodes.length - 12), 0);
  return `<section class="panel filter-panel"><div class="section-head"><div><p class="eyebrow">Graph focus</p><h2>Drill into one lane before reading raw JSON</h2><p>The map shows the first few nodes per lane and ${edgeCount} relationships. Focus a lane below to inspect courses, concepts, questions, cards, or events as the graph grows.</p></div><a class="ghost" href="/timeline">Open timeline</a></div><div class="actions"><button data-action="graph-filter" data-filter-type="all">All lanes</button>${chips}</div><p class="setup-note" id="graph-filter-note">Showing all graph lanes${hiddenNodes > 0 ? `; ${hiddenNodes} additional dense nodes are still available in raw JSON.` : '.'}</p></section>`;
}

function renderGraphMap(nodes: EvidenceTimelineNode[], edges: Array<{ from: string; to: string; type: string }>): string {
  const lanes = [
    { id: 'evidence', label: 'Evidence', types: ['commit', 'doc', 'file'] },
    { id: 'course', label: 'Courses', types: ['course'] },
    { id: 'concept', label: 'Concepts', types: ['concept'] },
    { id: 'question', label: 'Questions', types: ['question'] },
    { id: 'card', label: 'Cards', types: ['batch', 'card'] },
    { id: 'event', label: 'Events', types: ['event'] },
  ];
  const laneNodes = lanes.map((lane) => ({ ...lane, nodes: nodes.filter((node) => lane.types.includes(node.type)).slice(0, 7) }));
  const maxRows = Math.max(2, ...laneNodes.map((lane) => lane.nodes.length));
  const width = 1080;
  const laneWidth = width / lanes.length;
  const top = 72;
  const rowHeight = 86;
  const height = top + maxRows * rowHeight + 46;
  const positions = new Map<string, { x: number; y: number }>();
  const laneRects = laneNodes.map((lane, laneIndex) => {
    const x = laneIndex * laneWidth + 10;
    return `<g><rect x="${x}" y="16" width="${laneWidth - 20}" height="${height - 32}" rx="20" class="graph-lane-bg"/><text x="${x + 16}" y="46" class="graph-lane-title">${escapeHtml(lane.label)}</text></g>`;
  }).join('');
  const nodeRects = laneNodes.flatMap((lane, laneIndex) => lane.nodes.map((node, rowIndex) => {
    const x = laneIndex * laneWidth + 22;
    const y = top + rowIndex * rowHeight;
    positions.set(node.id, { x: x + 68, y: y + 30 });
    return `<g class="graph-map-node"><title>${escapeHtml(node.label)}</title><rect x="${x}" y="${y}" width="${laneWidth - 44}" height="62" rx="14"/><text x="${x + 12}" y="${y + 24}" class="graph-node-type">${escapeHtml(node.type)}</text><text x="${x + 12}" y="${y + 45}" class="graph-node-label">${escapeHtml(shortGraphLabel(node.label))}</text></g>`;
  })).join('');
  const edgeLines = edges.filter((edge) => positions.has(edge.from) && positions.has(edge.to)).slice(0, 60).map((edge) => {
    const from = positions.get(edge.from)!;
    const to = positions.get(edge.to)!;
    return `<path class="graph-edge" d="M ${from.x} ${from.y} C ${(from.x + to.x) / 2} ${from.y}, ${(from.x + to.x) / 2} ${to.y}, ${to.x} ${to.y}"><title>${escapeHtml(edge.type)}</title></path>`;
  }).join('');
  const legend = '<div class="graph-legend"><span>commit/doc/file → concept</span><span>course → question</span><span>question → card</span><span>card → review event</span></div>';
  return `<section class="panel graph-map-panel"><div class="section-head"><div><h2>Evidence graph map</h2><p>Follow the chain from repository evidence to concepts, accepted questions, review cards, and learner events.</p></div><a class="ghost" href="/api/evidence-graph">Open graph JSON</a></div>${legend}<svg class="graph-map" viewBox="0 0 ${width} ${height}" role="img" aria-label="Evidence graph map"><defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L9,3 z" fill="#38bdf8"/></marker></defs>${laneRects}<g>${edgeLines}</g><g>${nodeRects}</g></svg></section>`;
}

function shortGraphLabel(label: string): string {
  return label.length > 31 ? `${label.slice(0, 28)}...` : label;
}

function renderProgressHtml(state: TutorState): string {
  const graph = buildProgressGraph(state);
  const groups = graph.nodes.filter((node) => node.kind === 'group').map((group) => {
    const children = graph.edges.filter((edge) => edge.type === 'group' && edge.from === group.id).map((edge) => graph.nodes.find((node) => node.id === edge.to)).filter(Boolean);
    const rows = children.map((child) => `<li>${escapeHtml(child!.label)} — ${Math.round(child!.mastery * 100)}% mastery, ${escapeHtml(child!.status.replace(/_/g, ' '))}</li>`).join('');
    return `<section class="panel"><h2>${escapeHtml(group.label)}</h2>${rows ? `<ul>${rows}</ul>` : '<p>No concepts in this group yet.</p>'}</section>`;
  }).join('');
  const stats = `<div class="stats"><div>${graph.summary.new}<span>new</span></div><div>${graph.summary.learning}<span>learning</span></div><div>${graph.summary.confident}<span>confident</span></div><div>${graph.summary.needs_review}<span>needs review</span></div></div>`;
  return pageShell('MergeLearn Tutor Progress', `<section class="hero"><div><p class="eyebrow">Learning map</p><h1>Progress map</h1><p>Track what you have seen, what needs review, and which concepts are becoming confident.</p></div></section>${nav()}${stats}${renderProgressGuide(state)}${groups}<details class="panel"><summary>Show raw CLI progress</summary><pre>${escapeHtml(renderProgress(state))}</pre></details>`, 'Progress map');
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

function renderHistoryHtml(state: TutorState): string {
  const data = cardHistoryData(state);
  const batches = data.batches.map((batch) => `<article class="mini-card"><strong>${escapeHtml(batch.mode)}</strong><p>${escapeHtml(batch.id)} · ${batch.itemIds.length} created · ${batch.archivedItemIds.length} archived</p><small>${escapeHtml(batch.createdAt)}</small></article>`).join('');
  const activeCards = data.cards.filter((card) => card.status !== 'archived');
  const archivedCards = data.cards.filter((card) => card.status === 'archived');
  const cardList = (cards: typeof data.cards) => cards.slice().reverse().map((card) => `<article class="mini-card ${card.status === 'archived' ? 'is-archived' : ''}"><div class="card-topline"><span>${escapeHtml(card.status)}</span><span>gen ${card.generation}</span><span>${escapeHtml(card.source)}</span></div><h3>${escapeHtml(card.title)}</h3><p>${escapeHtml(card.id)}${card.courseId ? ` · course ${escapeHtml(card.courseId)}` : ''}${card.questionId ? ` · question ${escapeHtml(card.questionId)}` : ''}</p><details><summary>${card.events.length} timeline events</summary><ul>${card.events.map((event) => `<li><strong>${escapeHtml(event.eventType)}</strong>${event.correct === undefined ? '' : ` · ${event.correct ? 'correct' : 'missed'}`} ${event.answerText ? `— ${escapeHtml(event.answerText)}` : ''}${event.note ? ` — ${escapeHtml(event.note)}` : ''}</li>`).join('')}</ul></details></article>`).join('');
  const activity = recentHistoryActivity(state);
  const metrics = `<div class="stats"><div>${data.summary.activeCards}<span>active</span></div><div>${data.summary.archivedCards}<span>archived</span></div><div>${data.summary.batches}<span>batches</span></div><div>${data.summary.events}<span>events</span></div></div>`;
  return pageShell('MergeLearn Tutor History', `<section class="hero"><div><p class="eyebrow">Learning memory</p><h1>History without the wall of cards</h1><p>Summary first. Dense card details are grouped below so regenerate history stays available without overwhelming the demo.</p></div></section>${nav()}${metrics}${renderHistorySourceAudit(state)}<section class="panel"><h2>Recent activity</h2><div class="timeline-list">${activity || '<p>No learning activity yet. Generate cards, answer one, or mark card quality to start the audit trail.</p>'}</div></section><section class="panel"><h2>Batches</h2><div class="mini-grid">${batches || '<p>No batches yet. Use Review source to generate a queue; batch details will appear here.</p>'}</div></section><details class="panel" open><summary><strong>Active cards</strong> · ${activeCards.length}</summary><div class="mini-grid">${cardList(activeCards) || '<p>No active cards. Generate cards from all evidence or a selected course on Review.</p>'}</div></details><details class="panel"><summary><strong>Archived cards</strong> · ${archivedCards.length}</summary><div class="mini-grid">${cardList(archivedCards) || '<p>No archived cards. Regenerate from source to preserve the old queue here.</p>'}</div></details><p><a href="/api/cards/history">Raw history JSON</a></p>`, 'History');
}

function renderHistorySourceAudit(state: TutorState): string {
  const broadCards = state.learningItems.filter((item) => !item.courseId).length;
  const courseCards = state.learningItems.filter((item) => item.courseId).length;
  const acceptedQuestionCards = state.learningItems.filter((item) => item.questionId).length;
  const qualityEvents = state.learningEvents.filter((event) => ['marked_bad_card', 'marked_wrong_evidence', 'marked_duplicate'].includes(event.eventType)).length;
  const calibration = summarizeCalibration(state);
  return `<section class="panel"><div class="section-head"><div><p class="eyebrow">Source audit</p><h2>Why did these cards exist?</h2><p>Use this before inspecting individual cards: it separates broad repo evidence, course-scoped generation, accepted-question cards, and card-quality feedback.</p></div><a class="ghost" href="/">Change Review source</a></div><div class="mini-grid"><article class="mini-card"><strong>${broadCards}</strong><p>All due repo evidence cards</p><small>Cards without a course id came from the broad queue.</small></article><article class="mini-card"><strong>${courseCards}</strong><p>Course-scoped cards</p><small>These should show a course id on the card and in history.</small></article><article class="mini-card"><strong>${acceptedQuestionCards}</strong><p>Accepted-question cards</p><small>These were generated from approved prompts in the question bank.</small></article><article class="mini-card"><strong>${qualityEvents}</strong><p>Card-quality events</p><small>Bad-card/wrong-evidence/duplicate feedback is audited without lowering mastery.</small></article><article class="mini-card"><strong>${calibration.pairedCount}</strong><p>Calibrated answers</p><small>Confidence ${score(calibration.averageConfidence)} · accuracy ${score(calibration.accuracy)} · Brier ${calibration.brierScore.toFixed(2)}</small></article></div></section>`;
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

function renderPreferencesHtml(preferences: UserPreferences): string {
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
  return pageShell('MergeLearn Tutor Preferences', body, 'Question preferences');
}

function nav(): string {
  return '';
}

function appNav(): string {
  return '<nav class="app-nav" aria-label="Primary navigation"><a href="/">Review</a><a href="/plan">Plan Builder</a><a href="/courses">Courses</a><a href="/questions">Questions</a><a href="/timeline">Timeline</a><a href="/graph">Graph</a><a href="/history">History</a><a href="/progress">Progress</a><a href="/preferences">Preferences</a></nav>';
}

function pageShell(title: string, body: string, status: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>${style()}</style></head><body><div class="status" id="status">${escapeHtml(status)}</div><header class="app-shell"><div class="app-brand"><p class="eyebrow">MergeLearn Tutor</p><strong>Local learning workbench</strong><small>No remote LLM calls. State is read from this local session.</small></div>${appNav()}<section class="shell-context" aria-label="Current local plan snapshot"><div><span>Concepts</span><strong id="shell-concepts">—</strong></div><div><span>Courses</span><strong id="shell-courses">—</strong></div><div><span>Accepted questions</span><strong id="shell-questions">—</strong></div><div><span>Active cards</span><strong id="shell-cards">—</strong></div><a class="ghost" id="shell-next-action" href="/plan">Loading plan state…</a></section></header><main>${body}</main><script>${script()}</script></body></html>`;
}

function style(): string {
  return `
*,*:before,*:after{box-sizing:border-box}
body{font-family:Inter,ui-sans-serif,system-ui,sans-serif;margin:0;background:radial-gradient(circle at top left,#1e3a8a33,transparent 34rem),linear-gradient(180deg,#07111f,#0b1020 44%,#0a0f1d);color:#e2e8f0}
main,.app-shell{max-width:1160px;margin:0 auto;padding:34px 24px 80px}
main{padding-top:20px}.app-shell{padding-bottom:0}.app-brand{display:grid;gap:6px;margin:24px 0 14px}.app-brand strong{font-size:28px;letter-spacing:-.03em}.app-brand small{color:#9fb0c8}.shell-context{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr)) auto;gap:12px;align-items:stretch;border:1px solid #30415c;border-radius:22px;background:linear-gradient(135deg,#0d1b2f,#102338);padding:14px;margin:14px 0 8px;box-shadow:0 16px 50px #0004}.shell-context div{border:1px solid #263854;border-radius:16px;background:#07111fcc;padding:10px 12px}.shell-context span{display:block;color:#93a4b8;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}.shell-context strong{display:block;font-size:24px;margin-top:4px}.shell-context .ghost{align-self:center;white-space:nowrap}
a{color:#7dd3fc}.status{position:sticky;top:0;z-index:5;background:#020617cc;backdrop-filter:blur(16px);padding:10px 24px;border-bottom:1px solid #1e293b;color:#bae6fd}
.hero{display:grid;grid-template-columns:minmax(0,1fr) 220px;gap:24px;align-items:stretch;margin:22px 0 20px;padding:30px;border:1px solid #263854;border-radius:28px;background:linear-gradient(135deg,#12203a,#0f172a 70%);box-shadow:0 24px 70px #0007}
.hero h1{font-size:44px;line-height:1.02;margin:4px 0 12px;letter-spacing:-.04em}.hero p{color:#cbd5e1;font-size:17px}.hero-card{border:1px solid #334155;border-radius:22px;background:#02061799;padding:20px;display:grid;align-content:center;gap:5px}.hero-card strong{font-size:38px}.hero-card span{color:#93a4b8}
.nav,.app-nav,.toolbar{display:flex;flex-wrap:wrap;gap:12px;align-items:center;background:#0f172acc;border:1px solid #334155;border-radius:20px;padding:14px 16px;margin:18px 0;backdrop-filter:blur(18px)}.toolbar{justify-content:space-between}.toolbar p{margin:.3rem 0 0;color:#93a4b8}.nav a,.app-nav a,.ghost,button{display:inline-flex;align-items:center;justify-content:center;margin:4px 4px 0 0;border-radius:999px;padding:10px 14px;font-weight:800;text-decoration:none;border:1px solid #3b526f;background:#182337;color:#e2e8f0;transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease,background .16s ease}
button:first-child,.actions button:first-child{background:linear-gradient(135deg,#38bdf8,#22c55e);border:0;color:#03111f}.nav a:hover,.app-nav a:hover,.ghost:hover,button:hover,.nav a:focus-visible,.app-nav a:focus-visible,.ghost:focus-visible,button:focus-visible{transform:translateY(-2px);border-color:#7dd3fc;box-shadow:0 12px 28px #38bdf833;background:#24344f;outline:0}.app-nav a[aria-current="page"]{background:#0ea5e9;color:#03111f;border-color:#7dd3fc;box-shadow:0 12px 28px #38bdf833}button:first-child:hover,.actions button:first-child:hover{box-shadow:0 16px 34px #22c55e33}button:disabled{opacity:.55;cursor:not-allowed;transform:none;box-shadow:none}
.card,.panel{background:linear-gradient(180deg,#111827,#0f172a);border:1px solid #30415c;border-radius:24px;padding:24px;margin:18px 0;box-shadow:0 16px 50px #0005}.review-grid{display:grid;gap:20px}.card.completed{border-color:#22c55e88;background:linear-gradient(180deg,#10251d,#0f172a)}.card-topline{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}.card-topline span,.eyebrow{border:1px solid #315071;border-radius:999px;padding:5px 10px;color:#bae6fd;background:#0b2740;text-transform:uppercase;font-size:12px;font-weight:800;letter-spacing:.08em}.eyebrow{display:inline-flex}.why{color:#a8b3c7}.snippet-head{display:flex;justify-content:space-between;gap:12px;margin:14px 0 0;padding:10px 12px;background:#020617;border:1px solid #1e293b;border-radius:14px 14px 0 0;color:#93c5fd;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px}
.question-box,.reveal-panel,.confidence-panel{border:1px solid #334155;border-radius:18px;background:#0b1220;padding:16px;margin:16px 0}.reveal-panel{background:#081b2d}.confidence-panel{background:#071426}.confidence-options{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px}.confidence-options label{display:flex;gap:7px;align-items:center;border:1px solid #315071;border-radius:999px;background:#020617;padding:9px 11px;color:#cbd5e1;font-weight:800}.quality-panel{display:grid;gap:10px;border:1px solid #315071;border-radius:16px;background:#071426;padding:14px;margin:14px 0}.quality-summary{display:flex;justify-content:space-between;gap:12px;align-items:start}.quality-panel strong{text-transform:capitalize}.quality-ready{border-color:#22c55e88}.quality-needs_review{border-color:#f59e0b99}.quality-blocked{border-color:#f43f5e99}.quality-details summary{cursor:pointer;color:#bae6fd;font-weight:800}.quality-scores{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.quality-scores span{border:1px solid #334155;border-radius:999px;padding:5px 9px;color:#cbd5e1;background:#0f172a}.quality-warnings{margin:0;color:#fbbf24}.is-hidden{display:none}.label{font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:#67e8f9;font-weight:900;margin:0 0 8px}textarea,input,select{width:100%;border:1px solid #334155;border-radius:16px;background:#020617;color:#e2e8f0;padding:14px;font:inherit}textarea{min-height:96px;resize:vertical}.actions{display:flex;flex-wrap:wrap;gap:8px}.progress-track{height:9px;max-width:340px;background:#020617;border:1px solid #1e293b;border-radius:999px;margin-top:10px;overflow:hidden}.progress-track span{display:block;height:100%;background:linear-gradient(90deg,#38bdf8,#22c55e);transition:width .2s ease}.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin:18px 0}.stats div,.mini-card{border:1px solid #30415c;border-radius:20px;background:#0f172a;padding:18px}.stats div{font-size:30px;font-weight:900}.stats span{display:block;color:#93a4b8;font-size:13px;font-weight:700}.mini-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}.mini-card h3{margin:.5rem 0}.mini-card p,.mini-card small{color:#9fb0c8}.question-card h3{font-size:17px;line-height:1.18;display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow:hidden}.mini-card.is-archived{opacity:.74}.timeline-list{display:grid;gap:10px}.timeline-row{display:grid;grid-template-columns:110px minmax(0,1fr) minmax(120px,.55fr);gap:12px;align-items:center;border:1px solid #263854;border-radius:16px;background:#0b1220;padding:12px}.timeline-row span{color:#67e8f9;text-transform:uppercase;font-size:12px;font-weight:900}.timeline-row small,.graph-node small{color:#9fb0c8}.section-head{display:flex;justify-content:space-between;gap:18px;align-items:start}.section-head h2{margin:.1rem 0}.section-head p{color:#9fb0c8;margin:.4rem 0 0}.graph-map-panel{overflow:hidden}.graph-legend{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 16px}.graph-legend span{border:1px solid #315071;border-radius:999px;background:#0b2740;color:#bae6fd;padding:7px 10px;font-size:12px;font-weight:800}.graph-map{width:100%;height:auto;border:1px solid #263854;border-radius:22px;background:radial-gradient(circle at 20% 10%,#38bdf814,transparent 24rem),#07111f}.graph-lane-bg{fill:#0f172acc;stroke:#263854}.graph-lane-title{fill:#bae6fd;font-size:15px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.graph-edge{fill:none;stroke:#38bdf8;stroke-width:2;stroke-opacity:.5;marker-end:url(#arrow)}.graph-map-node rect{fill:#0b1220;stroke:#38bdf866;stroke-width:1.5}.graph-map-node:hover rect{stroke:#22c55e;fill:#0f2137}.graph-node-type{fill:#67e8f9;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.graph-node-label{fill:#e2e8f0;font-size:12px;font-weight:800}.graph-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}.graph-column{border:1px solid #30415c;border-radius:24px;background:#101827;padding:18px}.graph-node{border:1px solid #263854;border-radius:16px;background:#0b1220;padding:12px;margin:10px 0;display:grid;gap:6px}.graph-node strong{display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}.choices{display:grid;gap:12px;margin:14px 0}.choice{display:flex;gap:12px;padding:14px;border:1px solid #334155;border-radius:18px;background:#0b1220}.choice input{width:auto}.choice small{display:block;color:#93a4b8;margin-top:4px}pre{overflow:auto;background:#020617;border:1px solid #1e293b;border-radius:16px;padding:16px}
.onboarding-panel,.plan-builder-panel{background:linear-gradient(135deg,#0d1b2f,#102338 64%,#082f49)}.review-source-toolbar{align-items:stretch}.review-source-controls{display:grid;grid-template-columns:minmax(260px,1fr) auto;gap:14px;align-items:end;flex:1}.review-source-controls .actions{justify-content:flex-end}.review-source-field{max-width:520px}.review-source-controls .setup-note{max-width:620px;margin:10px 0 0}.onboarding-steps,.plan-path{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;list-style:none;margin:18px 0 0;padding:0}.onboarding-step,.plan-step{display:grid;grid-template-columns:38px minmax(0,1fr);gap:12px;border:1px solid #315071;border-radius:18px;background:#07111fcc;padding:14px}.onboarding-step>span,.plan-step>span{display:grid;place-items:center;width:32px;height:32px;border-radius:999px;background:#1e293b;color:#bae6fd;font-weight:900}.onboarding-step.is-done>span,.plan-step.is-done>span{background:#14532d;color:#bbf7d0}.onboarding-step p,.plan-step p{color:#b6c2d4;margin:.35rem 0}.onboarding-step code{display:block;white-space:normal;word-break:break-word;color:#fef3c7;background:#020617;border:1px solid #334155;border-radius:10px;padding:8px;font-size:12px}.setup-note{color:#b6c2d4;background:#07111f99;border:1px solid #263854;border-radius:14px;padding:10px 12px}.filter-panel .actions{margin-top:14px}.filter-panel button[aria-pressed="true"]{background:#0ea5e9;color:#03111f;border-color:#7dd3fc}.is-filtered-out{display:none!important}.inline-field{display:grid;gap:7px;max-width:440px;margin-top:12px;color:#bae6fd;font-weight:800}.preferences-wizard code{color:#fef3c7}.preset-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;margin-top:16px}.preset-card{display:grid;gap:14px;align-content:space-between;border:1px solid #315071;border-radius:20px;background:#07111fcc;padding:18px}.preset-card p{color:#b6c2d4;margin:.45rem 0}.preset-card small{display:block;color:#93c5fd;line-height:1.4}.preference-controls{display:grid;grid-template-columns:minmax(180px,280px) minmax(260px,1fr);gap:14px;margin:16px 0;align-items:start}.choices{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}.choice{display:flex;gap:12px;align-items:flex-start;border:1px solid #263854;border-radius:16px;background:#07111f99;padding:14px}.choice input{width:auto;margin-top:4px}.choice small{display:block;color:#9fb0c8;margin-top:4px;line-height:1.4}
@media(max-width:760px){main,.app-shell{padding:20px 14px 60px}.app-shell{padding-bottom:0}.shell-context{grid-template-columns:repeat(2,minmax(0,1fr))}.shell-context .ghost{grid-column:1/-1;white-space:normal}.hero{grid-template-columns:1fr;padding:22px}.hero h1{font-size:34px}.toolbar{position:static}.review-source-controls{grid-template-columns:1fr}.review-source-controls .actions{justify-content:flex-start}.stats{grid-template-columns:repeat(2,minmax(0,1fr))}}
${diffSnippetCss()}`;
}

function script(): string {
  return `
function status(text){document.getElementById('status').textContent=text;}
async function post(path, body){const res=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const json=await res.json();status(json.ok?'Saved locally':json.error||'Request failed');return json;}
async function put(path, body){const res=await fetch(path,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const json=await res.json();status(json.ok?'Preferences saved':'Could not save preferences');return json;}
function csv(value){return String(value||'').split(',').map((item)=>item.trim()).filter(Boolean);}
function countActiveCards(state){return (state.learningItems||[]).filter((item)=>item.status!=='archived').length;}
function shellNext(state){const concepts=(state.concepts||[]).length;const courses=(state.courses||[]).length;const accepted=(state.questionBank||[]).filter((entry)=>entry.status==='accepted').length;const active=countActiveCards(state);if(!concepts)return {label:'Next: ingest local evidence',href:'/timeline'};if(!courses)return {label:'Next: create a course goal',href:'/courses'};if(!accepted)return {label:'Next: accept useful questions',href:'/questions'};if(!active)return {label:'Next: generate review cards',href:'/'};return {label:'Next: review active cards',href:'/'};}
function activateShellNav(){const path=location.pathname==='/'?'/':location.pathname;document.querySelectorAll('.app-nav a').forEach((link)=>{const active=link.getAttribute('href')===path;if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});}
async function updateShellContext(){try{const res=await fetch('/api/state');if(!res.ok)throw new Error('state unavailable');const state=await res.json();const accepted=(state.questionBank||[]).filter((entry)=>entry.status==='accepted').length;const fields=[['shell-concepts',(state.concepts||[]).length],['shell-courses',(state.courses||[]).length],['shell-questions',accepted],['shell-cards',countActiveCards(state)]];fields.forEach(([id,value])=>{const el=document.getElementById(id);if(el)el.textContent=String(value);});const next=shellNext(state);const action=document.getElementById('shell-next-action');if(action){action.textContent=next.label;action.setAttribute('href',next.href);}}catch(error){const action=document.getElementById('shell-next-action');if(action)action.textContent='Plan state unavailable';}}
function updateProgress(){const cards=[...document.querySelectorAll('.recall-card')];const done=cards.filter((card)=>card.classList.contains('completed')).length;const bar=document.getElementById('session-progress');if(bar&&cards.length){bar.style.width=Math.round(done/cards.length*100)+'%';}}
function markComplete(card,label){card.classList.add('completed');const state=card.querySelector('.card-state');if(state)state.textContent=label;card.querySelectorAll('.grade-actions button').forEach((button)=>button.disabled=true);updateProgress();}
function updatePreferenceSummary(){const enabled=[...document.querySelectorAll('input[data-plane]:checked')].map((input)=>input.dataset.plane);const snippet=document.getElementById('snippet-lines')?.value||14;const explanations=document.getElementById('show-explanations')?.checked?'on':'off';const summary=document.getElementById('preferences-summary');if(summary)summary.textContent='Current setup: '+enabled.length+' question categories · '+snippet+' snippet lines · explanations '+explanations+'.';}
document.addEventListener('click',async(event)=>{const target=event.target;if(!(target instanceof Element))return;const button=target.closest('button');if(!button)return;if(button.dataset.action==='timeline-filter'){const type=button.dataset.filterType||'all';const rows=[...document.querySelectorAll('[data-node-type]')];rows.forEach((row)=>row.classList.toggle('is-filtered-out',type!=='all'&&row.dataset.nodeType!==type));document.querySelectorAll('[data-action="timeline-filter"]').forEach((chip)=>chip.setAttribute('aria-pressed',String(chip===button)));const note=document.getElementById('timeline-filter-note');if(note)note.textContent=type==='all'?'Showing all timeline nodes.':'Showing '+rows.filter((row)=>row.dataset.nodeType===type).length+' '+type+' timeline nodes.';status(type==='all'?'Timeline filter cleared':'Timeline filtered to '+type);return;}if(button.dataset.action==='graph-filter'){const type=button.dataset.filterType||'all';const columns=[...document.querySelectorAll('[data-graph-type]')];columns.forEach((column)=>column.classList.toggle('is-filtered-out',type!=='all'&&column.dataset.graphType!==type));document.querySelectorAll('[data-action="graph-filter"]').forEach((chip)=>chip.setAttribute('aria-pressed',String(chip===button)));const note=document.getElementById('graph-filter-note');if(note)note.textContent=type==='all'?'Showing all graph lanes.':'Showing the '+type+' graph lane.';status(type==='all'?'Graph filter cleared':'Graph focused on '+type);return;}if(button.dataset.action==='generate-cards'){button.disabled=true;const courseId=document.getElementById('review-course')?.value||undefined;status(courseId?'Generating course cards...':'Generating cards...');const json=await post('/api/cards/generate',{count:5,mode:button.dataset.mode,reason:courseId?'website selected course':'website button',courseId});if(json.ok) location.reload();return;}if(button.dataset.action==='preferences-preset'){const planes=String(button.dataset.planes||'').split(',').filter(Boolean);document.querySelectorAll('input[data-plane]').forEach((input)=>{input.checked=planes.includes(input.dataset.plane);});const snippet=document.getElementById('snippet-lines');if(snippet)snippet.value=button.dataset.snippetLines||snippet.value;const explanations=document.getElementById('show-explanations');if(explanations)explanations.checked=button.dataset.showExplanations==='true';updatePreferenceSummary();status('Preset applied locally. Save preferences to keep it.');return;}if(button.dataset.action==='save-preferences'){const enabledPlanes=[...document.querySelectorAll('input[data-plane]:checked')].map((input)=>input.dataset.plane);const snippetLineCount=Number(document.getElementById('snippet-lines').value||14);const showExplanationsByDefault=document.getElementById('show-explanations').checked;await put('/api/preferences',{review:{enabledPlanes,snippetLineCount,showExplanationsByDefault}});updatePreferenceSummary();return;}if(button.dataset.action==='save-course'){const title=document.getElementById('course-title').value;const goal=document.getElementById('course-goal').value;if(!title||!goal){status('Course title and goal are required.');return;}const json=await post('/api/courses',{id:document.getElementById('course-id').value,title,goal,materialPaths:csv(document.getElementById('course-materials').value),docPaths:csv(document.getElementById('course-docs').value)});if(json.ok)location.reload();return;}if(button.dataset.action==='draft-questions'){const courseId=document.getElementById('question-course')?.value||undefined;const json=await post('/api/questions/draft',{provider:'fake',count:5,courseId});if(json.ok)location.reload();return;}if(button.dataset.action==='question-status'){const json=await post('/api/questions/status',{id:button.dataset.question,status:button.dataset.status});if(json.ok)location.reload();return;}const card=button.closest('.recall-card');if(!card)return;const itemId=card.dataset.item;const textarea=card.querySelector('textarea');if(button.dataset.action==='reveal'){const selectedConfidence=card.querySelector('input[name="confidence-'+itemId+'"]:checked');if(!selectedConfidence){status('Choose confidence before reveal.');return;}const confidenceBeforeReveal=Number(selectedConfidence.value);const json=await post('/feedback',{itemId,eventType:'revealed',confidenceBeforeReveal,note:'confidence before reveal'});if(!json.ok)return;card.querySelector('.reveal-panel')?.classList.remove('is-hidden');button.disabled=true;status('Explanation revealed. Self-grade when ready.');return;}if(button.dataset.action==='answer-grade'){const correct=button.dataset.correct==='true';const answer=textarea.value.trim();if(correct&&!answer){status('Write an answer before marking this as known.');textarea.focus();return;}const json=await post('/answer',{itemId,answer:answer||'I missed this after reveal.',correct});if(json.ok)markComplete(card,correct?'knew it':'missed it');return;}if(button.dataset.action==='feedback'){const json=await post('/feedback',{itemId,eventType:button.dataset.event,note:'from local review session'});if(json.ok)markComplete(card,button.dataset.event==='marked_bad_card'?'quality issue':button.textContent.trim().toLowerCase());}});
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

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
}
