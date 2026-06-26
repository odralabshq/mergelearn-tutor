import type { ConceptKind, Difficulty } from './types.js';

export type ConceptDefinition = {
  id: string;
  label: string;
  kind: ConceptKind;
  description: string;
  difficulty: Difficulty;
  patterns: RegExp[];
  pathHints: RegExp[];
  riskWeight: number;
  parents?: string[];
  prerequisites?: string[];
  related?: string[];
};

export const CONCEPT_DEFINITIONS: ConceptDefinition[] = [
  {
    id: 'typescript.type_aliases',
    label: 'TypeScript type aliases',
    kind: 'language',
    description: 'Naming reusable shapes with the TypeScript type system.',
    difficulty: 'beginner',
    patterns: [/\btype\s+[A-Z][A-Za-z0-9_]*\s*=/],
    pathHints: [/\.tsx?$/],
    riskWeight: 2,
    parents: ['typescript'],
  },
  {
    id: 'typescript.interfaces',
    label: 'TypeScript interfaces',
    kind: 'language',
    description: 'Describing object contracts used across modules.',
    difficulty: 'beginner',
    patterns: [/\binterface\s+[A-Z][A-Za-z0-9_]*/],
    pathHints: [/\.tsx?$/],
    riskWeight: 2,
    parents: ['typescript'],
  },
  {
    id: 'typescript.union_types',
    label: 'TypeScript union types',
    kind: 'language',
    description: 'Representing values that can take one of several shapes.',
    difficulty: 'intermediate',
    patterns: [/\|\s*\{/, /\btype\s+\w+\s*=([^;]*\|[^;]*)/s],
    pathHints: [/\.tsx?$/],
    riskWeight: 4,
    parents: ['typescript'],
    prerequisites: ['typescript.type_aliases'],
  },
  {
    id: 'typescript.generics',
    label: 'TypeScript generics',
    kind: 'language',
    description: 'Writing reusable functions and types parameterized over other types.',
    difficulty: 'intermediate',
    patterns: [/function\s+\w+<[^>]+>/, /<T[\w,\s extends=]*>/, /Record<|Promise<|Array</],
    pathHints: [/\.tsx?$/],
    riskWeight: 4,
    parents: ['typescript'],
  },
  {
    id: 'typescript.async_await',
    label: 'Async/await control flow',
    kind: 'language',
    description: 'Understanding promises, awaited values, and async error handling.',
    difficulty: 'beginner',
    patterns: [/\basync\s+function\b/, /\bawait\b/, /Promise</],
    pathHints: [/\.tsx?$/],
    riskWeight: 3,
    parents: ['typescript.functions'],
  },
  {
    id: 'react.hooks',
    label: 'React hooks',
    kind: 'framework',
    description: 'Using React state/effect hooks without stale closures or dependency bugs.',
    difficulty: 'intermediate',
    patterns: [/\buse(State|Effect|Memo|Callback|Ref)\b/, /from ['"]react['"]/],
    pathHints: [/\.tsx$/],
    riskWeight: 4,
    parents: ['react'],
  },
  {
    id: 'testing.behavior_tests',
    label: 'Behavior-focused tests',
    kind: 'testing',
    description: 'Tests that prove changed behavior rather than implementation details.',
    difficulty: 'beginner',
    patterns: [/\b(describe|it|test|expect)\s*\(/, /vitest|jest|playwright|fixture|mock/i],
    pathHints: [/(test|spec)\.[tj]sx?$/, /tests?\//],
    riskWeight: 5,
    parents: ['testing'],
  },
  {
    id: 'security.auth_boundary',
    label: 'Authentication and authorization boundaries',
    kind: 'security',
    description: 'Code that decides who can access or mutate protected state.',
    difficulty: 'advanced',
    patterns: [/auth|session|token|permission|role|policy|owner/i],
    pathHints: [/auth|session|middleware|policy|permission/i],
    riskWeight: 7,
    parents: ['security'],
  },
  {
    id: 'data.validation',
    label: 'Input validation and parsing',
    kind: 'data',
    description: 'Turning unknown inputs into safe domain values before use.',
    difficulty: 'intermediate',
    patterns: [/zod|schema|parse|safeParse|validate|validator|unknown/i],
    pathHints: [/schema|validation|validator|api|route/i],
    riskWeight: 5,
    parents: ['data'],
  },
  {
    id: 'dev_workflow.cli_tools',
    label: 'CLI tool behavior',
    kind: 'dev_workflow',
    description: 'Command-line UX, flags, outputs, and failure contracts.',
    difficulty: 'intermediate',
    patterns: [/commander|process\.argv|stdout|stderr|exitCode|command\(/],
    pathHints: [/cli|bin|commands?/i],
    riskWeight: 4,
    parents: ['dev_workflow'],
  },
  {
    id: 'dev_workflow.dependency_management',
    label: 'Dependency and package management',
    kind: 'dev_workflow',
    description: 'Understanding package manifests, lockfiles, scripts, and dependency risk.',
    difficulty: 'beginner',
    patterns: [/"dependencies"|"devDependencies"|package-lock|pnpm-lock|yarn\.lock/],
    pathHints: [/package\.json$|package-lock\.json$|pnpm-lock\.yaml$|yarn\.lock$/],
    riskWeight: 5,
    parents: ['dev_workflow'],
  },
];
