import type { CommitArtifact, Concept, ConceptState, LearningItem, TutorState } from './types.js';
import { applyCorrections, recordReviewEvent } from './events.js';
import { addDays, clamp, nowIso, stableId } from './util.js';

function importanceFor(concept: Concept): number {
  const risk = concept.kind === 'security' ? 0.95 : concept.kind === 'testing' || concept.kind === 'data' ? 0.8 : 0.55;
  return clamp(risk + Math.min(0.25, concept.evidence.length * 0.03), 0, 1);
}

function defaultConceptState(concept: Concept, now: string): ConceptState {
  const exposureCount = concept.evidence.length;
  const importance = importanceFor(concept);
  const masteryEstimate = clamp(0.08 * exposureCount, 0.05, 0.35);
  return {
    conceptId: concept.id,
    exposureCount,
    activeRecallCount: 0,
    correctCount: 0,
    failedCount: 0,
    hintCount: 0,
    masteryEstimate,
    confidence: masteryEstimate,
    importance,
    repoRelevance: clamp(exposureCount / 6, 0.15, 1),
    lastSeenAt: now,
    nextReviewAt: addDays(now, exposureCount > 2 ? 1 : 3),
  };
}

export function mergeLearningState(state: TutorState, artifacts: CommitArtifact[], concepts: Concept[]): TutorState {
  const now = nowIso();
  const artifactMap = new Map(state.artifacts.map((artifact) => [artifact.externalId, artifact]));
  for (const artifact of artifacts) artifactMap.set(artifact.externalId, artifact);
  const conceptMap = new Map(state.concepts.map((concept) => [concept.id, concept]));
  for (const concept of concepts) conceptMap.set(concept.id, concept);
  const states = new Map(state.conceptStates.map((item) => [item.conceptId, item]));
  for (const concept of conceptMap.values()) {
    const previous = states.get(concept.id);
    states.set(concept.id, previous ? refreshConceptState(previous, concept, now) : defaultConceptState(concept, now));
  }
  const next: TutorState = {
    ...state,
    artifacts: [...artifactMap.values()],
    concepts: [...conceptMap.values()].sort((a, b) => a.label.localeCompare(b.label)),
    conceptStates: [...states.values()].sort((a, b) => priorityScore(b) - priorityScore(a)),
  };
  next.learningItems = generateLearningItems(next);
  return applyCorrections(next);
}

function refreshConceptState(previous: ConceptState, concept: Concept, now: string): ConceptState {
  const exposureCount = Math.max(previous.exposureCount, concept.evidence.length);
  const mastery = clamp(previous.masteryEstimate + Math.max(0, exposureCount - previous.exposureCount) * 0.04, 0, previous.activeRecallCount > 0 ? 1 : 0.35);
  return { ...previous, exposureCount, masteryEstimate: mastery, confidence: mastery, importance: importanceFor(concept), repoRelevance: clamp(exposureCount / 6, 0.15, 1), lastSeenAt: now };
}

export function priorityScore(state: ConceptState): number {
  const due = !state.nextReviewAt || new Date(state.nextReviewAt).getTime() <= Date.now() ? 0.35 : 0;
  const weakness = 1 - state.masteryEstimate;
  return state.repoRelevance * 0.35 + state.importance * 0.3 + weakness * 0.25 + due;
}

function conceptById(state: TutorState, conceptId: string): Concept | undefined {
  return state.concepts.find((concept) => concept.id === conceptId);
}

export function topDueConcepts(state: TutorState, count = 5): Concept[] {
  return state.conceptStates
    .slice()
    .sort((a, b) => priorityScore(b) - priorityScore(a))
    .map((item) => conceptById(state, item.conceptId))
    .filter((item): item is Concept => {
      if (item === undefined) return false;
      return item.evidence.length > 0;
    })
    .slice(0, count);
}

function itemTypeFor(concept: Concept): LearningItem['type'] {
  if (concept.kind === 'security' || concept.kind === 'data') return 'spot_risk';
  if (concept.kind === 'repo_domain' || concept.kind === 'repo_architecture') return 'trace_flow';
  if (concept.kind === 'testing') return 'compare_pattern';
  return 'explain_back';
}

function evidenceRank(concept: Concept, path: string): number {
  let score = 0;
  if (/^src\//.test(path)) score += 40;
  if (/(^|\/)(test|tests|__tests__)\//.test(path) || /\.(test|spec)\.[cm]?[tj]sx?$/.test(path)) score += concept.kind === 'testing' ? 60 : 20;
  if (/package\.json$/.test(path)) score += concept.kind === 'dev_workflow' ? 35 : 5;
  if (/^(README|docs\/)/.test(path)) score -= 25;
  if (/\.md$/.test(path)) score -= 10;
  return score;
}

function rankedEvidence(concept: Concept): Concept['evidence'] {
  return concept.evidence.slice().sort((a, b) => evidenceRank(concept, b.path) - evidenceRank(concept, a.path));
}

function expectedFocus(concept: Concept): string[] {
  const paths = rankedEvidence(concept).map((item) => item.path).slice(0, 3);
  if (concept.kind === 'security') return ['access decision', 'failure mode', 'test or guardrail', ...paths].slice(0, 5);
  if (concept.kind === 'testing') return ['changed behavior', 'nearest test', 'failure the test catches', ...paths].slice(0, 5);
  if (concept.kind === 'data') return ['accepted input', 'rejected input', 'failure mode', ...paths].slice(0, 5);
  if (concept.kind === 'dev_workflow') return ['command or workflow touched', 'user-visible effect', ...paths].slice(0, 5);
  return [concept.label, 'one concrete evidence file', 'why it matters now', ...paths].slice(0, 5);
}

function whyShownFor(concept: Concept, state: ConceptState | undefined): string {
  const evidenceCount = concept.evidence.length;
  const mastery = Math.round((state?.masteryEstimate ?? 0) * 100);
  const importance = Math.round((state?.importance ?? 0) * 100);
  return `Shown because you recently touched ${evidenceCount} evidence ${evidenceCount === 1 ? 'path' : 'paths'}, estimated mastery is ${mastery}%, and importance is ${importance}%.`;
}

export function generateLearningItems(state: TutorState): LearningItem[] {
  const now = nowIso();
  return topDueConcepts(state, 12).map((concept) => {
    const conceptState = state.conceptStates.find((candidate) => candidate.conceptId === concept.id);
    return {
      id: stableId('item', [concept.id, concept.evidence.map((item) => item.commit).join(','), concept.evidence.length]),
      conceptId: concept.id,
      type: itemTypeFor(concept),
      title: `${concept.label} in your recent work`,
      bodyMarkdown: renderCardMarkdown(concept, conceptState),
      prompt: promptFor(concept),
      expectedFocus: expectedFocus(concept),
      whyShown: whyShownFor(concept, conceptState),
      evidence: rankedEvidence(concept).slice(0, 5),
      difficulty: concept.difficulty,
      createdAt: now,
    };
  });
}

export function renderCardMarkdown(concept: Concept, state?: ConceptState): string {
  const evidence = rankedEvidence(concept).slice(0, 4).map((item) => `- \`${item.path}\`${item.commit ? ` in ${item.commit.slice(0, 8)}` : ''}`).join('\n');
  return [`# ${concept.label}`, '', concept.description, '', '## Why this card appeared', whyShownFor(concept, state), '', '## Why this matters', whyItMatters(concept), '', '## Evidence from your repo', evidence, '', '## Self-check', promptFor(concept)].join('\n');
}

function whyItMatters(concept: Concept): string {
  if (concept.kind === 'security') return 'Security boundary changes are high consequence: a small misunderstanding can allow or deny the wrong user action.';
  if (concept.kind === 'testing') return 'Tests are where you prove the behavior you changed, especially when AI generated or modified the code.';
  if (concept.kind === 'repo_domain') return 'Repo-specific concepts are what generic tutorials cannot teach. Understanding them makes AI-generated changes safer.';
  return 'You recently touched this concept in real code, so learning it now has immediate context and lower cognitive overhead.';
}

function promptFor(concept: Concept): string {
  const firstPath = rankedEvidence(concept)[0]?.path ?? 'one evidence file';
  if (concept.kind === 'security') return `Using ${firstPath}, explain the access decision this change affects and one failure mode a test or guardrail should catch.`;
  if (concept.kind === 'testing') return `Name the behavior changed near ${firstPath}, then describe the nearest test that should fail if that behavior regresses.`;
  if (concept.kind === 'data') return `Using ${firstPath}, describe one valid input, one invalid input, and what should happen when parsing fails.`;
  if (concept.kind === 'dev_workflow') return `Explain how ${concept.label} changes the developer or CI workflow, citing one command/config path from the evidence.`;
  if (concept.kind === 'repo_domain') return `Trace how ${concept.label} connects to one other changed file and why that connection matters for future edits.`;
  return `Explain ${concept.label} in plain English using ${firstPath}, then name one mistake this concept helps you avoid.`;
}

export function recordAnswer(state: TutorState, itemId: string, answerText: string, correct: boolean): TutorState {
  return recordReviewEvent(state, { itemId, eventType: 'answered', answerText, correct });
}
