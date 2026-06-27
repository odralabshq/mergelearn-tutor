import { DEFAULT_PREFERENCES } from './preferences.js';
import type { LearningCourse, QuestionPlane, TutorState } from './types.js';
import { nowIso, stableId } from './util.js';

export type UpsertCourseInput = {
  id?: string;
  title: string;
  goal: string;
  enabledPlanes?: QuestionPlane[];
  materialPaths?: string[];
  docPaths?: string[];
  conceptIds?: string[];
};

export function upsertCourse(state: TutorState, input: UpsertCourseInput): TutorState {
  const now = nowIso();
  const id = slug(input.id ?? input.title);
  const existing = state.courses.find((course) => course.id === id);
  const course: LearningCourse = {
    id,
    title: input.title,
    goal: input.goal,
    enabledPlanes: input.enabledPlanes?.length ? input.enabledPlanes : existing?.enabledPlanes ?? DEFAULT_PREFERENCES.review.enabledPlanes,
    materialPaths: input.materialPaths ?? existing?.materialPaths ?? ['src/**', 'tests/**'],
    docPaths: input.docPaths ?? existing?.docPaths ?? ['README.md', 'docs/**'],
    conceptIds: input.conceptIds ?? existing?.conceptIds ?? [],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  return { ...state, courses: [...state.courses.filter((item) => item.id !== id), course] };
}

export function coursesSummary(state: TutorState): Array<LearningCourse & { questionCount: number; activeCardCount: number; docCount: number }> {
  return state.courses.map((course) => ({
    ...course,
    questionCount: state.questionBank.filter((entry) => entry.courseId === course.id).length,
    activeCardCount: state.learningItems.filter((item) => item.courseId === course.id && item.status === 'active').length,
    docCount: course.docPaths.length,
  }));
}

export function inferDefaultCourse(state: TutorState, title = 'Learn this repo'): LearningCourse {
  const existing = state.courses[0];
  if (existing) return existing;
  const now = nowIso();
  return {
    id: stableId('course', [state.repoPath, title]).replace(/^course_/, 'course-'),
    title,
    goal: state.goals[0] ?? 'Understand the recent repo changes through evidence-linked cards.',
    enabledPlanes: DEFAULT_PREFERENCES.review.enabledPlanes,
    materialPaths: ['src/**', 'tests/**'],
    docPaths: ['README.md', 'docs/**'],
    conceptIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

function slug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'course';
}
