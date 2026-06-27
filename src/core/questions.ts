import { DEFAULT_PREFERENCES } from './preferences.js';
import type { Concept, EvidenceRef, LearningCourse, QuestionBankEntry, QuestionDraftBatch, QuestionPlane, QuestionProvider, TutorState } from './types.js';
import { nowIso, stableId } from './util.js';

export type DraftQuestionOptions = {
  courseId?: string;
  provider?: QuestionProvider | 'remote';
  model?: string;
  count?: number;
};

const PROMPT_VERSION = 'question-draft-v1';

export function draftQuestionsForCourse(state: TutorState, options: DraftQuestionOptions = {}): TutorState {
  const provider = options.provider ?? 'fake';
  if (provider === 'remote') throw new Error('Remote LLM question drafting requires privacy preview and explicit opt-in. Use --provider fake or local for now.');
  const course = courseFor(state, options.courseId);
  const concepts = selectConceptsForCourse(state, course, options.count ?? 6);
  const now = nowIso();
  const entries = concepts.map((concept, index) => buildDraftEntry(concept, course, provider, options.model, now, index));
  const batch: QuestionDraftBatch = {
    id: stableId('qbatch', [now, course?.id ?? 'all', provider, String(state.questionDraftBatches.length + 1)]),
    courseId: course?.id,
    provider,
    model: options.model ?? `${provider}-question-author`,
    promptVersion: PROMPT_VERSION,
    entryIds: entries.map((entry) => entry.id),
    createdAt: now,
    networkUsed: false,
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
  return {
    id: stableId('question', [course?.id ?? 'all', concept.id, plane, provider, String(index), now]),
    courseId: course?.id,
    conceptId: concept.id,
    questionPlane: plane,
    prompt,
    expectedAnswer: expectedAnswer(concept.label, primary?.path ?? 'the cited file', plane),
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

function expectedAnswer(label: string, path: string, plane: QuestionPlane): string {
  return `A strong answer cites ${path}, names the relevant behavior for ${label}, and explains why it matters for ${plane.replace(/_/g, ' ')}.`;
}

function pathMatches(filePath: string, pattern: string): boolean {
  if (pattern === '**') return true;
  if (pattern.endsWith('/**')) return filePath.startsWith(pattern.slice(0, -3));
  if (pattern.includes('*')) return new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*')}$`).test(filePath);
  return filePath === pattern || filePath.includes(pattern);
}
