import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { addCorrection, recordReviewEvent } from '../core/events.js';
import { recordAnswer } from '../core/planner.js';
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
  if (method === 'GET' && url.pathname === '/preferences') return sendHtml(res, 200, renderPreferencesHtml(await loadPreferences(repoPath)));
  if (method === 'GET' && (url.pathname === '/state.json' || url.pathname === '/api/state')) return sendJson(res, 200, await loadState(repoPath));
  if (method === 'GET' && url.pathname === '/api/progress') return sendJson(res, 200, buildProgressGraph(await loadState(repoPath)));
  if (method === 'GET' && url.pathname === '/api/preferences') return sendJson(res, 200, await loadPreferences(repoPath));
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
  return { concepts: state.concepts.length, cards: state.learningItems.length, events: state.learningEvents.length, corrections: state.corrections.length };
}

function renderSessionHtml(state: TutorState, preferences: UserPreferences): string {
  const cards = state.learningItems.slice(0, 8).map((item, index) => `
    <article class="card" data-item="${escapeHtml(item.id)}">
      <p class="eyebrow">Card ${index + 1} · ${escapeHtml(item.questionPlane.replace(/_/g, ' '))} · ${escapeHtml(item.difficulty)}</p>
      <h2>${escapeHtml(item.title)}</h2>
      <p class="why">${escapeHtml(item.whyShown ?? 'Shown from recent repo evidence.')}</p>
      <p class="path">Snippet from <code>${escapeHtml(item.snippet.path)}</code></p>
      <pre><code>${escapeHtml(item.snippet.code)}</code></pre>
      <p><strong>Question:</strong> ${escapeHtml(item.prompt)}</p>
      <details ${preferences.review.showExplanationsByDefault ? 'open' : ''}><summary>Explanation if stuck</summary><p>${escapeHtml(item.explanationMarkdown)}</p></details>
      <textarea placeholder="Explain what is happening in the snippet"></textarea>
      <div class="actions">
        <button data-action="answer" data-correct="true">Save answer</button>
        <button data-action="feedback" data-event="marked_unsure">Unsure</button>
        <button data-action="feedback" data-event="marked_wrong">Bad card</button>
        <button data-action="feedback" data-event="marked_useful">Useful</button>
      </div>
    </article>`).join('\n');
  return pageShell('MergeLearn Tutor Review', `<p><a href="/preferences">Question preferences</a> · <a href="/progress">Progress map</a> · <a href="/api/preferences">Preferences JSON</a></p><p>Answer from the code snippet first. Everything stays local in <code>.skilltrace/state.json</code>.</p>${cards || '<p>No cards yet. Run ingest first.</p>'}`, renderToday(state, 3).split('\n')[0] ?? 'Review session');
}

function renderProgressHtml(state: TutorState): string {
  const graph = buildProgressGraph(state);
  const groups = graph.nodes.filter((node) => node.kind === 'group').map((group) => {
    const children = graph.edges.filter((edge) => edge.type === 'group' && edge.from === group.id).map((edge) => graph.nodes.find((node) => node.id === edge.to)).filter(Boolean);
    return `<section class="panel"><h2>${escapeHtml(group.label)}</h2><ul>${children.map((child) => `<li>${escapeHtml(child!.label)} — ${Math.round(child!.mastery * 100)}% mastery, ${escapeHtml(child!.status.replace(/_/g, ' '))}</li>`).join('')}</ul></section>`;
  }).join('');
  const stats = `<div class="stats"><div>${graph.summary.new}<span>new</span></div><div>${graph.summary.learning}<span>learning</span></div><div>${graph.summary.confident}<span>confident</span></div><div>${graph.summary.needs_review}<span>needs review</span></div></div>`;
  return pageShell('MergeLearn Tutor Progress', `<p><a href="/">Review cards</a> · <a href="/preferences">Question preferences</a> · <a href="/api/progress">Progress JSON</a></p>${stats}<pre>${escapeHtml(renderProgress(state))}</pre>${groups}`, 'Progress map');
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
  const body = `<p><a href="/">Review cards</a> · <a href="/progress">Progress map</a></p><p>Pick the kinds of questions you want to receive. Keep this short: choose the categories that would actually help you read your code better.</p><section class="panel"><div class="choices">${checks}</div><label>Snippet lines <input id="snippet-lines" type="number" min="4" max="40" value="${preferences.review.snippetLineCount}" /></label><label class="choice"><input id="show-explanations" type="checkbox" ${preferences.review.showExplanationsByDefault ? 'checked' : ''} /><span><strong>Show explanations by default</strong><small>Useful while learning a new language; turn off for active recall.</small></span></label><button data-action="save-preferences">Save preferences</button></section>`;
  return pageShell('MergeLearn Tutor Preferences', body, 'Question preferences');
}

function pageShell(title: string, body: string, status: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>${style()}</style></head><body><div class="status" id="status">${escapeHtml(status)}</div><main><h1>${escapeHtml(title)}</h1>${body}</main><script>${script()}</script></body></html>`;
}

function style(): string {
  return 'body{font-family:Inter,system-ui,sans-serif;margin:0;background:#0f172a;color:#e2e8f0}main{max-width:980px;margin:0 auto;padding:32px}a{color:#7dd3fc}.card,.panel{background:#111827;border:1px solid #334155;border-radius:16px;padding:22px;margin:18px 0;box-shadow:0 10px 30px #0004}.eyebrow{color:#93c5fd;text-transform:uppercase;font-size:12px;letter-spacing:.08em}.why,.path{color:#cbd5e1}pre{white-space:pre-wrap;background:#020617;color:#e2e8f0;padding:14px;border-radius:12px;overflow:auto;border:1px solid #334155}textarea{width:100%;min-height:90px;border-radius:10px;border:1px solid #475569;background:#020617;color:#e2e8f0;padding:12px}button{margin:8px 8px 0 0;border:0;border-radius:999px;padding:10px 14px;background:#38bdf8;color:#082f49;font-weight:700}button:nth-child(n+2){background:#1e293b;color:#e2e8f0;border:1px solid #475569}input[type=number]{margin-left:8px;border-radius:8px;border:1px solid #475569;background:#020617;color:#e2e8f0;padding:8px}code{color:#bae6fd}.status{position:sticky;top:0;background:#020617;padding:10px;border-bottom:1px solid #334155}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.stats div{background:#111827;border:1px solid #334155;border-radius:14px;padding:16px;font-size:28px;font-weight:800}.stats span{display:block;font-size:12px;color:#cbd5e1;font-weight:400}.choices{display:grid;gap:10px;margin:16px 0}.choice{display:flex;gap:12px;align-items:flex-start;background:#0f172a;border:1px solid #334155;border-radius:12px;padding:12px}.choice small{display:block;color:#cbd5e1;margin-top:4px}@media(max-width:800px){.stats{grid-template-columns:1fr 1fr}}';
}

function script(): string {
  return "async function post(path, body){const res=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const json=await res.json();document.getElementById('status').textContent=json.ok?'Saved locally':json.error;return json;}async function put(path, body){const res=await fetch(path,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const json=await res.json();document.getElementById('status').textContent=json.ok?'Preferences saved':'Could not save preferences';return json;}document.addEventListener('click',async(event)=>{const button=event.target.closest('button');if(!button)return;if(button.dataset.action==='save-preferences'){const enabledPlanes=[...document.querySelectorAll('input[data-plane]:checked')].map((input)=>input.dataset.plane);const snippetLineCount=Number(document.getElementById('snippet-lines').value||14);const showExplanationsByDefault=document.getElementById('show-explanations').checked;await put('/api/preferences',{review:{enabledPlanes,snippetLineCount,showExplanationsByDefault}});return;}const card=button.closest('.card');if(!card)return;const itemId=card.dataset.item;if(button.dataset.action==='answer'){await post('/answer',{itemId,answer:card.querySelector('textarea').value,correct:button.dataset.correct==='true'});}else{await post('/feedback',{itemId,eventType:button.dataset.event,note:'from local review session'});}});";
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
