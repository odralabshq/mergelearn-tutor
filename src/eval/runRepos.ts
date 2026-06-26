import { rm } from 'node:fs/promises';

import { createAllEvalFixtures } from './fixtures.js';
import { writeEvaluationOutputs } from './report.js';
import { evaluateRepos } from './runner.js';
import type { EvaluationRepoSpec } from './types.js';

function valueAfter(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}

function allValuesAfter(args: string[], flag: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < args.length; i += 1) if (args[i] === flag && args[i + 1]) values.push(args[i + 1]!);
  return values;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const out = valueAfter(args, '--out') ?? 'eval-runs/latest';
  const since = valueAfter(args, '--since') ?? '30d';
  const limit = Number.parseInt(valueAfter(args, '--limit') ?? '80', 10);
  const specs: EvaluationRepoSpec[] = [];
  const fixtureSpecs = args.includes('--fixtures') ? await createAllEvalFixtures() : [];
  specs.push(...fixtureSpecs);
  specs.push(...allValuesAfter(args, '--repo').map((repoPath, index) => ({ id: `repo-${index + 1}`, name: repoPath.split(/[\\/]/).filter(Boolean).at(-1) ?? repoPath, repoPath, since, limit })));
  if (specs.length === 0) throw new Error('No repos specified. Use --fixtures and/or --repo <path>.');
  const run = await evaluateRepos(specs);
  const outputs = await writeEvaluationOutputs(run, out);
  process.stdout.write(`Evaluation complete\nJSON: ${outputs.jsonPath}\nMarkdown: ${outputs.markdownPath}\nRepos: ${run.aggregate.repoCount}\nConcepts: ${run.aggregate.totalConcepts}\nCards: ${run.aggregate.totalCards}\n`);
  for (const fixture of fixtureSpecs) await rm(fixture.repoPath, { recursive: true, force: true });
  if (run.aggregate.totalConcepts === 0 || run.aggregate.totalCards === 0) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
