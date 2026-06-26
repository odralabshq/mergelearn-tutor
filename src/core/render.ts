import type { Concept, ConceptState, TutorState } from './types.js';
import { priorityScore } from './planner.js';
import { buildProgressGraph } from './progress.js';

function conceptState(state: TutorState, conceptId: string): ConceptState | undefined {
  return state.conceptStates.find((item) => item.conceptId === conceptId);
}

export function renderToday(state: TutorState, count = 5): string {
  const items = state.learningItems.slice(0, count);
  if (items.length === 0) return 'No learning cards yet. Run `mergelearn-tutor ingest --repo <path>` first.\n';
  const lines = ["Today's 5-minute review", ''];
  items.forEach((item, index) => {
    const cs = conceptState(state, item.conceptId);
    lines.push(`${index + 1}. ${item.title}`);
    lines.push(`   Plane: ${item.questionPlane.replace(/_/g, ' ')} · difficulty: ${item.difficulty} · mastery: ${Math.round((cs?.masteryEstimate ?? 0) * 100)}%`);
    lines.push(`   Snippet: ${item.snippet.path}`);
    if (item.whyShown) lines.push(`   Why: ${item.whyShown}`);
    lines.push(`   Question: ${item.prompt}`);
    lines.push('');
  });
  lines.push('Run `mergelearn-tutor review --repo <path>` to see the full cards.');
  return `${lines.join('\n')}\n`;
}

export function renderReview(state: TutorState, count = 5): string {
  const items = state.learningItems.slice(0, count);
  return `${items.map((item, index) => `## Card ${index + 1}: ${item.title}\n\nQuestion plane: ${item.questionPlane}\n\nSnippet from \`${item.snippet.path}\`:\n\n\`\`\`${item.snippet.language ?? ''}\n${item.snippet.code}\n\`\`\`\n\nQuestion: ${item.prompt}\n\nExplanation if stuck:\n${item.explanationMarkdown}\n\nExpected focus:\n${item.expectedFocus.map((focus) => `- ${focus}`).join('\n')}`).join('\n\n---\n\n')}\n`;
}

export function renderProgress(state: TutorState): string {
  const graph = buildProgressGraph(state);
  const lines = ['Progress map', '', `New: ${graph.summary.new}`, `Learning: ${graph.summary.learning}`, `Confident: ${graph.summary.confident}`, `Needs review: ${graph.summary.needs_review}`, ''];
  for (const group of graph.nodes.filter((node) => node.kind === 'group')) {
    lines.push(`## ${group.label}`);
    const children = graph.edges.filter((edge) => edge.type === 'group' && edge.from === group.id).map((edge) => graph.nodes.find((node) => node.id === edge.to)).filter(Boolean);
    for (const child of children) lines.push(`- ${child!.label}: ${Math.round(child!.mastery * 100)}% mastery, ${child!.status.replace(/_/g, ' ')}`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

export function renderProfile(state: TutorState): string {
  const rows = state.conceptStates.slice(0, 20).map((item) => {
    const concept = state.concepts.find((candidate) => candidate.id === item.conceptId);
    const corrections = state.corrections.filter((correction) => (correction.conceptId ?? correction.targetId) === item.conceptId);
    const correctionText = corrections.length ? `, corrections ${corrections.length}` : '';
    return `- ${concept?.label ?? item.conceptId}: mastery ${Math.round(item.masteryEstimate * 100)}%, exposure ${item.exposureCount}, priority ${priorityScore(item).toFixed(2)}${correctionText}`;
  });
  return ['Personal skill ledger', '', `Concepts: ${state.concepts.length}`, `Learning events: ${state.learningEvents.length}`, `Corrections: ${state.corrections.length}`, `Manual ratings: ${state.manualRatings.length}`, '', ...rows].join('\n') + '\n';
}

export function renderKnowledgeDebt(state: TutorState): string {
  const weakImportant = state.conceptStates.filter((item) => item.importance >= 0.7 || item.masteryEstimate < 0.35).sort((a, b) => priorityScore(b) - priorityScore(a)).slice(0, 10);
  const lines = ['Knowledge debt report', ''];
  if (weakImportant.length === 0) lines.push('No high-priority weak concepts detected yet.');
  for (const item of weakImportant) {
    const concept = state.concepts.find((candidate) => candidate.id === item.conceptId);
    const corrections = state.corrections.filter((correction) => (correction.conceptId ?? correction.targetId) === item.conceptId);
    const reason = corrections.length ? `; corrected: ${corrections.at(-1)?.correctionType}` : '';
    lines.push(`- ${concept?.label ?? item.conceptId}: importance ${item.importance.toFixed(2)}, mastery ${item.masteryEstimate.toFixed(2)}, exposures ${item.exposureCount}${reason}`);
  }
  return `${lines.join('\n')}\n`;
}

export function renderMermaidMap(state: TutorState): string {
  const concepts = state.concepts.slice(0, 18);
  const lines = ['graph TD'];
  for (const concept of concepts) lines.push(`  ${safeId(concept.id)}["${concept.label}"]`);
  for (const concept of concepts) {
    for (const parent of concept.parentIds) lines.push(`  ${safeId(parent)} --> ${safeId(concept.id)}`);
  }
  return `${lines.join('\n')}\n`;
}

function safeId(value: string): string {
  return value.replace(/[^A-Za-z0-9_]/g, '_');
}

export function stateSummary(state: TutorState): string {
  return `Ingested ${state.artifacts.length} commits, ${state.concepts.length} concepts, ${state.learningItems.length} learning cards.`;
}
