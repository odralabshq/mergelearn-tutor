import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { CommitArtifact, Concept, ConceptKind, Correction, Difficulty, EvidenceRef, TutorState } from './types.js';

export type LexiconConcept = {
  id: string;
  label: string;
  description?: string;
  kind?: ConceptKind;
  difficulty?: Difficulty;
  pathPatterns?: string[];
  terms?: string[];
  parentIds?: string[];
  prerequisiteIds?: string[];
  relatedIds?: string[];
  examples?: string[];
};

export type LexiconAlias = {
  conceptId: string;
  label: string;
  note?: string;
};

export type LexiconIgnore = {
  conceptId?: string;
  pathPattern?: string;
  term?: string;
  note?: string;
};

export type RepoLexicon = {
  version: 1;
  concepts: LexiconConcept[];
  aliases: LexiconAlias[];
  ignores: LexiconIgnore[];
};

export const EMPTY_LEXICON: RepoLexicon = { version: 1, concepts: [], aliases: [], ignores: [] };

export function lexiconPath(repoPath: string): string {
  return path.join(repoPath, '.skilltrace', 'lexicon.json');
}

export async function loadLexicon(repoPath: string): Promise<RepoLexicon> {
  try {
    return parseLexicon(JSON.parse(await readFile(lexiconPath(repoPath), 'utf8')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return EMPTY_LEXICON;
    throw error;
  }
}

export async function saveLexicon(repoPath: string, lexicon: RepoLexicon): Promise<void> {
  await mkdir(path.dirname(lexiconPath(repoPath)), { recursive: true });
  await writeFile(lexiconPath(repoPath), `${JSON.stringify(parseLexicon(lexicon), null, 2)}\n`);
}

export function parseLexicon(value: unknown): RepoLexicon {
  if (!isRecord(value)) throw new Error('Lexicon must be a JSON object.');
  return {
    version: 1,
    concepts: arrayOf(value.concepts).map(parseConcept),
    aliases: arrayOf(value.aliases).map(parseAlias),
    ignores: arrayOf(value.ignores).map(parseIgnore),
  };
}

function parseConcept(value: unknown): LexiconConcept {
  if (!isRecord(value)) throw new Error('Lexicon concept entries must be objects.');
  const id = requiredString(value.id, 'concept.id');
  const label = requiredString(value.label, 'concept.label');
  return {
    id,
    label,
    description: optionalString(value.description),
    kind: optionalKind(value.kind),
    difficulty: optionalDifficulty(value.difficulty),
    pathPatterns: stringArray(value.pathPatterns),
    terms: stringArray(value.terms),
    parentIds: stringArray(value.parentIds),
    prerequisiteIds: stringArray(value.prerequisiteIds),
    relatedIds: stringArray(value.relatedIds),
    examples: stringArray(value.examples),
  };
}

function parseAlias(value: unknown): LexiconAlias {
  if (!isRecord(value)) throw new Error('Lexicon alias entries must be objects.');
  return { conceptId: requiredString(value.conceptId, 'alias.conceptId'), label: requiredString(value.label, 'alias.label'), note: optionalString(value.note) };
}

function parseIgnore(value: unknown): LexiconIgnore {
  if (!isRecord(value)) throw new Error('Lexicon ignore entries must be objects.');
  const ignore = { conceptId: optionalString(value.conceptId), pathPattern: optionalString(value.pathPattern), term: optionalString(value.term), note: optionalString(value.note) };
  if (!ignore.conceptId && !ignore.pathPattern && !ignore.term) throw new Error('Ignore entries need conceptId, pathPattern, or term.');
  return ignore;
}

export function applyLexicon(artifacts: CommitArtifact[], concepts: Concept[], lexicon: RepoLexicon): Concept[] {
  const byId = new Map(concepts.map((concept) => [concept.id, filterIgnoredEvidence(concept, lexicon)]));
  for (const custom of lexicon.concepts) {
    const evidence = customEvidence(artifacts, custom, lexicon);
    const existing = byId.get(custom.id);
    if (!existing && evidence.length === 0) continue;
    byId.set(custom.id, mergeCustomConcept(existing, custom, evidence));
  }
  for (const alias of lexicon.aliases) {
    const existing = byId.get(alias.conceptId);
    if (existing) byId.set(alias.conceptId, { ...existing, label: alias.label });
  }
  return [...byId.values()].filter((concept) => concept.evidence.length > 0).sort((a, b) => b.evidence.length - a.evidence.length || a.label.localeCompare(b.label));
}

function mergeCustomConcept(existing: Concept | undefined, custom: LexiconConcept, evidence: EvidenceRef[]): Concept {
  return {
    id: custom.id,
    label: custom.label,
    kind: custom.kind ?? existing?.kind ?? 'repo_domain',
    description: custom.description ?? existing?.description ?? 'Repo-specific concept from the local lexicon.',
    difficulty: custom.difficulty ?? existing?.difficulty ?? 'beginner',
    parentIds: custom.parentIds ?? existing?.parentIds ?? ['repo'],
    prerequisiteIds: custom.prerequisiteIds ?? existing?.prerequisiteIds ?? [],
    relatedIds: custom.relatedIds ?? existing?.relatedIds ?? [],
    evidence: [...(existing?.evidence ?? []), ...evidence].slice(0, 12),
  };
}

function customEvidence(artifacts: CommitArtifact[], concept: LexiconConcept, lexicon: RepoLexicon): EvidenceRef[] {
  const terms = (concept.terms ?? []).map((term) => term.toLowerCase());
  const evidence: EvidenceRef[] = [];
  for (const artifact of artifacts) {
    for (const filePath of artifact.changedFiles) {
      const text = `${filePath}\n${artifact.title}\n${artifact.body}\n${artifact.diff}`.toLowerCase();
      const pathMatched = (concept.pathPatterns ?? []).some((pattern) => pathMatches(filePath, pattern));
      const termMatched = terms.some((term) => text.includes(term));
      if ((pathMatched || termMatched) && !isIgnored(concept.id, filePath, text, lexicon)) {
        evidence.push({ commit: artifact.externalId, path: filePath, label: 'local lexicon match', snippet: termMatched ? `Matched one of: ${concept.terms?.join(', ')}` : `Matched path pattern: ${concept.pathPatterns?.join(', ')}` });
      }
    }
  }
  return evidence.slice(0, 12);
}

function filterIgnoredEvidence(concept: Concept, lexicon: RepoLexicon): Concept {
  return {
    ...concept,
    evidence: concept.evidence.filter((evidence) => !isIgnored(concept.id, evidence.path, `${evidence.path}\n${evidence.label}\n${evidence.snippet ?? ''}`.toLowerCase(), lexicon)),
  };
}

function isIgnored(conceptId: string, filePath: string, lowerText: string, lexicon: RepoLexicon): boolean {
  return lexicon.ignores.some((ignore) => {
    if (ignore.conceptId && ignore.conceptId !== conceptId) return false;
    if (ignore.pathPattern && !pathMatches(filePath, ignore.pathPattern)) return false;
    if (ignore.term && !lowerText.includes(ignore.term.toLowerCase())) return false;
    return true;
  });
}

function pathMatches(filePath: string, pattern: string): boolean {
  if (pattern.includes('*')) return globToRegExp(pattern).test(filePath);
  return filePath === pattern || filePath.includes(pattern);
}

function globToRegExp(pattern: string): RegExp {
  const globstar = '\u0000';
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, globstar)
    .replace(/\*/g, '[^/]*')
    .replaceAll(globstar, '.*');
  return new RegExp(`^${escaped}$`);
}

export function promoteCorrectionsToLexicon(state: TutorState, lexicon: RepoLexicon): RepoLexicon {
  let next = parseLexicon(lexicon);
  for (const correction of state.corrections) next = promoteCorrection(state, next, correction);
  return next;
}

function promoteCorrection(state: TutorState, lexicon: RepoLexicon, correction: Correction): RepoLexicon {
  const conceptId = correction.conceptId ?? correction.targetId;
  if (correction.correctionType === 'better_label' && correction.replacementLabel) {
    const aliases = [...lexicon.aliases.filter((alias) => alias.conceptId !== conceptId), { conceptId, label: correction.replacementLabel, note: correction.note ?? 'promoted from correction' }];
    return { ...lexicon, aliases };
  }
  if (correction.correctionType === 'pin_important') {
    const concept = state.concepts.find((candidate) => candidate.id === conceptId);
    if (!concept || lexicon.concepts.some((candidate) => candidate.id === conceptId)) return lexicon;
    return { ...lexicon, concepts: [...lexicon.concepts, conceptToLexiconConcept(concept)] };
  }
  if (correction.correctionType === 'wrong_concept' || correction.correctionType === 'not_useful') {
    if (lexicon.ignores.some((ignore) => ignore.conceptId === conceptId && !ignore.pathPattern && !ignore.term)) return lexicon;
    return { ...lexicon, ignores: [...lexicon.ignores, { conceptId, note: correction.note ?? `promoted ${correction.correctionType} correction` }] };
  }
  return lexicon;
}

function conceptToLexiconConcept(concept: Concept): LexiconConcept {
  return {
    id: concept.id,
    label: concept.label,
    description: concept.description,
    kind: concept.kind,
    difficulty: concept.difficulty,
    pathPatterns: [...new Set(concept.evidence.map((evidence) => evidence.path).slice(0, 5))],
    parentIds: concept.parentIds,
    prerequisiteIds: concept.prerequisiteIds,
    relatedIds: concept.relatedIds,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function arrayOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`Lexicon ${field} must be a non-empty string.`);
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error('Lexicon string-list fields must be arrays.');
  return value.map((item) => requiredString(item, 'string-list item'));
}

function optionalKind(value: unknown): ConceptKind | undefined {
  if (value === undefined) return undefined;
  const kinds: ConceptKind[] = ['language', 'framework', 'repo_architecture', 'repo_domain', 'testing', 'security', 'data', 'dev_workflow', 'ai_coding'];
  if (typeof value === 'string' && kinds.includes(value as ConceptKind)) return value as ConceptKind;
  throw new Error(`Unknown lexicon concept kind: ${String(value)}`);
}

function optionalDifficulty(value: unknown): Difficulty | undefined {
  if (value === undefined) return undefined;
  const difficulties: Difficulty[] = ['beginner', 'intermediate', 'advanced'];
  if (typeof value === 'string' && difficulties.includes(value as Difficulty)) return value as Difficulty;
  throw new Error(`Unknown lexicon difficulty: ${String(value)}`);
}
