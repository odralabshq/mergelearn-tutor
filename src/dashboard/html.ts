import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { renderKnowledgeDebt, renderMermaidMap, renderToday } from '../core/render.js';
import type { TutorState } from '../core/types.js';

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function conceptRows(state: TutorState): string {
  return state.conceptStates.slice(0, 30).map((item) => {
    const concept = state.concepts.find((candidate) => candidate.id === item.conceptId);
    const mastery = Math.round(item.masteryEstimate * 100);
    const className = mastery < 35 ? 'weak' : mastery < 65 ? 'learning' : 'solid';
    return `<tr><td>${esc(concept?.label ?? item.conceptId)}</td><td>${esc(concept?.kind ?? '')}</td><td>${item.exposureCount}</td><td><span class="pill ${className}">${mastery}%</span></td><td>${item.importance.toFixed(2)}</td></tr>`;
  }).join('\n');
}

function cards(state: TutorState): string {
  return state.learningItems.slice(0, 8).map((item) => `<section class="card"><div class="meta">${esc(item.type)} · ${esc(item.difficulty)}</div><h3>${esc(item.title)}</h3><p>${esc(item.prompt)}</p><ul>${item.evidence.slice(0, 3).map((ev) => `<li><code>${esc(ev.path)}</code></li>`).join('')}</ul></section>`).join('\n');
}

export async function writeDashboard(repoPath: string, state: TutorState, outFile = '.skilltrace/dashboard.html'): Promise<string> {
  const outputPath = path.resolve(repoPath, outFile);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, renderDashboard(state));
  return outputPath;
}

export function renderDashboard(state: TutorState): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>MergeLearn Tutor</title><style>${style()}</style></head><body><main><header><h1>MergeLearn Tutor</h1><p>Local-first knowledge debt dashboard for ${esc(state.repoPath)}</p></header><section class="grid"><div class="panel"><h2>Today</h2><pre>${esc(renderToday(state, 5))}</pre></div><div class="panel"><h2>Knowledge debt</h2><pre>${esc(renderKnowledgeDebt(state))}</pre></div></section><section class="panel"><h2>Learning cards</h2><div class="cards">${cards(state)}</div></section><section class="panel"><h2>Skill ledger</h2><table><thead><tr><th>Concept</th><th>Kind</th><th>Exposure</th><th>Mastery</th><th>Importance</th></tr></thead><tbody>${conceptRows(state)}</tbody></table></section><section class="panel"><h2>Skill graph Mermaid</h2><pre>${esc(renderMermaidMap(state))}</pre></section></main></body></html>`;
}

function style(): string {
  return 'body{margin:0;background:#0b1020;color:#e5e7eb;font-family:Inter,system-ui,sans-serif}main{max-width:1180px;margin:0 auto;padding:32px}header,.panel{background:#111827;border:1px solid #26324f;border-radius:18px;padding:22px;margin-bottom:20px;box-shadow:0 12px 28px rgba(0,0,0,.25)}h1,h2,h3{margin-top:0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}.card{background:#0f172a;border:1px solid #334155;border-radius:14px;padding:16px}.meta{color:#93c5fd;text-transform:uppercase;font-size:12px;font-weight:700}pre{white-space:pre-wrap;background:#020617;padding:14px;border-radius:12px;overflow:auto}table{width:100%;border-collapse:collapse}td,th{padding:10px;border-bottom:1px solid #26324f;text-align:left}.pill{border-radius:999px;padding:4px 10px;font-weight:700}.weak{background:#7f1d1d;color:#fecaca}.learning{background:#713f12;color:#fde68a}.solid{background:#14532d;color:#bbf7d0}@media(max-width:800px){.grid{grid-template-columns:1fr}}';
}
