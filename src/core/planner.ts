import { DEFAULT_PREFERENCES } from './preferences.js';
import type { CodeSnippet, CommitArtifact, Concept, ConceptState, LearningItem, QuestionPlane, TutorState, UserPreferences } from './types.js';
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

export function mergeLearningState(state: TutorState, artifacts: CommitArtifact[], concepts: Concept[], preferences: UserPreferences = DEFAULT_PREFERENCES): TutorState {
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
  next.learningItems = generateLearningItems(next, preferences);
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

function expectedFocus(concept: Concept, plane: QuestionPlane): string[] {
  const paths = rankedEvidence(concept).map((item) => item.path).slice(0, 3);
  if (plane === 'language_mechanics') return ['syntax or type rule', 'runtime effect', 'mistake this prevents', ...paths].slice(0, 5);
  if (plane === 'local_behavior') return ['inputs', 'branches or return values', 'observable behavior', ...paths].slice(0, 5);
  if (plane === 'file_role') return ['file responsibility', 'public surface', 'neighboring file', ...paths].slice(0, 5);
  if (plane === 'architecture_flow') return ['caller', 'callee or dependency', 'data/control flow', ...paths].slice(0, 5);
  if (plane === 'risk_and_tests') return ['failure mode', 'test or guardrail', 'edge case', ...paths].slice(0, 5);
  return [concept.label, 'repo-specific meaning', 'why it matters here', ...paths].slice(0, 5);
}

function whyShownFor(concept: Concept, state: ConceptState | undefined, plane: QuestionPlane): string {
  const evidenceCount = concept.evidence.length;
  const mastery = Math.round((state?.masteryEstimate ?? 0) * 100);
  const importance = Math.round((state?.importance ?? 0) * 100);
  return `Snippet-first ${plane.replace(/_/g, ' ')} card from ${evidenceCount} recent evidence ${evidenceCount === 1 ? 'path' : 'paths'}; mastery ${mastery}%, importance ${importance}%.`;
}

function planeFor(concept: Concept, preferences: UserPreferences): QuestionPlane {
  const preferred: QuestionPlane = concept.kind === 'language' ? 'language_mechanics'
    : concept.kind === 'security' || concept.kind === 'testing' || concept.kind === 'data' ? 'risk_and_tests'
      : concept.kind === 'repo_architecture' ? 'architecture_flow'
        : concept.kind === 'repo_domain' ? 'repo_domain'
          : concept.kind === 'dev_workflow' ? 'file_role'
            : preferences.review.defaultPlane;
  return preferences.review.enabledPlanes.includes(preferred) ? preferred : preferences.review.enabledPlanes[0] ?? preferences.review.defaultPlane;
}

function snippetFor(concept: Concept, preferences: UserPreferences): CodeSnippet {
  const evidence = rankedEvidence(concept)[0] ?? { path: 'unknown', label: concept.label };
  const raw = evidence.snippet?.trim() || `// Evidence path: ${evidence.path}\n// Open this file and explain the highlighted concept: ${concept.label}`;
  return {
    path: evidence.path,
    label: evidence.label,
    language: languageForPath(evidence.path),
    commit: evidence.commit,
    code: trimSnippet(raw, preferences.review.snippetLineCount),
  };
}

function trimSnippet(snippet: string, maxLines: number): string {
  const lines = snippet.split('\n').slice(0, maxLines);
  return lines.join('\n');
}

function languageForPath(path: string): string | undefined {
  if (/\.tsx?$/.test(path)) return 'typescript';
  if (/\.jsx?$/.test(path)) return 'javascript';
  if (/\.py$/.test(path)) return 'python';
  if (/\.json$/.test(path)) return 'json';
  if (/\.ya?ml$/.test(path)) return 'yaml';
  if (/\.md$/.test(path)) return 'markdown';
  return undefined;
}

export function generateLearningItems(state: TutorState, preferences: UserPreferences = DEFAULT_PREFERENCES): LearningItem[] {
  const now = nowIso();
  return topDueConcepts(state, 12).map((concept) => {
    const conceptState = state.conceptStates.find((candidate) => candidate.conceptId === concept.id);
    const questionPlane = planeFor(concept, preferences);
    const snippet = snippetFor(concept, preferences);
    return {
      id: stableId('item', [concept.id, concept.evidence.map((item) => item.commit).join(','), concept.evidence.length, questionPlane]),
      conceptId: concept.id,
      type: itemTypeFor(concept),
      questionPlane,
      title: `${snippet.path}: ${concept.label}`,
      snippet,
      bodyMarkdown: renderCardMarkdown(concept, conceptState, questionPlane, snippet),
      prompt: promptFor(concept, questionPlane, snippet),
      explanationMarkdown: explanationFor(concept, questionPlane, snippet),
      expectedFocus: expectedFocus(concept, questionPlane),
      whyShown: whyShownFor(concept, conceptState, questionPlane),
      evidence: rankedEvidence(concept).slice(0, 5),
      difficulty: concept.difficulty,
      createdAt: now,
    };
  });
}

export function renderCardMarkdown(concept: Concept, state?: ConceptState, plane: QuestionPlane = planeFor(concept, DEFAULT_PREFERENCES), snippet: CodeSnippet = snippetFor(concept, DEFAULT_PREFERENCES)): string {
  const evidence = rankedEvidence(concept).slice(0, 4).map((item) => `- \`${item.path}\`${item.commit ? ` in ${item.commit.slice(0, 8)}` : ''}`).join('\n');
  return [`# ${snippet.path}: ${concept.label}`, '', '## Code snippet', codeFence(snippet), '', '## Question plane', plane.replace(/_/g, ' '), '', '## Question', promptFor(concept, plane, snippet), '', '## Explanation if stuck', explanationFor(concept, plane, snippet), '', '## Why this card appeared', whyShownFor(concept, state, plane), '', '## Evidence from your repo', evidence].join('\n');
}

function codeFence(snippet: CodeSnippet): string {
  return `\`\`\`${snippet.language ?? ''}\n${snippet.code}\n\`\`\``;
}

function explanationFor(concept: Concept, plane: QuestionPlane, snippet: CodeSnippet): string {
  if (plane === 'language_mechanics') return `Focus on the language construct visible in \`${snippet.path}\`: identify the rule, then explain how that rule changes what values or control flow are allowed.`;
  if (plane === 'local_behavior') return `Read the snippet branch by branch. State what input enters this code, what condition is checked, and what value or side effect comes out.`;
  if (plane === 'file_role') return `Connect the snippet to the file responsibility: what this file owns, what it exposes, and what another file should not duplicate.`;
  if (plane === 'architecture_flow') return `Trace one step before and after \`${snippet.path}\`: who calls this code, what it depends on, and what downstream behavior changes if it is wrong.`;
  if (plane === 'risk_and_tests') return `Look for the consequence of misunderstanding ${concept.label}: name the risky case, then name the test or guardrail that should catch it.`;
  return `Treat ${concept.label} as repo vocabulary. Define what it means in this codebase using the snippet, not a generic tutorial definition.`;
}

function promptFor(concept: Concept, plane: QuestionPlane, snippet: CodeSnippet): string {
  if (plane === 'language_mechanics') return `In this ${snippet.path} snippet, what does the key language construct do, and what mistake would it prevent?`;
  if (plane === 'local_behavior') return `What happens in this ${snippet.path} snippet? Name the inputs, the branch or transformation, and the result.`;
  if (plane === 'file_role') return `What role does ${snippet.path} play, and why does this snippet belong in this file?`;
  if (plane === 'architecture_flow') return `How does this ${snippet.path} snippet connect to the surrounding flow of the program? Name one upstream or downstream dependency.`;
  if (plane === 'risk_and_tests') return `What could break if this ${snippet.path} snippet is misunderstood, and what test or guardrail should catch it?`;
  return `What does ${concept.label} mean in this repo, based on this snippet?`;
}

export function recordAnswer(state: TutorState, itemId: string, answerText: string, correct: boolean): TutorState {
  return recordReviewEvent(state, { itemId, eventType: 'answered', answerText, correct });
}
