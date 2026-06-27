import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { coursesSummary, upsertCourse } from '../core/courses.js';
import { diffSnippetCss, renderDiffSnippetHtml } from '../core/diffView.js';
import { buildEvidenceTimeline, graphByType } from '../core/evidenceTimeline.js';
import { addCorrection, recordReviewEvent } from '../core/events.js';
import { activeLearningItems, generateCardBatch, recordAnswer } from '../core/planner.js';
import { loadPreferences, normalizePreferences, savePreferences } from '../core/preferences.js';
import { buildProgressGraph } from '../core/progress.js';
import { draftQuestionsForCourse, questionSummary, updateQuestionStatus } from '../core/questions.js';
import { renderProgress, renderToday } from '../core/render.js';
import { loadState, saveState } from '../core/store.js';
import type { CorrectionType, EvidenceTimelineNode, ReviewEventType, TutorState, UserPreferences } from '../core/types.js';

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
  if (method === 'GET' && url.pathname === '/courses') return sendHtml(res, 200, renderCoursesHtml(await loadState(repoPath)));
  if (method === 'GET' && url.pathname === '/questions') return sendHtml(res, 200, renderQuestionsHtml(await loadState(repoPath)));
  if (method === 'GET' && url.pathname === '/timeline') return sendHtml(res, 200, renderTimelineHtml(await loadState(repoPath)));
  if (method === 'GET' && url.pathname === '/graph') return sendHtml(res, 200, renderGraphHtml(await loadState(repoPath)));
  if (method === 'GET' && url.pathname === '/progress') return sendHtml(res, 200, renderProgressHtml(await loadState(repoPath)));
  if (method === 'GET' && url.pathname === '/history') return sendHtml(res, 200, renderHistoryHtml(await loadState(repoPath)));
  if (method === 'GET' && url.pathname === '/preferences') return sendHtml(res, 200, renderPreferencesHtml(await loadPreferences(repoPath)));
  if (method === 'GET' && (url.pathname === '/state.json' || url.pathname === '/api/state')) return sendJson(res, 200, await loadState(repoPath));
  if (method === 'GET' && url.pathname === '/api/progress') return sendJson(res, 200, buildProgressGraph(await loadState(repoPath)));
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
    const body = await readJson(req) as { itemId?: string; eventType?: ReviewEventType; note?: string };
    if (!body.itemId || !body.eventType) return sendJson(res, 400, { ok: false, error: 'itemId and eventType are required' });
    const next = recordReviewEvent(await loadState(repoPath), { itemId: body.itemId, eventType: body.eventType, note: body.note });
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

function renderSessionHtml(state: TutorState, preferences: UserPreferences): string {
  const active = activeLearningItems(state);
  const archived = state.learningItems.filter((item) => item.status === 'archived').length;
  const latestBatch = state.cardBatches.at(-1);
  const cards = active.slice(0, 8).map((item, index) => `
    <article class="card recall-card" data-item="${escapeHtml(item.id)}">
      <div class="card-topline"><span>Card ${index + 1}</span><span>${escapeHtml(item.questionPlane.replace(/_/g, ' '))}</span><span>${escapeHtml(item.difficulty)}</span><span class="card-state">not reviewed</span></div>
      <h2>${escapeHtml(item.title)}</h2>
      <p class="why">${escapeHtml(item.whyShown ?? 'Shown from recent repo evidence.')}</p>
      <div class="snippet-head"><span>${escapeHtml(item.snippet.path)}</span><span>generation ${item.generation}</span></div>
      ${renderDiffSnippetHtml(item.snippet.code)}
      <section class="question-box"><p class="label">Active recall question</p><p>${escapeHtml(item.prompt)}</p></section>
      <textarea aria-label="Your answer" placeholder="First answer from memory. Then reveal the explanation and self-grade."></textarea>
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
    </article>`).join('\n');
  const hero = `<section class="hero"><div><p class="eyebrow">Local code learning queue</p><h1>Review your recent code as flashcards</h1><p>Generate focused snippets, answer from the diff, and keep your history local.</p></div><div class="hero-card"><strong>${active.length}</strong><span>active cards</span><strong>${archived}</strong><span>archived cards</span></div></section>`;
  const controls = `<section class="toolbar"><div><strong>Card queue</strong><p>${latestBatch ? `Latest batch ${escapeHtml(latestBatch.id)} · ${latestBatch.mode}` : 'No generated batch yet.'}</p><div class="progress-track"><span id="session-progress" style="width:0%"></span></div></div><div><button data-action="generate-cards" data-mode="more">Generate 5 more</button><button data-action="generate-cards" data-mode="regenerate">Regenerate 5</button><a class="ghost" href="/courses">Courses</a><a class="ghost" href="/questions">Questions</a><a class="ghost" href="/timeline">Timeline</a><a class="ghost" href="/graph">Graph</a><a class="ghost" href="/history">History</a></div></section>`;
  return pageShell('MergeLearn Tutor Review', `${hero}${controls}<section class="review-grid">${cards || '<p>No cards yet. Run ingest first.</p>'}</section>`, 'Ready');
}

function renderCoursesHtml(state: TutorState): string {
  const courses = coursesSummary(state);
  const cards = courses.map((course) => `<article class="mini-card course-card"><div class="card-topline"><span>${course.id}</span><span>${course.enabledPlanes.length} planes</span></div><h3>${escapeHtml(course.title)}</h3><p>${escapeHtml(course.goal)}</p><p><strong>Materials</strong>: ${escapeHtml(course.materialPaths.join(', '))}</p><p><strong>Docs</strong>: ${escapeHtml(course.docPaths.join(', '))}</p><p>${course.questionCount} questions · ${course.activeCardCount} active cards</p><a class="ghost" href="/questions">Question bank</a><a class="ghost" href="/timeline">Evidence timeline</a></article>`).join('');
  return pageShell('MergeLearn Tutor Courses', `<section class="hero"><div><p class="eyebrow">Learning tracks</p><h1>Courses organize goals and material</h1><p>Each course defines what you are trying to learn, which repo paths/docs count as material, and which question categories should be prioritized.</p></div><div class="hero-card"><strong>${courses.length}</strong><span>courses</span><strong>${state.questionBank.filter((entry) => entry.status === 'accepted').length}</strong><span>accepted questions</span></div></section>${nav()}<section class="panel"><h2>Create or update a course</h2><div class="form-grid"><input id="course-id" placeholder="course id, e.g. learn-typescript" /><input id="course-title" placeholder="title" /><textarea id="course-goal" placeholder="goal: learn TypeScript from auth/session code"></textarea><input id="course-materials" placeholder="materials: src/**,tests/**" /><input id="course-docs" placeholder="docs: README.md,docs/**" /><button data-action="save-course">Save course</button></div></section><section class="panel"><h2>Course tracks</h2><div class="mini-grid">${cards || '<p>No courses yet. Use the form above or CLI to create one.</p>'}</div></section>`, 'Courses');
}

function renderQuestionsHtml(state: TutorState): string {
  const data = questionBankData(state);
  const batches = data.batches.map((batch) => `<article class="mini-card"><strong>${escapeHtml(batch.provider)}</strong><p>${escapeHtml(batch.id)} · ${batch.entryIds.length} drafts · network ${batch.networkUsed ? 'used' : 'not used'}</p><small>${escapeHtml(batch.createdAt)}</small></article>`).join('');
  const questions = data.questions.map((entry) => `<article class="mini-card question-card"><div class="card-topline"><span>${escapeHtml(entry.status)}</span><span>${escapeHtml(entry.author.provider)}</span><span>${escapeHtml(entry.questionPlane.replace(/_/g, ' '))}</span></div><h3>${escapeHtml(entry.prompt)}</h3><p>course ${escapeHtml(entry.courseId ?? 'none')} · concept ${escapeHtml(entry.conceptId)}</p><details><summary>Expected answer</summary><p>${escapeHtml(entry.expectedAnswer)}</p></details><details><summary>${entry.evidence.length} evidence paths</summary><ul>${entry.evidence.map((item) => `<li>${escapeHtml(item.path)}${item.commit ? ` · ${escapeHtml(item.commit.slice(0, 8))}` : ''}</li>`).join('')}</ul></details>${entry.status === 'draft' ? `<button data-action="question-status" data-question="${escapeHtml(entry.id)}" data-status="accepted">Accept</button><button data-action="question-status" data-question="${escapeHtml(entry.id)}" data-status="rejected">Reject</button>` : ''}</article>`).join('');
  const metrics = `<div class="stats"><div>${data.summary.draft}<span>draft</span></div><div>${data.summary.accepted}<span>accepted</span></div><div>${data.summary.rejected}<span>rejected</span></div><div>${data.summary.networkUsed ? 'yes' : 'no'}<span>network used</span></div></div>`;
  return pageShell('MergeLearn Tutor Questions', `<section class="hero"><div><p class="eyebrow">Question bank</p><h1>Evidence-bound LLM-style questions</h1><p>Drafts can be generated by fake/local providers, then accepted into the question bank before cards use them. Remote LLM is still gated.</p></div></section>${nav()}${metrics}<section class="toolbar"><div><strong>Draft questions</strong><p>Use fake/local LLM-style drafting. Network remains off.</p></div><button data-action="draft-questions">Draft 5 fake LLM questions</button></section><section class="panel"><h2>Draft batches</h2><div class="mini-grid">${batches || '<p>No draft batches yet.</p>'}</div></section><section class="panel"><h2>Questions</h2><div class="mini-grid">${questions || '<p>No questions yet.</p>'}</div></section>`, 'Questions');
}

function renderTimelineHtml(state: TutorState): string {
  const timeline = buildEvidenceTimeline(state);
  const docs = timeline.nodes.filter((node) => node.type === 'doc');
  const items = timeline.nodes.slice().reverse().map((node) => `<article class="timeline-row"><span>${escapeHtml(node.type)}</span><strong>${escapeHtml(node.label)}</strong><small>${escapeHtml(node.subtitle ?? node.path ?? '')}</small></article>`).join('');
  const metrics = `<div class="stats"><div>${timeline.summary.commit ?? 0}<span>commits</span></div><div>${timeline.summary.doc ?? 0}<span>docs</span></div><div>${timeline.summary.question ?? 0}<span>questions</span></div><div>${timeline.summary.card ?? 0}<span>cards</span></div></div>`;
  return pageShell('MergeLearn Tutor Evidence Timeline', `<section class="hero"><div><p class="eyebrow">Evidence timeline</p><h1>GitLens-style learning provenance</h1><p>See the commits, files, docs, questions, cards, and answer events that explain why each study item exists.</p></div></section>${nav()}${metrics}<section class="panel"><h2>Document lens</h2><div class="mini-grid">${docs.map((doc) => `<article class="mini-card"><strong>${escapeHtml(doc.label)}</strong><p>${escapeHtml(doc.path ?? doc.subtitle ?? '')}</p><small>${timeline.edges.filter((edge) => edge.from === doc.id || edge.to === doc.id).length} links</small></article>`).join('') || '<p>No markdown docs found yet.</p>'}</div></section><section class="panel"><h2>Timeline</h2><div class="timeline-list">${items}</div></section>`, 'Timeline');
}

function renderGraphHtml(state: TutorState): string {
  const timeline = buildEvidenceTimeline(state);
  const groups = graphByType(timeline).map((group) => `<section class="graph-column"><h2>${escapeHtml(group.type)}</h2>${group.nodes.slice(0, 12).map((node) => `<article class="graph-node"><strong>${escapeHtml(node.label)}</strong><small>${escapeHtml(node.subtitle ?? node.path ?? node.status ?? '')}</small></article>`).join('')}</section>`).join('');
  const map = renderGraphMap(timeline.nodes, timeline.edges);
  const raw = escapeHtml(JSON.stringify({ nodes: timeline.nodes, edges: timeline.edges }, null, 2));
  return pageShell('MergeLearn Tutor Graph', `<section class="hero"><div><p class="eyebrow">Learning graph</p><h1>Courses, docs, questions, cards</h1><p>This is now a visual relationship map backed by /api/evidence-graph. It shows the product chain from evidence to courses, concepts, questions, cards, and review events.</p></div><div class="hero-card"><strong>${timeline.nodes.length}</strong><span>nodes</span><strong>${timeline.edges.length}</strong><span>edges</span></div></section>${nav()}${map}<section class="graph-grid">${groups}</section><details class="panel"><summary><strong>Raw graph projection</strong></summary><pre>${raw}</pre></details>`, 'Graph');
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
    return `<section class="panel"><h2>${escapeHtml(group.label)}</h2><ul>${children.map((child) => `<li>${escapeHtml(child!.label)} — ${Math.round(child!.mastery * 100)}% mastery, ${escapeHtml(child!.status.replace(/_/g, ' '))}</li>`).join('')}</ul></section>`;
  }).join('');
  const stats = `<div class="stats"><div>${graph.summary.new}<span>new</span></div><div>${graph.summary.learning}<span>learning</span></div><div>${graph.summary.confident}<span>confident</span></div><div>${graph.summary.needs_review}<span>needs review</span></div></div>`;
  return pageShell('MergeLearn Tutor Progress', `<section class="hero"><div><p class="eyebrow">Learning map</p><h1>Progress map</h1><p>Track what you have seen, what needs review, and which concepts are becoming confident.</p></div></section>${nav()}${stats}${groups}<details class="panel"><summary>Show raw CLI progress</summary><pre>${escapeHtml(renderProgress(state))}</pre></details>`, 'Progress map');
}

function renderHistoryHtml(state: TutorState): string {
  const data = cardHistoryData(state);
  const batches = data.batches.map((batch) => `<article class="mini-card"><strong>${escapeHtml(batch.mode)}</strong><p>${escapeHtml(batch.id)} · ${batch.itemIds.length} created · ${batch.archivedItemIds.length} archived</p><small>${escapeHtml(batch.createdAt)}</small></article>`).join('');
  const activeCards = data.cards.filter((card) => card.status !== 'archived');
  const archivedCards = data.cards.filter((card) => card.status === 'archived');
  const cardList = (cards: typeof data.cards) => cards.slice().reverse().map((card) => `<article class="mini-card ${card.status === 'archived' ? 'is-archived' : ''}"><div class="card-topline"><span>${escapeHtml(card.status)}</span><span>gen ${card.generation}</span><span>${escapeHtml(card.source)}</span></div><h3>${escapeHtml(card.title)}</h3><p>${escapeHtml(card.id)}${card.courseId ? ` · course ${escapeHtml(card.courseId)}` : ''}${card.questionId ? ` · question ${escapeHtml(card.questionId)}` : ''}</p><details><summary>${card.events.length} timeline events</summary><ul>${card.events.map((event) => `<li><strong>${escapeHtml(event.eventType)}</strong>${event.correct === undefined ? '' : ` · ${event.correct ? 'correct' : 'missed'}`} ${event.answerText ? `— ${escapeHtml(event.answerText)}` : ''}${event.note ? ` — ${escapeHtml(event.note)}` : ''}</li>`).join('')}</ul></details></article>`).join('');
  const activity = recentHistoryActivity(state);
  const metrics = `<div class="stats"><div>${data.summary.activeCards}<span>active</span></div><div>${data.summary.archivedCards}<span>archived</span></div><div>${data.summary.batches}<span>batches</span></div><div>${data.summary.events}<span>events</span></div></div>`;
  return pageShell('MergeLearn Tutor History', `<section class="hero"><div><p class="eyebrow">Learning memory</p><h1>History without the wall of cards</h1><p>Summary first. Dense card details are grouped below so regenerate history stays available without overwhelming the demo.</p></div></section>${nav()}${metrics}<section class="panel"><h2>Recent activity</h2><div class="timeline-list">${activity || '<p>No learning activity yet.</p>'}</div></section><section class="panel"><h2>Batches</h2><div class="mini-grid">${batches || '<p>No batches yet.</p>'}</div></section><details class="panel" open><summary><strong>Active cards</strong> · ${activeCards.length}</summary><div class="mini-grid">${cardList(activeCards) || '<p>No active cards.</p>'}</div></details><details class="panel"><summary><strong>Archived cards</strong> · ${archivedCards.length}</summary><div class="mini-grid">${cardList(archivedCards) || '<p>No archived cards.</p>'}</div></details><p><a href="/api/cards/history">Raw history JSON</a></p>`, 'History');
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
    ['language_mechanics', 'Do you want language mechanics questions?', 'Example: What does this union type allow and reject?'],
    ['local_behavior', 'Do you want function/block behavior questions?', 'Example: What happens when this input is undefined?'],
    ['file_role', 'Do you want file/module role questions?', 'Example: Why does this snippet belong in this file?'],
    ['architecture_flow', 'Do you want architecture and repo-flow questions?', 'Example: What calls this code and what depends on the result?'],
    ['risk_and_tests', 'Do you want risk and testing questions?', 'Example: What could break, and what test should catch it?'],
    ['repo_domain', 'Do you want repo-specific vocabulary questions?', 'Example: What does this project mean by this term here?'],
  ] as const;
  const checks = options.map(([plane, label, example]) => `<label class="choice"><input type="checkbox" data-plane="${plane}" ${preferences.review.enabledPlanes.includes(plane) ? 'checked' : ''} /><span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(example)}</small></span></label>`).join('');
  const body = `<section class="hero"><div><p class="eyebrow">Personalize the tutor</p><h1>Question preferences</h1><p>Choose the question categories that match how you want to learn from your code.</p></div></section>${nav()}<p>Pick the kinds of questions you want to receive. Keep this short: choose the categories that would actually help you read your code better.</p><section class="panel"><div class="choices">${checks}</div><label>Snippet lines <input id="snippet-lines" type="number" min="4" max="40" value="${preferences.review.snippetLineCount}" /></label><label class="choice"><input id="show-explanations" type="checkbox" ${preferences.review.showExplanationsByDefault ? 'checked' : ''} /><span><strong>Show explanations by default</strong><small>Useful while learning a new language; turn off for active recall.</small></span></label><button data-action="save-preferences">Save preferences</button></section>`;
  return pageShell('MergeLearn Tutor Preferences', body, 'Question preferences');
}

function nav(): string {
  return '<nav class="nav"><a href="/">Review</a><a href="/courses">Courses</a><a href="/questions">Questions</a><a href="/timeline">Timeline</a><a href="/graph">Graph</a><a href="/history">History</a><a href="/progress">Progress</a><a href="/preferences">Preferences</a></nav>';
}

function pageShell(title: string, body: string, status: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>${style()}</style></head><body><div class="status" id="status">${escapeHtml(status)}</div><main>${body}</main><script>${script()}</script></body></html>`;
}

function style(): string {
  return `
*,*:before,*:after{box-sizing:border-box}
body{font-family:Inter,ui-sans-serif,system-ui,sans-serif;margin:0;background:radial-gradient(circle at top left,#1e3a8a33,transparent 34rem),linear-gradient(180deg,#07111f,#0b1020 44%,#0a0f1d);color:#e2e8f0}
main{max-width:1160px;margin:0 auto;padding:34px 24px 80px}
a{color:#7dd3fc}.status{position:sticky;top:0;z-index:5;background:#020617cc;backdrop-filter:blur(16px);padding:10px 24px;border-bottom:1px solid #1e293b;color:#bae6fd}
.hero{display:grid;grid-template-columns:minmax(0,1fr) 220px;gap:24px;align-items:stretch;margin:22px 0 20px;padding:30px;border:1px solid #263854;border-radius:28px;background:linear-gradient(135deg,#12203a,#0f172a 70%);box-shadow:0 24px 70px #0007}
.hero h1{font-size:44px;line-height:1.02;margin:4px 0 12px;letter-spacing:-.04em}.hero p{color:#cbd5e1;font-size:17px}.hero-card{border:1px solid #334155;border-radius:22px;background:#02061799;padding:20px;display:grid;align-content:center;gap:5px}.hero-card strong{font-size:38px}.hero-card span{color:#93a4b8}
.nav,.toolbar{display:flex;flex-wrap:wrap;gap:12px;align-items:center;background:#0f172acc;border:1px solid #334155;border-radius:20px;padding:14px 16px;margin:18px 0;backdrop-filter:blur(18px)}.toolbar{justify-content:space-between}.toolbar p{margin:.3rem 0 0;color:#93a4b8}.nav a,.ghost,button{display:inline-flex;align-items:center;justify-content:center;margin:4px 4px 0 0;border-radius:999px;padding:10px 14px;font-weight:800;text-decoration:none;border:1px solid #3b526f;background:#182337;color:#e2e8f0;transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease,background .16s ease}
button:first-child,.actions button:first-child{background:linear-gradient(135deg,#38bdf8,#22c55e);border:0;color:#03111f}.nav a:hover,.ghost:hover,button:hover,.nav a:focus-visible,.ghost:focus-visible,button:focus-visible{transform:translateY(-2px);border-color:#7dd3fc;box-shadow:0 12px 28px #38bdf833;background:#24344f;outline:0}button:first-child:hover,.actions button:first-child:hover{box-shadow:0 16px 34px #22c55e33}button:disabled{opacity:.55;cursor:not-allowed;transform:none;box-shadow:none}
.card,.panel{background:linear-gradient(180deg,#111827,#0f172a);border:1px solid #30415c;border-radius:24px;padding:24px;margin:18px 0;box-shadow:0 16px 50px #0005}.review-grid{display:grid;gap:20px}.card.completed{border-color:#22c55e88;background:linear-gradient(180deg,#10251d,#0f172a)}.card-topline{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}.card-topline span,.eyebrow{border:1px solid #315071;border-radius:999px;padding:5px 10px;color:#bae6fd;background:#0b2740;text-transform:uppercase;font-size:12px;font-weight:800;letter-spacing:.08em}.eyebrow{display:inline-flex}.why{color:#a8b3c7}.snippet-head{display:flex;justify-content:space-between;gap:12px;margin:14px 0 0;padding:10px 12px;background:#020617;border:1px solid #1e293b;border-radius:14px 14px 0 0;color:#93c5fd;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px}
.question-box,.reveal-panel{border:1px solid #334155;border-radius:18px;background:#0b1220;padding:16px;margin:16px 0}.reveal-panel{background:#081b2d}.is-hidden{display:none}.label{font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:#67e8f9;font-weight:900;margin:0 0 8px}textarea,input{width:100%;border:1px solid #334155;border-radius:16px;background:#020617;color:#e2e8f0;padding:14px;font:inherit}textarea{min-height:96px;resize:vertical}.actions{display:flex;flex-wrap:wrap;gap:8px}.progress-track{height:9px;max-width:340px;background:#020617;border:1px solid #1e293b;border-radius:999px;margin-top:10px;overflow:hidden}.progress-track span{display:block;height:100%;background:linear-gradient(90deg,#38bdf8,#22c55e);transition:width .2s ease}.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin:18px 0}.stats div,.mini-card{border:1px solid #30415c;border-radius:20px;background:#0f172a;padding:18px}.stats div{font-size:30px;font-weight:900}.stats span{display:block;color:#93a4b8;font-size:13px;font-weight:700}.mini-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}.mini-card h3{margin:.5rem 0}.mini-card p,.mini-card small{color:#9fb0c8}.question-card h3{font-size:17px;line-height:1.18;display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow:hidden}.mini-card.is-archived{opacity:.74}.timeline-list{display:grid;gap:10px}.timeline-row{display:grid;grid-template-columns:110px minmax(0,1fr) minmax(120px,.55fr);gap:12px;align-items:center;border:1px solid #263854;border-radius:16px;background:#0b1220;padding:12px}.timeline-row span{color:#67e8f9;text-transform:uppercase;font-size:12px;font-weight:900}.timeline-row small,.graph-node small{color:#9fb0c8}.section-head{display:flex;justify-content:space-between;gap:18px;align-items:start}.section-head h2{margin:.1rem 0}.section-head p{color:#9fb0c8;margin:.4rem 0 0}.graph-map-panel{overflow:hidden}.graph-legend{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 16px}.graph-legend span{border:1px solid #315071;border-radius:999px;background:#0b2740;color:#bae6fd;padding:7px 10px;font-size:12px;font-weight:800}.graph-map{width:100%;height:auto;border:1px solid #263854;border-radius:22px;background:radial-gradient(circle at 20% 10%,#38bdf814,transparent 24rem),#07111f}.graph-lane-bg{fill:#0f172acc;stroke:#263854}.graph-lane-title{fill:#bae6fd;font-size:15px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.graph-edge{fill:none;stroke:#38bdf8;stroke-width:2;stroke-opacity:.5;marker-end:url(#arrow)}.graph-map-node rect{fill:#0b1220;stroke:#38bdf866;stroke-width:1.5}.graph-map-node:hover rect{stroke:#22c55e;fill:#0f2137}.graph-node-type{fill:#67e8f9;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.graph-node-label{fill:#e2e8f0;font-size:12px;font-weight:800}.graph-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}.graph-column{border:1px solid #30415c;border-radius:24px;background:#101827;padding:18px}.graph-node{border:1px solid #263854;border-radius:16px;background:#0b1220;padding:12px;margin:10px 0;display:grid;gap:6px}.graph-node strong{display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}.choices{display:grid;gap:12px;margin:14px 0}.choice{display:flex;gap:12px;padding:14px;border:1px solid #334155;border-radius:18px;background:#0b1220}.choice input{width:auto}.choice small{display:block;color:#93a4b8;margin-top:4px}pre{overflow:auto;background:#020617;border:1px solid #1e293b;border-radius:16px;padding:16px}
@media(max-width:760px){main{padding:20px 14px 60px}.hero{grid-template-columns:1fr;padding:22px}.hero h1{font-size:34px}.toolbar{position:static}.stats{grid-template-columns:repeat(2,minmax(0,1fr))}}
${diffSnippetCss()}`;
}

function script(): string {
  return `
function status(text){document.getElementById('status').textContent=text;}
async function post(path, body){const res=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const json=await res.json();status(json.ok?'Saved locally':json.error||'Request failed');return json;}
async function put(path, body){const res=await fetch(path,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const json=await res.json();status(json.ok?'Preferences saved':'Could not save preferences');return json;}
function csv(value){return String(value||'').split(',').map((item)=>item.trim()).filter(Boolean);}
function updateProgress(){const cards=[...document.querySelectorAll('.recall-card')];const done=cards.filter((card)=>card.classList.contains('completed')).length;const bar=document.getElementById('session-progress');if(bar&&cards.length){bar.style.width=Math.round(done/cards.length*100)+'%';}}
function markComplete(card,label){card.classList.add('completed');const state=card.querySelector('.card-state');if(state)state.textContent=label;card.querySelectorAll('.grade-actions button').forEach((button)=>button.disabled=true);updateProgress();}
document.addEventListener('click',async(event)=>{const target=event.target;if(!(target instanceof Element))return;const button=target.closest('button');if(!button)return;if(button.dataset.action==='generate-cards'){button.disabled=true;status('Generating cards...');const json=await post('/api/cards/generate',{count:5,mode:button.dataset.mode,reason:'website button'});if(json.ok) location.reload();return;}if(button.dataset.action==='save-preferences'){const enabledPlanes=[...document.querySelectorAll('input[data-plane]:checked')].map((input)=>input.dataset.plane);const snippetLineCount=Number(document.getElementById('snippet-lines').value||14);const showExplanationsByDefault=document.getElementById('show-explanations').checked;await put('/api/preferences',{review:{enabledPlanes,snippetLineCount,showExplanationsByDefault}});return;}if(button.dataset.action==='save-course'){const title=document.getElementById('course-title').value;const goal=document.getElementById('course-goal').value;if(!title||!goal){status('Course title and goal are required.');return;}const json=await post('/api/courses',{id:document.getElementById('course-id').value,title,goal,materialPaths:csv(document.getElementById('course-materials').value),docPaths:csv(document.getElementById('course-docs').value)});if(json.ok)location.reload();return;}if(button.dataset.action==='draft-questions'){const json=await post('/api/questions/draft',{provider:'fake',count:5});if(json.ok)location.reload();return;}if(button.dataset.action==='question-status'){const json=await post('/api/questions/status',{id:button.dataset.question,status:button.dataset.status});if(json.ok)location.reload();return;}const card=button.closest('.recall-card');if(!card)return;const itemId=card.dataset.item;const textarea=card.querySelector('textarea');if(button.dataset.action==='reveal'){card.querySelector('.reveal-panel')?.classList.remove('is-hidden');status('Explanation revealed. Self-grade when ready.');return;}if(button.dataset.action==='answer-grade'){const correct=button.dataset.correct==='true';const answer=textarea.value.trim();if(correct&&!answer){status('Write an answer before marking this as known.');textarea.focus();return;}const json=await post('/answer',{itemId,answer:answer||'I missed this after reveal.',correct});if(json.ok)markComplete(card,correct?'knew it':'missed it');return;}if(button.dataset.action==='feedback'){const json=await post('/feedback',{itemId,eventType:button.dataset.event,note:'from local review session'});if(json.ok)markComplete(card,button.dataset.event==='marked_bad_card'?'quality issue':button.textContent.trim().toLowerCase());}});
updateProgress();`;
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
