import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { addCorrection, recordReviewEvent } from '../core/events.js';
import { recordAnswer } from '../core/planner.js';
import { renderToday } from '../core/render.js';
import { loadState, saveState } from '../core/store.js';
import type { CorrectionType, ReviewEventType, TutorState } from '../core/types.js';

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
  if (method === 'GET' && url.pathname === '/') return sendHtml(res, 200, renderSessionHtml(await loadState(repoPath)));
  if (method === 'GET' && url.pathname === '/state.json') return sendJson(res, 200, await loadState(repoPath));
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

function renderSessionHtml(state: TutorState): string {
  const cards = state.learningItems.slice(0, 5).map((item, index) => `
    <article class="card" data-item="${escapeHtml(item.id)}">
      <p class="eyebrow">Card ${index + 1} · ${escapeHtml(item.type)} · ${escapeHtml(item.difficulty)}</p>
      <h2>${escapeHtml(item.title)}</h2>
      <p class="why">${escapeHtml(item.whyShown ?? 'Shown from recent repo evidence.')}</p>
      <p><strong>Prompt:</strong> ${escapeHtml(item.prompt)}</p>
      <details><summary>Evidence</summary><ul>${item.evidence.map((ev) => `<li><code>${escapeHtml(ev.path)}</code></li>`).join('')}</ul></details>
      <textarea placeholder="Explain it back in your own words"></textarea>
      <div class="actions">
        <button data-action="answer" data-correct="true">Save answer</button>
        <button data-action="feedback" data-event="marked_unsure">Unsure</button>
        <button data-action="feedback" data-event="marked_wrong">Bad card</button>
        <button data-action="feedback" data-event="marked_useful">Useful</button>
      </div>
    </article>`).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>MergeLearn Tutor Review</title>
<style>
body{font-family:Inter,system-ui,sans-serif;margin:0;background:#0f172a;color:#e2e8f0}main{max-width:900px;margin:0 auto;padding:32px}.card{background:#111827;border:1px solid #334155;border-radius:16px;padding:22px;margin:18px 0;box-shadow:0 10px 30px #0004}.eyebrow{color:#93c5fd;text-transform:uppercase;font-size:12px;letter-spacing:.08em}.why{color:#cbd5e1}textarea{width:100%;min-height:90px;border-radius:10px;border:1px solid #475569;background:#020617;color:#e2e8f0;padding:12px}button{margin:8px 8px 0 0;border:0;border-radius:999px;padding:10px 14px;background:#38bdf8;color:#082f49;font-weight:700}button:nth-child(n+2){background:#1e293b;color:#e2e8f0;border:1px solid #475569}code{color:#bae6fd}.status{position:sticky;top:0;background:#020617;padding:10px;border-bottom:1px solid #334155}</style>
</head>
<body><div class="status" id="status">${escapeHtml(renderToday(state, 3).split('\n')[0] ?? 'Review session')}</div><main><h1>MergeLearn Tutor Review</h1><p>Answer, mark uncertainty, or flag bad cards. Everything stays local in <code>.skilltrace/state.json</code>.</p>${cards || '<p>No cards yet. Run ingest first.</p>'}</main>
<script>
async function post(path, body){const res=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const json=await res.json();document.getElementById('status').textContent=json.ok?'Saved locally':json.error;return json;}
document.addEventListener('click', async (event)=>{const button=event.target.closest('button');if(!button)return;const card=button.closest('.card');const itemId=card.dataset.item;if(button.dataset.action==='answer'){await post('/answer',{itemId,answer:card.querySelector('textarea').value,correct:button.dataset.correct==='true'});}else{await post('/feedback',{itemId,eventType:button.dataset.event,note:'from local review session'});}});
</script></body></html>`;
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
