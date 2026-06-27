import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { diffSnippetCss, renderDiffSnippetHtml } from '../core/diffView.js';
import { addCorrection, recordReviewEvent } from '../core/events.js';
import { activeLearningItems, generateCardBatch, recordAnswer } from '../core/planner.js';
import { loadPreferences, normalizePreferences, savePreferences } from '../core/preferences.js';
import { buildProgressGraph } from '../core/progress.js';
import { renderProgress, renderToday } from '../core/render.js';
import { loadState, saveState } from '../core/store.js';
import type { CorrectionType, ReviewEventType, TutorState, UserPreferences } from '../core/types.js';

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
  if (method === 'GET' && url.pathname === '/progress') return sendHtml(res, 200, renderProgressHtml(await loadState(repoPath)));
  if (method === 'GET' && url.pathname === '/history') return sendHtml(res, 200, renderHistoryHtml(await loadState(repoPath)));
  if (method === 'GET' && url.pathname === '/preferences') return sendHtml(res, 200, renderPreferencesHtml(await loadPreferences(repoPath)));
  if (method === 'GET' && (url.pathname === '/state.json' || url.pathname === '/api/state')) return sendJson(res, 200, await loadState(repoPath));
  if (method === 'GET' && url.pathname === '/api/progress') return sendJson(res, 200, buildProgressGraph(await loadState(repoPath)));
  if (method === 'GET' && url.pathname === '/api/cards/history') return sendJson(res, 200, cardHistoryData(await loadState(repoPath)));
  if (method === 'GET' && url.pathname === '/api/preferences') return sendJson(res, 200, await loadPreferences(repoPath));
  if (method === 'POST' && url.pathname === '/api/cards/generate') {
    const body = await readJson(req) as { count?: number; mode?: string; reason?: string };
    const mode = body.mode === 'regenerate' ? 'regenerate' : 'more';
    const next = generateCardBatch(await loadState(repoPath), await loadPreferences(repoPath), { count: body.count ?? 5, mode, reason: body.reason });
    await saveState(repoPath, next);
    const batch = next.cardBatches.at(-1)!;
    return sendJson(res, 200, { ok: true, batch, state: summarizeState(next) });
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
      batchId: item.batchId,
      generation: item.generation,
      source: item.source,
      archivedAt: item.archivedAt,
      events: state.learningEvents.filter((event) => event.itemId === item.id),
    })),
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
  const controls = `<section class="toolbar"><div><strong>Card queue</strong><p>${latestBatch ? `Latest batch ${escapeHtml(latestBatch.id)} · ${latestBatch.mode}` : 'No generated batch yet.'}</p><div class="progress-track"><span id="session-progress" style="width:0%"></span></div></div><div><button data-action="generate-cards" data-mode="more">Generate 5 more</button><button data-action="generate-cards" data-mode="regenerate">Regenerate 5</button><a class="ghost" href="/history">History</a><a class="ghost" href="/preferences">Preferences</a><a class="ghost" href="/progress">Progress</a></div></section>`;
  return pageShell('MergeLearn Tutor Review', `${hero}${controls}<section class="review-grid">${cards || '<p>No cards yet. Run ingest first.</p>'}</section>`, 'Ready');
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
  const cards = data.cards.slice().reverse().map((card) => `<article class="mini-card ${card.status === 'archived' ? 'is-archived' : ''}"><div class="card-topline"><span>${escapeHtml(card.status)}</span><span>gen ${card.generation}</span><span>${escapeHtml(card.source)}</span></div><h3>${escapeHtml(card.title)}</h3><p>${escapeHtml(card.id)}${card.batchId ? ` · batch ${escapeHtml(card.batchId)}` : ''}</p><details><summary>${card.events.length} timeline events</summary><ul>${card.events.map((event) => `<li><strong>${escapeHtml(event.eventType)}</strong>${event.correct === undefined ? '' : ` · ${event.correct ? 'correct' : 'missed'}`} ${event.answerText ? `— ${escapeHtml(event.answerText)}` : ''}${event.note ? ` — ${escapeHtml(event.note)}` : ''}</li>`).join('')}</ul></details></article>`).join('');
  const metrics = `<div class="stats"><div>${data.summary.activeCards}<span>active</span></div><div>${data.summary.archivedCards}<span>archived</span></div><div>${data.summary.batches}<span>batches</span></div><div>${data.summary.events}<span>events</span></div></div>`;
  return pageShell('MergeLearn Tutor History', `<section class="hero"><div><p class="eyebrow">Learning memory</p><h1>Card history and batches</h1><p>See current and archived cards, generated batches, and answer/quality events without losing old learning evidence.</p></div></section>${nav()}${metrics}<section class="panel"><h2>Batches</h2><div class="mini-grid">${batches || '<p>No batches yet.</p>'}</div></section><section class="panel"><h2>Cards</h2><div class="mini-grid">${cards || '<p>No cards yet.</p>'}</div></section>`, 'History');
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
  return '<nav class="nav"><a href="/">Review</a><a href="/history">History</a><a href="/progress">Progress</a><a href="/preferences">Preferences</a><a href="/api/cards/history">History JSON</a></nav>';
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
.question-box,.reveal-panel{border:1px solid #334155;border-radius:18px;background:#0b1220;padding:16px;margin:16px 0}.reveal-panel{background:#081b2d}.is-hidden{display:none}.label{font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:#67e8f9;font-weight:900;margin:0 0 8px}textarea,input{width:100%;border:1px solid #334155;border-radius:16px;background:#020617;color:#e2e8f0;padding:14px;font:inherit}textarea{min-height:96px;resize:vertical}.actions{display:flex;flex-wrap:wrap;gap:8px}.progress-track{height:9px;max-width:340px;background:#020617;border:1px solid #1e293b;border-radius:999px;margin-top:10px;overflow:hidden}.progress-track span{display:block;height:100%;background:linear-gradient(90deg,#38bdf8,#22c55e);transition:width .2s ease}.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin:18px 0}.stats div,.mini-card{border:1px solid #30415c;border-radius:20px;background:#0f172a;padding:18px}.stats div{font-size:30px;font-weight:900}.stats span{display:block;color:#93a4b8;font-size:13px;font-weight:700}.mini-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}.mini-card h3{margin:.5rem 0}.mini-card p,.mini-card small{color:#9fb0c8}.mini-card.is-archived{opacity:.74}.choices{display:grid;gap:12px;margin:14px 0}.choice{display:flex;gap:12px;padding:14px;border:1px solid #334155;border-radius:18px;background:#0b1220}.choice input{width:auto}.choice small{display:block;color:#93a4b8;margin-top:4px}pre{overflow:auto;background:#020617;border:1px solid #1e293b;border-radius:16px;padding:16px}
@media(max-width:760px){main{padding:20px 14px 60px}.hero{grid-template-columns:1fr;padding:22px}.hero h1{font-size:34px}.toolbar{position:static}.stats{grid-template-columns:repeat(2,minmax(0,1fr))}}
${diffSnippetCss()}`;
}

function script(): string {
  return `
function status(text){document.getElementById('status').textContent=text;}
async function post(path, body){const res=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const json=await res.json();status(json.ok?'Saved locally':json.error||'Request failed');return json;}
async function put(path, body){const res=await fetch(path,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const json=await res.json();status(json.ok?'Preferences saved':'Could not save preferences');return json;}
function updateProgress(){const cards=[...document.querySelectorAll('.recall-card')];const done=cards.filter((card)=>card.classList.contains('completed')).length;const bar=document.getElementById('session-progress');if(bar&&cards.length){bar.style.width=Math.round(done/cards.length*100)+'%';}}
function markComplete(card,label){card.classList.add('completed');const state=card.querySelector('.card-state');if(state)state.textContent=label;card.querySelectorAll('.grade-actions button').forEach((button)=>button.disabled=true);updateProgress();}
document.addEventListener('click',async(event)=>{const target=event.target;if(!(target instanceof Element))return;const button=target.closest('button');if(!button)return;if(button.dataset.action==='generate-cards'){button.disabled=true;status('Generating cards...');const json=await post('/api/cards/generate',{count:5,mode:button.dataset.mode,reason:'website button'});if(json.ok) location.reload();return;}if(button.dataset.action==='save-preferences'){const enabledPlanes=[...document.querySelectorAll('input[data-plane]:checked')].map((input)=>input.dataset.plane);const snippetLineCount=Number(document.getElementById('snippet-lines').value||14);const showExplanationsByDefault=document.getElementById('show-explanations').checked;await put('/api/preferences',{review:{enabledPlanes,snippetLineCount,showExplanationsByDefault}});return;}const card=button.closest('.recall-card');if(!card)return;const itemId=card.dataset.item;const textarea=card.querySelector('textarea');if(button.dataset.action==='reveal'){card.querySelector('.reveal-panel')?.classList.remove('is-hidden');status('Explanation revealed. Self-grade when ready.');return;}if(button.dataset.action==='answer-grade'){const correct=button.dataset.correct==='true';const answer=textarea.value.trim();if(correct&&!answer){status('Write an answer before marking this as known.');textarea.focus();return;}const json=await post('/answer',{itemId,answer:answer||'I missed this after reveal.',correct});if(json.ok)markComplete(card,correct?'knew it':'missed it');return;}if(button.dataset.action==='feedback'){const json=await post('/feedback',{itemId,eventType:button.dataset.event,note:'from local review session'});if(json.ok)markComplete(card,button.dataset.event==='marked_bad_card'?'quality issue':button.textContent.trim().toLowerCase());}});
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
