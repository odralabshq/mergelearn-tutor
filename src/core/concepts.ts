import { CONCEPT_DEFINITIONS } from './conceptCatalog.js';
import { analyzeTypeScriptAddedDiff } from './analyzers/typescriptAst.js';
import { compactUnifiedDiffSnippet, diffForPath } from './diffEvidence.js';
import { deriveEvidenceKey } from './evidenceIdentity.js';
import type { CommitArtifact, Concept, EvidenceRef } from './types.js';
import { unique } from './util.js';

const PATH_HINT_ONLY_CONCEPTS = new Set([
  'testing.behavior_tests',
  'security.auth_boundary',
  'data.validation',
  'dev_workflow.cli_tools',
  'dev_workflow.dependency_management',
]);

export type ConceptFindingSource = 'ast' | 'regex' | 'path' | 'repo_domain';

export type ConceptFinding = {
  conceptId: string;
  source: ConceptFindingSource;
  reason: string;
  path: string;
  commit?: string;
  snippet?: string;
  symbol?: string;
  confidence: number;
  evidenceKey: string;
};

function snippetFor(definitionId: string, text: string): string | undefined {
  return compactUnifiedDiffSnippet(text, { fallback: `Detected ${definitionId} from changed path or diff metadata.` });
}

function findingKeyInput(finding: Omit<ConceptFinding, 'evidenceKey'>): EvidenceRef {
  return { commit: finding.commit, path: finding.path, label: finding.reason, snippet: finding.snippet };
}

function withEvidenceKey(finding: Omit<ConceptFinding, 'evidenceKey'>): ConceptFinding {
  return { ...finding, evidenceKey: deriveEvidenceKey(findingKeyInput(finding)) };
}

function repoDomainFindings(artifact: CommitArtifact): ConceptFinding[] {
  const findings: ConceptFinding[] = [];
  const seen = new Set<string>();
  for (const filePath of artifact.changedFiles) {
    const parts = filePath.split(/[\/._-]/).filter((part) => part.length >= 4 && !['src', 'test', 'tests', 'index'].includes(part));
    for (const part of parts.slice(0, 3)) {
      const label = part.toLowerCase();
      const conceptId = `repo.${label}`;
      const dedupeKey = `${conceptId}:${filePath}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      const snippet = snippetFor('repo_domain', diffForPath(artifact.diff, filePath));
      findings.push(withEvidenceKey({
        conceptId,
        source: 'repo_domain',
        reason: 'repo term from changed path',
        path: filePath,
        commit: artifact.externalId,
        snippet,
        symbol: label,
        confidence: 0.55,
      }));
    }
  }
  return findings.slice(0, 8);
}

export function extractConceptFindings(artifacts: CommitArtifact[]): ConceptFinding[] {
  const findings: ConceptFinding[] = [];
  for (const artifact of artifacts) {
    const astFindingsByPath = new Map<string, ReturnType<typeof analyzeTypeScriptAddedDiff>>();
    for (const filePath of artifact.changedFiles) {
      astFindingsByPath.set(filePath, analyzeTypeScriptAddedDiff(filePath, diffForPath(artifact.diff, filePath)));
    }
    for (const def of CONCEPT_DEFINITIONS) {
      for (const filePath of artifact.changedFiles) {
        const fileDiff = diffForPath(artifact.diff, filePath);
        const astFindings = astFindingsByPath.get(filePath) ?? [];
        const astFinding = astFindings.find((finding) => finding.conceptId === def.id);
        const pathMatched = PATH_HINT_ONLY_CONCEPTS.has(def.id) && def.pathHints.some((pattern) => pattern.test(filePath));
        const diffMatched = def.patterns.some((pattern) => pattern.test(fileDiff));
        if (!astFinding && !pathMatched && !diffMatched) continue;
        const source: ConceptFindingSource = astFinding ? 'ast' : pathMatched ? 'path' : 'regex';
        const reason = astFinding?.reason ?? def.label;
        const snippet = snippetFor(def.id, fileDiff);
        findings.push(withEvidenceKey({
          conceptId: def.id,
          source,
          reason,
          path: filePath,
          commit: artifact.externalId,
          snippet,
          symbol: astFinding?.symbol,
          confidence: astFinding ? 0.95 : pathMatched ? 0.7 : 0.75,
        }));
      }
    }
    findings.push(...repoDomainFindings(artifact));
  }
  return findings;
}

function evidenceFromFinding(finding: ConceptFinding): EvidenceRef {
  return { commit: finding.commit, path: finding.path, label: finding.reason, snippet: finding.snippet };
}

export function extractConcepts(artifacts: CommitArtifact[]): Concept[] {
  const byId = new Map<string, Concept>();
  for (const finding of extractConceptFindings(artifacts)) {
    const def = CONCEPT_DEFINITIONS.find((candidate) => candidate.id === finding.conceptId);
    const existing = byId.get(finding.conceptId);
    const evidence = unique([...(existing?.evidence ?? []), evidenceFromFinding(finding)]).slice(0, def ? 12 : 10);
    byId.set(finding.conceptId, {
      id: finding.conceptId,
      label: def?.label ?? finding.conceptId.replace(/^repo\./, ''),
      kind: def?.kind ?? 'repo_domain',
      description: def?.description ?? 'Repo-specific concept inferred from repeatedly touched path names.',
      difficulty: def?.difficulty ?? 'beginner',
      parentIds: def?.parents ?? ['repo'],
      prerequisiteIds: def?.prerequisites ?? [],
      relatedIds: def?.related ?? [],
      evidence,
    });
  }
  return [...byId.values()].sort((a, b) => b.evidence.length - a.evidence.length || a.label.localeCompare(b.label));
}
