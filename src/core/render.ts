import type { Concept, ConceptState, TutorState } from './types.js';
import { priorityScore } from './planner.js';

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
    lines.push(`   Type: ${item.type} · difficulty: ${item.difficulty} · mastery: ${Math.round((cs?.masteryEstimate ?? 0) * 100)}%`);
    lines.push(`   Prompt: ${item.prompt}`);
    lines.push('');
  });
  lines.push('Run `mergelearn-tutor review --repo <path>` to see the full cards.');
  return `${lines.join('\n')}\n`;
}

export function renderReview(state: TutorState, count = 5): string {
  const items = state.learningItems.slice(0, count);
  return `${items.map((item, index) => `## Card ${index + 1}: ${item.title}\n\n${item.bodyMarkdown}\n\nExpected focus:\n${item.expectedFocus.map((focus) => `- ${focus}`).join('\n')}`).join('\n\n---\n\n')}\n`;
}

export function renderProfile(state: TutorState): string {
  const rows = state.conceptStates.slice(0, 20).map((item) => {
    const concept = state.concepts.find((candidate) => candidate.id === item.conceptId);
    return `- ${concept?.label ?? item.conceptId}: mastery ${Math.round(item.masteryEstimate * 100)}%, exposure ${item.exposureCount}, priority ${priorityScore(item).toFixed(2)}`;
  });
  return ['Personal skill ledger', '', `Concepts: ${state.concepts.length}`, `Learning events: ${state.learningEvents.length}`, '', ...rows].join('\n') + '\n';
}

export function renderKnowledgeDebt(state: TutorState): string {
  const weakImportant = state.conceptStates.filter((item) => item.importance >= 0.7 || item.masteryEstimate < 0.35).sort((a, b) => priorityScore(b) - priorityScore(a)).slice(0, 10);
  const lines = ['Knowledge debt report', ''];
  if (weakImportant.length === 0) lines.push('No high-priority weak concepts detected yet.');
  for (const item of weakImportant) {
    const concept = state.concepts.find((candidate) => candidate.id === item.conceptId);
    lines.push(`- ${concept?.label ?? item.conceptId}: importance ${item.importance.toFixed(2)}, mastery ${item.masteryEstimate.toFixed(2)}, exposures ${item.exposureCount}`);
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
