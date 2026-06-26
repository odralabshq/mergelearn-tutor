import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { EvaluationRun } from './types.js';

export function renderEvaluationMarkdown(run: EvaluationRun): string {
  const lines = ['# MergeLearn Tutor Evaluation Report', '', `Generated: ${run.createdAt}`, '', '## Aggregate', ''];
  lines.push(`- Repos: ${run.aggregate.repoCount}`);
  lines.push(`- Commits/artifacts: ${run.aggregate.totalArtifacts}`);
  lines.push(`- Concepts: ${run.aggregate.totalConcepts}`);
  lines.push(`- Cards: ${run.aggregate.totalCards}`);
  lines.push(`- Grounded concept rate: ${percent(run.aggregate.groundedConceptRate)}`);
  lines.push(`- Answerable card heuristic rate: ${percent(run.aggregate.answerableCardRate)}`);
  lines.push(`- Expected concept hit rate: ${run.aggregate.expectedConceptHitRate === null ? 'n/a' : percent(run.aggregate.expectedConceptHitRate)}`);
  for (const repo of run.repos) {
    lines.push('', `## ${repo.spec.name}`, '', `Path: \`${repo.spec.repoPath}\``, '');
    lines.push(`- Artifacts: ${repo.artifactCount}`);
    lines.push(`- Concepts: ${repo.conceptCount}`);
    lines.push(`- Cards: ${repo.cardCount}`);
    lines.push(`- Grounded concept rate: ${percent(repo.scores.groundedConceptRate)}`);
    lines.push(`- Answerable card heuristic rate: ${percent(repo.scores.answerableCardRate)}`);
    lines.push(`- Expected hits: ${repo.expectedConceptHits.length ? repo.expectedConceptHits.join(', ') : 'none'}`);
    if (repo.missingExpectedConcepts.length) lines.push(`- Missing expected: ${repo.missingExpectedConcepts.join(', ')}`);
    if (repo.enrichment) lines.push(`- Enrichment: ${repo.enrichment.provider}; cards ${repo.enrichment.enrichedCardCount}; network used: no; provenance: ${repo.enrichment.provenanceOk ? 'ok' : 'needs review'}`);
    if (repo.warnings.length) lines.push(`- Warnings: ${repo.warnings.join('; ')}`);
    lines.push('', '### Top concepts', '');
    for (const concept of repo.conceptFindings.slice(0, 10)) {
      lines.push(`- ${concept.expected ? '✅ ' : ''}${concept.label} (${concept.id}) — evidence ${concept.evidenceCount}, paths: ${concept.evidencePaths.slice(0, 3).join(', ')}`);
    }
    lines.push('', '### Top cards', '');
    for (const card of repo.cardFindings.slice(0, 8)) {
      lines.push(`- ${card.title} — ${card.answerableHeuristic ? 'answerable' : 'needs review'}; evidence ${card.evidenceCount}`);
    }
  }
  lines.push('', '## Manual rating rubric', '', 'Persist ratings with:', '', '```bash', 'mergelearn-tutor rate --repo <repo> --item <card-id> --answerability 5 --usefulness 4 --note "grounded and clear"', 'mergelearn-tutor rate --repo <repo> --concept <concept-id> --relevance 5 --evidence 4', 'mergelearn-tutor ratings --repo <repo>', '```', '', '| Item | Rating 1-5 | Notes |', '|---|---:|---|', '| Top concepts are relevant |  |  |', '| Evidence paths are correct |  |  |', '| Cards are answerable |  |  |', '| Cards teach something useful |  |  |', '| Session would be worth repeating |  |  |');
  return `${lines.join('\n')}\n`;
}

export async function writeEvaluationOutputs(run: EvaluationRun, outDir: string): Promise<{ jsonPath: string; markdownPath: string }> {
  await mkdir(outDir, { recursive: true });
  const jsonPath = path.join(outDir, 'evaluation-run.json');
  const markdownPath = path.join(outDir, 'evaluation-report.md');
  await writeFile(jsonPath, `${JSON.stringify(run, null, 2)}\n`);
  await writeFile(markdownPath, renderEvaluationMarkdown(run));
  return { jsonPath, markdownPath };
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
