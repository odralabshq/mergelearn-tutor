import { CONCEPT_DEFINITIONS } from './conceptCatalog.js';
import { analyzeTypeScriptAddedDiff } from './analyzers/typescriptAst.js';
import type { CommitArtifact, Concept, EvidenceRef } from './types.js';
import { unique } from './util.js';

const PATH_HINT_ONLY_CONCEPTS = new Set([
  'testing.behavior_tests',
  'security.auth_boundary',
  'data.validation',
  'dev_workflow.cli_tools',
  'dev_workflow.dependency_management',
]);

function diffLinesForFile(diff: string, path: string): string {
  const marker = `diff --git a/${path} b/${path}`;
  const start = diff.indexOf(marker);
  if (start < 0) return diff;
  const next = diff.indexOf('\ndiff --git ', start + marker.length);
  return diff.slice(start, next < 0 ? undefined : next);
}

function snippetFor(definitionId: string, text: string): string | undefined {
  const cleaned = text.split('\n').filter((line) => line.startsWith('+') && !line.startsWith('+++')).slice(0, 12).join('\n');
  return cleaned || `Detected ${definitionId} from changed path or diff metadata.`;
}

function repoDomainConcepts(artifact: CommitArtifact): Concept[] {
  const terms = new Map<string, { label: string; evidence: EvidenceRef[] }>();
  for (const filePath of artifact.changedFiles) {
    const parts = filePath.split(/[\/._-]/).filter((part) => part.length >= 4 && !['src', 'test', 'tests', 'index'].includes(part));
    for (const part of parts.slice(0, 3)) {
      const label = part.toLowerCase();
      const id = `repo.${label}`;
      const entry = terms.get(id) ?? { label, evidence: [] };
      entry.evidence.push({ commit: artifact.externalId, path: filePath, label: 'repo term from changed path' });
      terms.set(id, entry);
    }
  }
  return [...terms.entries()].slice(0, 8).map(([id, entry]) => ({
    id,
    label: entry.label,
    kind: 'repo_domain',
    description: 'Repo-specific concept inferred from repeatedly touched path names.',
    difficulty: 'beginner',
    parentIds: ['repo'],
    prerequisiteIds: [],
    relatedIds: [],
    evidence: entry.evidence,
  }));
}

export function extractConcepts(artifacts: CommitArtifact[]): Concept[] {
  const byId = new Map<string, Concept>();
  for (const artifact of artifacts) {
    const astFindingsByPath = new Map<string, ReturnType<typeof analyzeTypeScriptAddedDiff>>();
    for (const filePath of artifact.changedFiles) {
      astFindingsByPath.set(filePath, analyzeTypeScriptAddedDiff(filePath, diffLinesForFile(artifact.diff, filePath)));
    }
    for (const def of CONCEPT_DEFINITIONS) {
      const evidence: EvidenceRef[] = [];
      for (const filePath of artifact.changedFiles) {
        const fileDiff = diffLinesForFile(artifact.diff, filePath);
        const astFindings = astFindingsByPath.get(filePath) ?? [];
        const astConceptIds = new Set(astFindings.map((finding) => finding.conceptId));
        const pathMatched = PATH_HINT_ONLY_CONCEPTS.has(def.id) && def.pathHints.some((pattern) => pattern.test(filePath));
        const diffMatched = def.patterns.some((pattern) => pattern.test(fileDiff));
        const astMatched = astConceptIds.has(def.id);
        const matched = pathMatched || diffMatched || astMatched;
        if (matched) {
          const astReason = astFindings.find((finding) => finding.conceptId === def.id)?.reason;
          evidence.push({ commit: artifact.externalId, path: filePath, label: astReason ?? def.label, snippet: snippetFor(def.id, fileDiff) });
        }
      }
      if (evidence.length === 0) continue;
      const existing = byId.get(def.id);
      const mergedEvidence = [...(existing?.evidence ?? []), ...evidence].slice(0, 12);
      byId.set(def.id, {
        id: def.id,
        label: def.label,
        kind: def.kind,
        description: def.description,
        difficulty: def.difficulty,
        parentIds: def.parents ?? [],
        prerequisiteIds: def.prerequisites ?? [],
        relatedIds: def.related ?? [],
        evidence: mergedEvidence,
      });
    }
    for (const concept of repoDomainConcepts(artifact)) {
      const existing = byId.get(concept.id);
      byId.set(concept.id, { ...concept, evidence: unique([...(existing?.evidence ?? []), ...concept.evidence]).slice(0, 10) });
    }
  }
  return [...byId.values()].sort((a, b) => b.evidence.length - a.evidence.length || a.label.localeCompare(b.label));
}
