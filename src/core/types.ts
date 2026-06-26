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
export type ReviewEventType = 'shown' | 'answered' | 'skipped' | 'marked_unsure' | 'marked_wrong' | 'marked_correct' | 'marked_useful' | 'corrected' | 'deferred';
export type CorrectionType = 'wrong_concept' | 'wrong_evidence' | 'duplicate' | 'better_label' | 'not_useful' | 'pin_important';

export type EvidenceRef = {
  commit?: string;
  path: string;
  label: string;
  snippet?: string;
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
  title: string;
  bodyMarkdown: string;
  prompt: string;
  expectedFocus: string[];
  evidence: EvidenceRef[];
  difficulty: Difficulty;
  createdAt: string;
};

export type LearningEvent = {
  id: string;
  itemId: string;
  conceptId: string;
  eventType: ReviewEventType;
  answerText?: string;
  correct?: boolean;
  note?: string;
  createdAt: string;
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
  learningEvents: LearningEvent[];
  corrections: Correction[];
};
