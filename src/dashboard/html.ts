import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { buildProgressGraph } from '../core/progress.js';
import { renderKnowledgeDebt, renderProgress, renderToday } from '../core/render.js';
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
  return state.learningItems.slice(0, 8).map((item) => `<section class="card"><div class="meta">${esc(item.questionPlane.replace(/_/g, ' '))} · ${esc(item.difficulty)}</div><h3>${esc(item.title)}</h3><p class="path">${esc(item.snippet.path)}</p><pre class="snippet"><code>${esc(item.snippet.code)}</code></pre><p><strong>Question:</strong> ${esc(item.prompt)}</p><details><summary>Explanation if stuck</summary><p>${esc(item.explanationMarkdown)}</p></details></section>`).join('\n');
}

function progressSummary(state: TutorState): string {
  const graph = buildProgressGraph(state);
  return `<div class="stats"><div><strong>${graph.summary.new}</strong><span>new</span></div><div><strong>${graph.summary.learning}</strong><span>learning</span></div><div><strong>${graph.summary.confident}</strong><span>confident</span></div><div><strong>${graph.summary.needs_review}</strong><span>needs review</span></div></div>`;
}

function progressGraphSvg(state: TutorState): string {
  const graph = buildProgressGraph(state);
  const nodes = graph.nodes.filter((node) => node.kind !== 'group').slice(0, 24);
  const width = 920;
  const height = Math.max(240, Math.ceil(nodes.length / 4) * 120);
  const positioned = nodes.map((node, index) => ({ node, x: 90 + (index % 4) * 220, y: 70 + Math.floor(index / 4) * 110 }));
  const byId = new Map(positioned.map((item) => [item.node.id, item]));
  const edges = graph.edges.filter((edge) => edge.type !== 'group' && byId.has(edge.from) && byId.has(edge.to)).map((edge) => {
    const from = byId.get(edge.from)!;
    const to = byId.get(edge.to)!;
    return `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" class="edge ${edge.type}" />`;
  }).join('');
  const circles = positioned.map(({ node, x, y }) => `<g><circle cx="${x}" cy="${y}" r="${22 + Math.round(node.mastery * 12)}" class="node ${node.status}" /><text x="${x}" y="${y + 48}" text-anchor="middle">${esc(shortLabel(node.label))}</text></g>`).join('');
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Concept progress graph">${edges}${circles}</svg>`;
}

function shortLabel(label: string): string {
  return label.length > 22 ? `${label.slice(0, 19)}...` : label;
}

export async function writeDashboard(repoPath: string, state: TutorState, outFile = '.skilltrace/dashboard.html'): Promise<string> {
  const outputPath = path.resolve(repoPath, outFile);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, renderDashboard(state));
  return outputPath;
}

export function renderDashboard(state: TutorState): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>MergeLearn Tutor</title><style>${style()}</style></head><body><main><header><h1>MergeLearn Tutor</h1><p>Snippet-first local code tutor for ${esc(state.repoPath)}</p></header><section class="grid"><div class="panel"><h2>Today</h2><pre>${esc(renderToday(state, 5))}</pre></div><div class="panel"><h2>Knowledge debt</h2><pre>${esc(renderKnowledgeDebt(state))}</pre></div></section><section class="panel"><h2>Learning cards</h2><p>Cards start from code you touched, then ask a question on a learning plane.</p><div class="cards">${cards(state)}</div></section><section class="panel"><h2>Progress map</h2>${progressSummary(state)}<div class="graph">${progressGraphSvg(state)}</div><pre>${esc(renderProgress(state))}</pre></section><section class="panel"><h2>Skill ledger</h2><table><thead><tr><th>Concept</th><th>Kind</th><th>Exposure</th><th>Mastery</th><th>Importance</th></tr></thead><tbody>${conceptRows(state)}</tbody></table></section></main></body></html>`;
}

function style(): string {
  return 'body{margin:0;background:#0b1020;color:#e5e7eb;font-family:Inter,system-ui,sans-serif}main{max-width:1180px;margin:0 auto;padding:32px}header,.panel{background:#111827;border:1px solid #26324f;border-radius:18px;padding:22px;margin-bottom:20px;box-shadow:0 12px 28px rgba(0,0,0,.25)}h1,h2,h3{margin-top:0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}.card{background:#0f172a;border:1px solid #334155;border-radius:14px;padding:16px}.meta{color:#93c5fd;text-transform:uppercase;font-size:12px;font-weight:700}.path{color:#cbd5e1}.snippet{white-space:pre-wrap;background:#020617;padding:14px;border-radius:12px;overflow:auto;border:1px solid #334155}pre{white-space:pre-wrap;background:#020617;padding:14px;border-radius:12px;overflow:auto}table{width:100%;border-collapse:collapse}td,th{padding:10px;border-bottom:1px solid #26324f;text-align:left}.pill{border-radius:999px;padding:4px 10px;font-weight:700}.weak{background:#7f1d1d;color:#fecaca}.learning{background:#713f12;color:#fde68a}.solid{background:#14532d;color:#bbf7d0}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.stats div{background:#0f172a;border:1px solid #334155;border-radius:14px;padding:14px}.stats strong{display:block;font-size:28px}.stats span{color:#cbd5e1}.graph{overflow:auto}.edge{stroke:#475569;stroke-width:2}.edge.prerequisite{stroke:#f59e0b}.edge.related{stroke:#38bdf8;stroke-dasharray:4 4}.node{stroke:#e2e8f0;stroke-width:2;fill:#334155}.node.needs_review{fill:#7f1d1d}.node.learning{fill:#713f12}.node.confident{fill:#14532d}.node.new{fill:#1e293b}svg text{fill:#e5e7eb;font-size:12px}@media(max-width:800px){.grid,.stats{grid-template-columns:1fr}}';
}
