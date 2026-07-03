/**
 * @deprecated (S0, doc 00) Deterministic question author. Superseded by the v2
 * LLM-sole-author pipeline in author.ts. KEPT as a readable dead-path (behavior
 * unchanged) until the S9 destructive migration; see DEPRECATIONS in
 * featureFlags.ts for the authoritative removal inventory. Do not extend this.
 */
import { DEFAULT_PREFERENCES } from './preferences.js';
import { assertOutboundAllowed, createOutboundPreview, loadPrivacyConfig, type PrivacyConfig } from './privacy.js';
import type { LlmClient } from './llmClient.js';
import { resolveLlmClientFromEnv } from './llmClient.js';
import type { Concept, EvidenceRef, LearningCourse, QuestionBankEntry, QuestionDraftBatch, QuestionPlane, QuestionProvider, TutorState } from './types.js';
import { nowIso, stableId } from './util.js';

export type DraftQuestionOptions = {
  courseId?: string;
  provider?: QuestionProvider;
  model?: string;
  count?: number;
  llmClient?: LlmClient;
  privacyConfig?: PrivacyConfig;
};

const PROMPT_VERSION = 'question-draft-v2';
const ENABLED_PLANES: QuestionPlane[] = ['language_mechanics', 'local_behavior', 'file_role', 'architecture_flow', 'risk_and_tests', 'repo_domain'];

type RemoteQuestionDraft = {
  prompt: string;
  shortAnswer: string;
  deepExplanation: string;
  questionPlane: string;
  expectedFocus: string[];
};

export async function draftQuestionsForCourse(state: TutorState, options: DraftQuestionOptions = {}): Promise<TutorState> {
  const provider = options.provider ?? 'fake';
  const course = courseFor(state, options.courseId);
  const concepts = selectConceptsForCourse(state, course, options.count ?? 6);
  const now = nowIso();
  const entries = provider === 'remote'
    ? await buildRemoteDraftEntries(state, concepts, course, options, now)
    : concepts.map((concept, index) => buildDraftEntry(concept, course, provider, options.model, now, index));
  const batch: QuestionDraftBatch = {
    id: stableId('qbatch', [now, course?.id ?? 'all', provider, String(state.questionDraftBatches.length + 1)]),
    courseId: course?.id,
    provider,
    model: options.model ?? `${provider}-question-author`,
    promptVersion: PROMPT_VERSION,
    entryIds: entries.map((entry) => entry.id),
    createdAt: now,
    networkUsed: provider === 'remote',
  };
  return { ...state, questionBank: [...state.questionBank, ...entries], questionDraftBatches: [...state.questionDraftBatches, batch] };
}

export function updateQuestionStatus(state: TutorState, entryId: string, status: QuestionBankEntry['status']): TutorState {
  const now = nowIso();
  return {
    ...state,
    questionBank: state.questionBank.map((entry) => entry.id === entryId ? { ...entry, status, updatedAt: now } : entry),
  };
}

export function bulkUpdateQuestionStatus(state: TutorState, ids: string[], status: QuestionBankEntry['status']): TutorState {
  const idSet = new Set(ids);
  const now = nowIso();
  return {
    ...state,
    questionBank: state.questionBank.map((entry) => idSet.has(entry.id) ? { ...entry, status, updatedAt: now } : entry),
  };
}

export function questionCandidates(state: TutorState): QuestionBankEntry[] {
  return state.questionBank.filter((entry) => entry.status === 'draft');
}

export function questionSummary(state: TutorState) {
  return {
    total: state.questionBank.length,
    draft: state.questionBank.filter((entry) => entry.status === 'draft').length,
    accepted: state.questionBank.filter((entry) => entry.status === 'accepted').length,
    rejected: state.questionBank.filter((entry) => entry.status === 'rejected').length,
    batches: state.questionDraftBatches.length,
    networkUsed: state.questionDraftBatches.some((batch) => batch.networkUsed),
  };
}

async function buildRemoteDraftEntries(
  state: TutorState,
  concepts: Concept[],
  course: LearningCourse | undefined,
  options: DraftQuestionOptions,
  now: string,
): Promise<QuestionBankEntry[]> {
  const privacy = options.privacyConfig ?? await loadPrivacyConfig(state.repoPath);
  assertOutboundAllowed(privacy, 'remote');
  const client = options.llmClient ?? resolveLlmClientFromEnv();
  if (!client) throw new Error('Remote LLM drafting requires OPENAI_API_KEY in the environment.');
  const preview = createOutboundPreview(state, privacy, { provider: 'remote', limit: concepts.length });
  const entries: QuestionBankEntry[] = [];
  for (const [index, concept] of concepts.entries()) {
    const evidence = concept.evidence.slice(0, 3);
    const primary = evidence[0];
    const suggestedPlane = planeFor(concept, course);
    const previewItem = preview.payload.items.find((item) => item.conceptId === concept.id);
    const draft = await client.completeJson<RemoteQuestionDraft>({
      schemaHint: 'Fields: prompt, shortAnswer, deepExplanation, questionPlane, expectedFocus (string[]).',
      messages: [
        {
          role: 'system',
          content: 'You draft evidence-grounded active-recall questions for a local code-learning tutor. Stay concrete and cite file paths from evidence.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            repo: preview.payload.repoName,
            goals: preview.payload.goals,
            courseGoal: course?.goal,
            concept: { id: concept.id, label: concept.label, kind: concept.kind },
            evidence: evidence.map((item) => ({ path: item.path, label: item.label, snippet: item.snippet?.slice(0, 400) })),
            suggestedPlane,
            previewItem,
          }),
        },
      ],
    });
    const questionPlane = validateQuestionPlane(draft.questionPlane, concept, course);
    entries.push({
      id: stableId('question', [course?.id ?? 'all', concept.id, questionPlane, 'remote', String(index), now]),
      courseId: course?.id,
      conceptId: concept.id,
      questionPlane,
      prompt: draft.prompt.trim(),
      expectedAnswer: draft.shortAnswer.trim(),
      shortAnswer: draft.shortAnswer.trim(),
      deepExplanation: draft.deepExplanation.trim(),
      expectedFocus: normalizeFocus(draft.expectedFocus, concept, primary?.path),
      difficulty: concept.difficulty,
      evidence,
      status: 'draft',
      author: { type: 'llm', provider: 'remote', model: options.model ?? 'remote-question-author', promptVersion: PROMPT_VERSION },
      createdAt: now,
      updatedAt: now,
    });
  }
  return entries;
}

export function validateQuestionPlane(value: string, concept: Concept, course?: LearningCourse): QuestionPlane {
  const preferred = planeFor(concept, course);
  const enabled = course?.enabledPlanes?.length ? course.enabledPlanes : DEFAULT_PREFERENCES.review.enabledPlanes;
  let candidate = ENABLED_PLANES.includes(value as QuestionPlane) ? value as QuestionPlane : preferred;
  if (candidate !== preferred && !isPlaneNaturalForConcept(candidate, concept)) candidate = preferred;
  return enabled.includes(candidate) ? candidate : (enabled[0] ?? preferred);
}

function isPlaneNaturalForConcept(plane: QuestionPlane, concept: Concept): boolean {
  if (concept.kind === 'language') return plane === 'language_mechanics' || plane === 'local_behavior';
  if (concept.kind === 'security' || concept.kind === 'testing' || concept.kind === 'data') {
    return plane === 'risk_and_tests' || plane === 'local_behavior';
  }
  if (concept.kind === 'repo_architecture') return plane === 'architecture_flow' || plane === 'file_role' || plane === 'local_behavior';
  if (concept.kind === 'repo_domain') return plane === 'repo_domain' || plane === 'file_role' || plane === 'local_behavior';
  return plane === 'local_behavior' || plane === 'file_role';
}

function courseFor(state: TutorState, courseId?: string): LearningCourse | undefined {
  if (!courseId) return state.courses[0];
  const course = state.courses.find((item) => item.id === courseId);
  if (!course) throw new Error(`Unknown course: ${courseId}`);
  return course;
}

function selectConceptsForCourse(state: TutorState, course: LearningCourse | undefined, count: number): Concept[] {
  const allowed = new Set(course?.conceptIds ?? []);
  const hasExplicit = allowed.size > 0;
  return state.concepts
    .filter((concept) => !hasExplicit || allowed.has(concept.id))
    .filter((concept) => courseMatchesEvidence(concept.evidence, course))
    .slice(0, Math.max(1, count));
}

function courseMatchesEvidence(evidence: EvidenceRef[], course: LearningCourse | undefined): boolean {
  if (!course) return true;
  const patterns = [...course.materialPaths, ...course.docPaths];
  return evidence.some((item) => patterns.length === 0 || patterns.some((pattern) => pathMatches(item.path, pattern)));
}

function buildDraftEntry(concept: Concept, course: LearningCourse | undefined, provider: QuestionProvider, model: string | undefined, now: string, index: number): QuestionBankEntry {
  const evidence = concept.evidence.slice(0, 3);
  const primary = evidence[0];
  const plane = planeFor(concept, course);
  const prompt = provider === 'deterministic'
    ? deterministicPrompt(concept.label, primary?.path ?? 'the evidence', plane)
    : llmStylePrompt(concept.label, primary?.path ?? 'the evidence', plane, course?.goal);
  const expectedAnswer = expectedAnswerText(concept.label, primary?.path ?? 'the cited file', plane);
  return {
    id: stableId('question', [course?.id ?? 'all', concept.id, plane, provider, String(index), now]),
    courseId: course?.id,
    conceptId: concept.id,
    questionPlane: plane,
    prompt,
    expectedAnswer,
    shortAnswer: expectedAnswer,
    deepExplanation: `Deep dive: cite ${primary?.path ?? 'the evidence'} and explain how ${concept.label} matters for ${plane.replace(/_/g, ' ')} in this repo.`,
    expectedFocus: [...new Set([concept.label, primary?.path, ...(evidence.map((item) => item.path))].filter(Boolean) as string[])].slice(0, 6),
    difficulty: concept.difficulty,
    evidence,
    status: 'draft',
    author: { type: provider === 'deterministic' ? 'deterministic' : 'llm', provider, model: model ?? `${provider}-question-author`, promptVersion: PROMPT_VERSION },
    createdAt: now,
    updatedAt: now,
  };
}

function planeFor(concept: Concept, course: LearningCourse | undefined): QuestionPlane {
  const enabled = course?.enabledPlanes?.length ? course.enabledPlanes : DEFAULT_PREFERENCES.review.enabledPlanes;
  const preferred = concept.kind === 'language' ? 'language_mechanics'
    : concept.kind === 'security' || concept.kind === 'testing' || concept.kind === 'data' ? 'risk_and_tests'
      : concept.kind === 'repo_architecture' ? 'architecture_flow'
        : concept.kind === 'repo_domain' ? 'repo_domain'
          : 'local_behavior';
  return enabled.includes(preferred) ? preferred : enabled[0] ?? DEFAULT_PREFERENCES.review.defaultPlane;
}

function deterministicPrompt(label: string, path: string, plane: QuestionPlane): string {
  return `Using ${path}, explain ${label} from the ${plane.replace(/_/g, ' ')} perspective.`;
}

function llmStylePrompt(label: string, path: string, plane: QuestionPlane, goal?: string): string {
  const goalText = goal ? ` for the goal "${goal}"` : '';
  return `From the cited snippet in ${path}, what should you understand about ${label}${goalText}? Answer as a concrete ${plane.replace(/_/g, ' ')} recall question.`;
}

function expectedAnswerText(label: string, path: string, plane: QuestionPlane): string {
  return `A strong answer cites ${path}, names the relevant behavior for ${label}, and explains why it matters for ${plane.replace(/_/g, ' ')}.`;
}

function normalizeFocus(values: string[] | undefined, concept: Concept, path?: string): string[] {
  const focus = [...new Set([...(values ?? []), concept.label, path].filter(Boolean) as string[])];
  return focus.slice(0, 6);
}

function pathMatches(filePath: string, pattern: string): boolean {
  if (pattern === '**') return true;
  if (pattern.endsWith('/**')) return filePath.startsWith(pattern.slice(0, -3));
  if (pattern.includes('*')) return new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*')}$`).test(filePath);
  return filePath === pattern || filePath.includes(pattern);
}
