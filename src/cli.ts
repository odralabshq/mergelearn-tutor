#!/usr/bin/env node
import { Command } from 'commander';

import { extractConcepts } from './core/concepts.js';
import { collectCommits, collectLastCommit } from './core/git.js';
import { mergeLearningState, recordAnswer } from './core/planner.js';
import { renderKnowledgeDebt, renderMermaidMap, renderProfile, renderReview, renderToday, stateSummary } from './core/render.js';
import { initState, loadState, saveState, statePath } from './core/store.js';
import { writeDashboard } from './dashboard/html.js';

const program = new Command();

function goalsFrom(value?: string): string[] {
  return value ? value.split(',').map((item) => item.trim()).filter(Boolean) : ['understand this repo', 'learn TypeScript', 'review AI code safely'];
}

async function ingest(repo: string, since: string, limit: number): Promise<void> {
  const state = await loadState(repo);
  const artifacts = await collectCommits(repo, since, limit);
  const concepts = extractConcepts(artifacts);
  const next = mergeLearningState(state, artifacts, concepts);
  await saveState(repo, next);
  process.stdout.write(`${stateSummary(next)}\nState: ${statePath(repo)}\n`);
}

program
  .name('mergelearn-tutor')
  .description('Local-first repo-aware code tutor that turns git history into daily learning cards')
  .version('0.1.0');

program.command('init')
  .description('Create a transparent local learner profile in .skilltrace/state.json')
  .option('-r, --repo <path>', 'repository path', process.cwd())
  .option('-g, --goals <csv>', 'comma-separated learning goals')
  .action(async (options: { repo: string; goals?: string }) => {
    const state = await initState(options.repo, goalsFrom(options.goals));
    process.stdout.write(`Initialized MergeLearn Tutor for ${state.repoPath}\nState: ${statePath(options.repo)}\n`);
  });

program.command('ingest')
  .description('Read recent git commits and update the personal skill graph')
  .option('-r, --repo <path>', 'repository path', process.cwd())
  .option('--since <time>', 'git --since value, e.g. 30d or "2 weeks ago"', '30d')
  .option('--limit <count>', 'maximum commits to inspect', '80')
  .action(async (options: { repo: string; since: string; limit: string }) => {
    await ingest(options.repo, options.since, Number.parseInt(options.limit, 10));
  });

program.command('today')
  .description('Show the next 3-5 minute learning session')
  .option('-r, --repo <path>', 'repository path', process.cwd())
  .action(async (options: { repo: string }) => {
    process.stdout.write(renderToday(await loadState(options.repo)));
  });

program.command('review')
  .description('Show full learning cards with evidence and explain-back prompts')
  .option('-r, --repo <path>', 'repository path', process.cwd())
  .option('-n, --count <count>', 'number of cards', '5')
  .action(async (options: { repo: string; count: string }) => {
    process.stdout.write(renderReview(await loadState(options.repo), Number.parseInt(options.count, 10)));
  });

program.command('profile')
  .description('Show the transparent personal skill ledger')
  .option('-r, --repo <path>', 'repository path', process.cwd())
  .action(async (options: { repo: string }) => {
    process.stdout.write(renderProfile(await loadState(options.repo)));
  });

program.command('debt')
  .description('Show weak-but-important concepts from recent work')
  .option('-r, --repo <path>', 'repository path', process.cwd())
  .action(async (options: { repo: string }) => {
    process.stdout.write(renderKnowledgeDebt(await loadState(options.repo)));
  });

program.command('map')
  .description('Print a Mermaid skill graph')
  .option('-r, --repo <path>', 'repository path', process.cwd())
  .action(async (options: { repo: string }) => {
    process.stdout.write(renderMermaidMap(await loadState(options.repo)));
  });

program.command('explain-last-commit')
  .description('Generate a learning-focused explanation for the last commit')
  .option('-r, --repo <path>', 'repository path', process.cwd())
  .action(async (options: { repo: string }) => {
    const artifact = await collectLastCommit(options.repo);
    if (!artifact) throw new Error('No commits found.');
    const concepts = extractConcepts([artifact]);
    process.stdout.write(`Last commit: ${artifact.externalId.slice(0, 8)} ${artifact.title}\n\n`);
    process.stdout.write(`Concepts touched:\n${concepts.map((concept) => `- ${concept.label}: ${concept.description}`).join('\n')}\n`);
  });

program.command('dashboard')
  .description('Write a local static HTML dashboard')
  .option('-r, --repo <path>', 'repository path', process.cwd())
  .option('-o, --out <file>', 'output path relative to repo', '.skilltrace/dashboard.html')
  .action(async (options: { repo: string; out: string }) => {
    const output = await writeDashboard(options.repo, await loadState(options.repo), options.out);
    process.stdout.write(`Dashboard: ${output}\n`);
  });

program.command('answer')
  .description('Record an explain-back answer for a card')
  .requiredOption('--item <id>', 'learning item id')
  .requiredOption('--answer <text>', 'plain-English answer')
  .option('-r, --repo <path>', 'repository path', process.cwd())
  .option('--correct', 'mark answer correct', false)
  .action(async (options: { repo: string; item: string; answer: string; correct: boolean }) => {
    const next = recordAnswer(await loadState(options.repo), options.item, options.answer, options.correct);
    await saveState(options.repo, next);
    process.stdout.write(`Recorded answer for ${options.item}.\n`);
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`mergelearn-tutor: ${message}\n`);
  process.exitCode = 1;
});
