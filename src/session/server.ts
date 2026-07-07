/**
 * Local review GUI (docs/design/redesign-2026-07/04). Two surfaces only:
 * Home (sets + what's due) and Practice (one card: answer -> reveal -> grade).
 *
 * Model-free and offline: reads the v2 library, serves localhost, no network.
 * Cut down from the old 5-surface browser server; keeps its visual language
 * and the answer/reveal/grade interaction, drops the dead concept-era plumbing.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { getDueCards } from '../core/library/review/dueQueue.js';
import { startSession, gradeCard, endSession } from '../core/library/review/session.js';
import { listSetSummaries } from '../core/library/setStore.js';
import { loadCard } from '../core/library/cardStore.js';
import type { Card, ReviewRating } from '../core/library/types.js';

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
  if (method === 'GET' && url.pathname === '/api/due') return sendJson(res, 200, await dueData(root, url));
  if (method === 'POST' && url.pathname === '/api/grade') return gradeApi(root, req, res);
  return sendText(res, 404, 'not found\n');
}

// ---- API ----

async function dueData(root: string, url: URL): Promise<unknown> {
  const filter = {
    setIds: url.searchParams.get('set') ? [url.searchParams.get('set')!] : undefined,
    tagIds: url.searchParams.get('tag') ? [url.searchParams.get('tag')!] : undefined,
    folderPaths: url.searchParams.get('folder') ? [url.searchParams.get('folder')!] : undefined,
  };
  const due = await getDueCards(root, new Date(), filter);
  return { total: due.length, cards: due.map(cardView) };
}

/** Trim a card to what the Practice UI renders (front, back, frozen code). */
function cardView(card: Card) {
  return {
    id: card.id,
    setId: card.setId,
    prompt: card.front.prompt,
    context: card.front.contextMarkdown ?? null,
    shortAnswer: card.back.shortAnswer,
    explanation: card.back.explanationMarkdown,
    examples: card.back.examples ?? [],
    commonMistakes: card.back.commonMistakes ?? [],
    sources: (card.sourceRefs ?? []).map((r) => ({
      path: r.path, startLine: r.startLine, endLine: r.endLine,
      commit: r.commit.slice(0, 8), status: r.status, text: r.frozenText ?? '',
    })),
  };
}

async function gradeApi(root: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = (await readJson(req)) as { cardId?: string; setId?: string; rating?: number };
  const rating = Number(body.rating) as ReviewRating;
  if (!body.cardId || !body.setId || ![1, 2, 3, 4].includes(rating)) {
    return sendJson(res, 400, { ok: false, error: 'need cardId, setId, rating(1-4)' });
  }
  const card = await loadCard(root, body.setId, body.cardId);
  if (!card) return sendJson(res, 404, { ok: false, error: 'card not found' });
  // One sitting per grade, matching the CLI. (Batched sittings are a future refinement.)
  const session = startSession('recommended');
  const updated = await gradeCard(root, session, card, rating);
  await endSession(root, session);
  return sendJson(res, 200, { ok: true, cardId: updated.id, due: updated.fsrs.due });
}

// ---- Home tab ----

async function renderHome(root: string): Promise<string> {
  const [summaries, due] = await Promise.all([
    listSetSummaries(root),
    getDueCards(root, new Date()),
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

  const cta = due.length > 0
    ? `<a class="cta" href="/practice">Start practice</a>`
    : `<span class="cta is-disabled">Nothing due right now</span>`;
  const banner = `<div class="due-banner"><strong>${due.length}</strong>` +
    `<span class="muted">card${due.length === 1 ? '' : 's'} due today</span></div>${cta}`;

  const rows = summaries.map((s) => {
    const d = dueBySet.get(s.id) ?? 0;
    const dueBadge = d > 0 ? `<span class="badge due">${d} due</span>` : '';
    const path = s.folderPath ? `<span class="path">${escapeHtml(s.folderPath)}</span>` : '';
    return `<li class="set-row"><span class="title">${escapeHtml(s.title)}</span>${path}` +
      `${dueBadge}<span class="count">${s.cardCount} card${s.cardCount === 1 ? '' : 's'}</span></li>`;
  }).join('');

  const body = `<h1>Home</h1>${banner}<h2 style="margin-top:28px">Your sets</h2>` +
    `<ul class="set-list">${rows}</ul>`;
  return pageShell('MergeLearn — Home', 'home', body);
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
var queue=[];var pos=0;var reviewed=0;
function statusMsg(t){var s=document.getElementById('status');s.textContent=t;s.classList.add('show');setTimeout(function(){s.classList.remove('show');},1600);}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function progress(){var p=document.getElementById('progress');if(!queue.length){p.textContent='';return;}p.textContent='Card '+Math.min(pos+1,queue.length)+' of '+queue.length+' · '+reviewed+' reviewed';}
function render(){
  progress();
  var mount=document.getElementById('mount');
  if(pos>=queue.length){mount.innerHTML=queue.length?'<div class="done-note">Session complete — '+reviewed+' reviewed. Nothing more due.</div>':'<div class="empty">Nothing due right now. Come back later, or author more cards.</div>';return;}
  var c=queue[pos];
  var fmt=function(s){return esc(s).replace(/\x60([^\x60]+)\x60/g,'<code>$1</code>');};
  var srcs=(c.sources||[]).map(function(s){return '<div class="src"><div class="meta">'+esc(s.path)+':'+s.startLine+'-'+s.endLine+' @ '+esc(s.commit)+' ('+esc(s.status)+')</div><pre>'+esc(s.text)+'</pre></div>';}).join('');
  var examples=(c.examples||[]).map(function(x){var head=(x.label||'')+(x.language?' ('+x.language+')':'');var code=x.code?'<pre><code>'+esc(x.code)+'</code></pre>':'';var note=x.note?'<div class="ex-note">'+fmt(x.note)+'</div>':'';return '<div class="ex">'+(head?'<div class="ex-label">'+esc(head)+'</div>':'')+code+note+'</div>';}).join('');
  var ctx=c.context?'<p class="ctx">'+fmt(c.context)+'</p>':'';
  var mistakes=(c.commonMistakes||[]).length?'<p class="label">Common mistakes</p><ul>'+c.commonMistakes.map(function(m){return '<li>'+fmt(m)+'</li>';}).join('')+'</ul>':'';
  mount.innerHTML='<article class="pcard"><div class="topline"><span>'+esc(c.setId)+'</span><span>'+esc(c.id)+'</span></div>'+
    '<p class="prompt">'+fmt(c.prompt)+'</p>'+ctx+
    '<div class="actions"><button class="primary" id="reveal">Reveal answer <kbd>space</kbd></button></div>'+
    '<div class="reveal" id="reveal-panel"><p class="label">Answer</p><p class="short">'+fmt(c.shortAnswer)+'</p>'+
    '<p class="label">Explanation</p><div class="expl">'+fmt(c.explanation)+'</div>'+examples+mistakes+srcs+
    '<div class="actions grade"><button class="g1" data-r="1">Again<kbd>1</kbd></button><button class="g2" data-r="2">Hard<kbd>2</kbd></button><button class="g3" data-r="3">Good<kbd>3</kbd></button><button class="g4" data-r="4">Easy<kbd>4</kbd></button></div></div></article>';
  document.getElementById('reveal').addEventListener('click',reveal);
  [].forEach.call(document.querySelectorAll('.grade button'),function(b){b.addEventListener('click',function(){grade(Number(b.getAttribute('data-r')));});});
}
function reveal(){document.getElementById('reveal-panel').classList.add('show');document.getElementById('reveal').disabled=true;}
function isRevealed(){var p=document.getElementById('reveal-panel');return p&&p.classList.contains('show');}
async function grade(r){
  var c=queue[pos];if(!c)return;
  try{
    var res=await fetch('/api/grade',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({cardId:c.id,setId:c.setId,rating:r})});
    var j=await res.json();
    if(!j.ok){statusMsg(j.error||'grade failed');return;}
    reviewed++;statusMsg('Graded · next due '+new Date(j.due).toLocaleDateString());
    pos++;render();
  }catch(e){statusMsg('grade failed');}
}
document.addEventListener('keydown',function(e){
  if(['INPUT','TEXTAREA','SELECT'].indexOf(e.target.tagName)>=0)return;
  if(e.key===' '||e.key==='Enter'){e.preventDefault();if(!isRevealed())reveal();return;}
  if(/^[1-4]$/.test(e.key)&&isRevealed())grade(Number(e.key));
});
(async function(){try{var res=await fetch('/api/due');var j=await res.json();queue=j.cards||[];}catch(e){queue=[];}render();})();
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

type Tab = 'home' | 'practice';

function pageShell(title: string, tab: Tab, body: string): string {
  const nav = (['home', 'practice'] as Tab[])
    .map((t) => {
      const href = t === 'home' ? '/' : '/practice';
      const label = t === 'home' ? 'Home' : 'Practice';
      const current = t === tab ? ' aria-current="page"' : '';
      return `<a href="${href}"${current}>${label}</a>`;
    })
    .join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" />` +
    `<meta name="viewport" content="width=device-width, initial-scale=1" />` +
    `<title>${escapeHtml(title)}</title><style>${style()}</style></head><body>` +
    `<header class="topbar"><span class="brand">MergeLearn</span>` +
    `<nav class="tabs">${nav}</nav>` +
    `<span class="hint">local · model-free</span></header>` +
    `<main>${body}</main></body></html>`;
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
.ctx{color:var(--muted);margin:0 0 16px}
.reveal{margin-top:18px;padding-top:18px;border-top:1px solid var(--border);display:none}
.reveal.show{display:block}
.label{text-transform:uppercase;letter-spacing:0.08em;font-size:11px;color:var(--muted);margin:0 0 4px}
.short{font-weight:600;margin:0 0 14px}
.expl{white-space:pre-wrap}
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
.done-note{text-align:center;padding:40px;color:var(--success);font-weight:600}`;
}
