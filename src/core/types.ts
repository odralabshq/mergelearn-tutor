export type ConceptKind =
  | 'language'
  | 'framework'
  | 'repo_architecture'
  | 'repo_domain'
  | 'testing'
  | 'security'
  | 'data'
  | 'dev_workflow'
  | 'ai_coding';

export type Difficulty = 'beginner' | 'intermediate' | 'advanced';
export type LearningItemType = 'concept_card' | 'explain_back' | 'trace_flow' | 'spot_risk' | 'compare_pattern' | 'spaced_review';
export type QuestionPlane = 'language_mechanics' | 'local_behavior' | 'file_role' | 'architecture_flow' | 'risk_and_tests' | 'repo_domain';
export type LearningItemStatus = 'active' | 'archived';
export type LearningItemSource = 'ingest' | 'manual_generate' | 'regenerate';
export type CardBatchMode = 'initial' | 'more' | 'regenerate';
export type ReviewEventType = 'shown' | 'revealed' | 'answered' | 'delayed_probe_completed' | 'skipped' | 'marked_unsure' | 'marked_wrong' | 'marked_correct' | 'marked_useful' | 'marked_bad_card' | 'marked_wrong_evidence' | 'marked_duplicate' | 'corrected' | 'deferred';
export type CorrectionType = 'wrong_concept' | 'wrong_evidence' | 'duplicate' | 'better_label' | 'not_useful' | 'pin_important';
export type ManualRatingTargetType = 'concept' | 'card';
export type QuestionBankStatus = 'draft' | 'accepted' | 'rejected' | 'active' | 'archived';
export type QuestionAuthorType = 'deterministic' | 'llm';
export type QuestionProvider = 'deterministic' | 'fake' | 'local';
export type CardQualityVerdict = 'ready' | 'needs_review' | 'blocked';
export type DelayedProbeStatus = 'scheduled' | 'completed';

export type CardQualityResult = {
  verdict: CardQualityVerdict;
  scores: {
    evidence: number;
    answerability: number;
    specificity: number;
    duplicateRisk: number;
    sourceDiversity: number;
  };
  warnings: string[];
};

export type EvidenceRef = {
  commit?: string;
  path: string;
  label: string;
  snippet?: string;
};

export type CodeSnippet = {
  path: string;
  label: string;
  language?: string;
  commit?: string;
  code: string;
};

export type UserPreferences = {
  version: 1;
  review: {
    mode: 'snippet_first' | 'concept_first';
    enabledPlanes: QuestionPlane[];
    defaultPlane: QuestionPlane;
    snippetLineCount: number;
    showExplanationsByDefault: boolean;
    preferSourceOverDocs: boolean;
  };
};

export type Concept = {
  id: string;
  label: string;
  kind: ConceptKind;
  description: string;
  difficulty: Difficulty;
  parentIds: string[];
  prerequisiteIds: string[];
  relatedIds: string[];
  evidence: EvidenceRef[];
};

export type CommitArtifact = {
  id: string;
  type: 'commit';
  externalId: string;
  title: string;
  body: string;
  changedFiles: string[];
  diff: string;
  committedAt?: string;
};

export type ConceptState = {
  conceptId: string;
  exposureCount: number;
  activeRecallCount: number;
  correctCount: number;
  failedCount: number;
  hintCount: number;
  masteryEstimate: number;
  confidence: number;
  importance: number;
  repoRelevance: number;
  lastSeenAt?: string;
  lastTestedAt?: string;
  nextReviewAt?: string;
};

export type LearningItem = {
  id: string;
  conceptId: string;
  type: LearningItemType;
  questionPlane: QuestionPlane;
  title: string;
  snippet: CodeSnippet;
  bodyMarkdown: string;
  prompt: string;
  explanationMarkdown: string;
  expectedFocus: string[];
  whyShown?: string;
  evidence: EvidenceRef[];
  quality?: CardQualityResult;
  difficulty: Difficulty;
  createdAt: string;
  status: LearningItemStatus;
  courseId?: string;
  questionId?: string;
  batchId?: string;
  generation: number;
  source: LearningItemSource;
  archivedAt?: string;
  supersededBy?: string;
};

export type CardBatch = {
  id: string;
  mode: CardBatchMode;
  requestedCount: number;
  itemIds: string[];
  archivedItemIds: string[];
  createdAt: string;
  reason?: string;
};

export type LearningCourse = {
  id: string;
  title: string;
  goal: string;
  enabledPlanes: QuestionPlane[];
  materialPaths: string[];
  docPaths: string[];
  conceptIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type QuestionBankEntry = {
  id: string;
  courseId?: string;
  conceptId: string;
  questionPlane: QuestionPlane;
  prompt: string;
  expectedAnswer: string;
  expectedFocus: string[];
  difficulty: Difficulty;
  evidence: EvidenceRef[];
  status: QuestionBankStatus;
  author: {
    type: QuestionAuthorType;
    provider: QuestionProvider;
    model?: string;
    promptVersion: string;
  };
  createdAt: string;
  updatedAt: string;
};

export type QuestionDraftBatch = {
  id: string;
  courseId?: string;
  provider: QuestionProvider;
  model?: string;
  promptVersion: string;
  entryIds: string[];
  createdAt: string;
  networkUsed: boolean;
};

export type EvidenceTimelineNode = {
  id: string;
  type: 'commit' | 'file' | 'doc' | 'concept' | 'course' | 'question' | 'card' | 'batch' | 'event';
  label: string;
  subtitle?: string;
  path?: string;
  createdAt?: string;
  status?: string;
};

export type EvidenceTimelineEdge = {
  from: string;
  to: string;
  type: 'changed' | 'mentions' | 'teaches' | 'drafted' | 'schedules' | 'generated' | 'answered' | 'belongs_to' | 'uses_evidence';
};

export type LearningEvent = {
  id: string;
  itemId: string;
  conceptId: string;
  eventType: ReviewEventType;
  evidenceKey?: string;
  evidencePath?: string;
  questionPlane?: QuestionPlane;
  confidenceBeforeReveal?: number;
  answerText?: string;
  correct?: boolean;
  note?: string;
  createdAt: string;
};

export type DelayedProbe = {
  id: string;
  sourceItemId: string;
  conceptId: string;
  intervalDays: 2 | 7;
  dueAt: string;
  status: DelayedProbeStatus;
  scheduledAt: string;
  completedAt?: string;
  correct?: boolean;
};

export type Correction = {
  id: string;
  targetType: 'concept' | 'card';
  targetId: string;
  conceptId?: string;
  correctionType: CorrectionType;
  replacementLabel?: string;
  note?: string;
  createdAt: string;
};

export type ManualRating = {
  id: string;
  targetType: ManualRatingTargetType;
  targetId: string;
  conceptId?: string;
  relevance?: number;
  evidence?: number;
  answerability?: number;
  usefulness?: number;
  repeatability?: number;
  note?: string;
  createdAt: string;
};

export type TutorState = {
  version: 1;
  repoPath: string;
  goals: string[];
  createdAt: string;
  updatedAt: string;
  artifacts: CommitArtifact[];
  concepts: Concept[];
  conceptStates: ConceptState[];
  learningItems: LearningItem[];
  cardBatches: CardBatch[];
  courses: LearningCourse[];
  questionBank: QuestionBankEntry[];
  questionDraftBatches: QuestionDraftBatch[];
  learningEvents: LearningEvent[];
  delayedProbes?: DelayedProbe[];
  corrections: Correction[];
  manualRatings: ManualRating[];
};
