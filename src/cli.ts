#!/usr/bin/env node
import { Command } from 'commander';

import { extractConcepts } from './core/concepts.js';
import { addCorrection, recordReviewEvent } from './core/events.js';
import { collectCommits, collectLastCommit } from './core/git.js';
import { applyLexicon, loadLexicon, promoteCorrectionsToLexicon, saveLexicon, type RepoLexicon } from './core/lexicon.js';
import { mergeLearningState, recordAnswer } from './core/planner.js';
import { renderKnowledgeDebt, renderMermaidMap, renderProfile, renderReview, renderToday, stateSummary } from './core/render.js';
import { initState, loadState, saveState, statePath } from './core/store.js';
import { writeDashboard } from './dashboard/html.js';
import { startReviewServer } from './session/server.js';

const program = new Command();

function goalsFrom(value?: string): string[] {
  return value ? value.split(',').map((item) => item.trim()).filter(Boolean) : ['understand this repo', 'learn TypeScript', 'review AI code safely'];
}

function listFrom(value?: string): string[] | undefined {
  const items = value?.split(',').map((item) => item.trim()).filter(Boolean) ?? [];
  return items.length ? items : undefined;
}

function renderLexicon(lexicon: RepoLexicon): string {
  const lines = ['Local repo lexicon', '', `Concepts: ${lexicon.concepts.length}`, `Aliases: ${lexicon.aliases.length}`, `Ignores: ${lexicon.ignores.length}`, ''];
  for (const concept of lexicon.concepts) lines.push(`- concept ${concept.id}: ${concept.label}`);
  for (const alias of lexicon.aliases) lines.push(`- alias ${alias.conceptId}: ${alias.label}`);
  for (const ignore of lexicon.ignores) lines.push(`- ignore ${ignore.conceptId ?? '*'} ${ignore.pathPattern ?? ignore.term ?? ''}`.trim());
  return `${lines.join('\n')}\n`;
}

async function ingest(repo: string, since: string, limit: number): Promise<void> {
  const state = await loadState(repo);
  const artifacts = await collectCommits(repo, since, limit);
  const lexicon = await loadLexicon(repo);
  const concepts = applyLexicon(artifacts, extractConcepts(artifacts), lexicon);
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
    const concepts = applyLexicon([artifact], extractConcepts([artifact]), await loadLexicon(options.repo));
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

program.command('session')
  .description('Start a local interactive review session server')
  .option('-r, --repo <path>', 'repository path', process.cwd())
  .option('--port <number>', 'port, or 0 for a random available port', '0')
  .action(async (options: { repo: string; port: string }) => {
    const review = await startReviewServer(options.repo, Number.parseInt(options.port, 10));
    process.stdout.write(`MergeLearn Tutor session: ${review.url}\nPress Ctrl+C to stop.\n`);
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

program.command('feedback')
  .description('Mark a card useful, wrong, skipped, unsure, or deferred')
  .requiredOption('--item <id>', 'learning item id')
  .requiredOption('--event <type>', 'shown, skipped, marked_unsure, marked_wrong, marked_useful, marked_correct, or deferred')
  .option('-r, --repo <path>', 'repository path', process.cwd())
  .option('--note <text>', 'optional note')
  .action(async (options: { repo: string; item: string; event: string; note?: string }) => {
    const eventType = options.event as Parameters<typeof recordReviewEvent>[1]['eventType'];
    const next = recordReviewEvent(await loadState(options.repo), { itemId: options.item, eventType, note: options.note });
    await saveState(options.repo, next);
    process.stdout.write(`Recorded ${options.event} for ${options.item}.\n`);
  });

program.command('correct')
  .description('Correct or pin a concept so future sessions adapt')
  .requiredOption('--concept <id>', 'concept id')
  .requiredOption('--type <type>', 'wrong_concept, not_useful, better_label, pin_important, wrong_evidence, or duplicate')
  .option('-r, --repo <path>', 'repository path', process.cwd())
  .option('--label <text>', 'replacement label for better_label')
  .option('--note <text>', 'optional note')
  .action(async (options: { repo: string; concept: string; type: string; label?: string; note?: string }) => {
    const next = addCorrection(await loadState(options.repo), {
      targetType: 'concept',
      targetId: options.concept,
      correctionType: options.type as Parameters<typeof addCorrection>[1]['correctionType'],
      replacementLabel: options.label,
      note: options.note,
    });
    await saveState(options.repo, next);
    process.stdout.write(`Recorded ${options.type} correction for ${options.concept}.\n`);
  });

const concept = program.command('concept')
  .description('Manage local repo lexicon concepts in .skilltrace/lexicon.json');

concept.command('list')
  .description('List local custom concepts, aliases, and ignores')
  .option('-r, --repo <path>', 'repository path', process.cwd())
  .action(async (options: { repo: string }) => {
    process.stdout.write(renderLexicon(await loadLexicon(options.repo)));
  });

concept.command('add')
  .description('Add a local repo-specific concept without editing source code')
  .requiredOption('--id <id>', 'stable concept id, e.g. repo.billing_flow')
  .requiredOption('--label <text>', 'human-readable label')
  .option('-r, --repo <path>', 'repository path', process.cwd())
  .option('--description <text>', 'concept description')
  .option('--kind <kind>', 'concept kind', 'repo_domain')
  .option('--difficulty <level>', 'beginner, intermediate, or advanced', 'beginner')
  .option('--path <csv>', 'comma-separated changed-path matches or globs')
  .option('--term <csv>', 'comma-separated terms to match in recent diffs/commit text')
  .action(async (options: { repo: string; id: string; label: string; description?: string; kind: string; difficulty: string; path?: string; term?: string }) => {
    const lexicon = await loadLexicon(options.repo);
    const concepts = lexicon.concepts.filter((item) => item.id !== options.id);
    concepts.push({ id: options.id, label: options.label, description: options.description, kind: options.kind as never, difficulty: options.difficulty as never, pathPatterns: listFrom(options.path), terms: listFrom(options.term) });
    await saveLexicon(options.repo, { ...lexicon, concepts });
    process.stdout.write(`Saved local concept ${options.id}. Run ingest to apply it.\n`);
  });

concept.command('alias')
  .description('Override an extracted concept label locally')
  .requiredOption('--concept <id>', 'concept id')
  .requiredOption('--label <text>', 'local label')
  .option('-r, --repo <path>', 'repository path', process.cwd())
  .option('--note <text>', 'optional note')
  .action(async (options: { repo: string; concept: string; label: string; note?: string }) => {
    const lexicon = await loadLexicon(options.repo);
    const aliases = [...lexicon.aliases.filter((alias) => alias.conceptId !== options.concept), { conceptId: options.concept, label: options.label, note: options.note }];
    await saveLexicon(options.repo, { ...lexicon, aliases });
    process.stdout.write(`Saved local alias for ${options.concept}.\n`);
  });

concept.command('ignore')
  .description('Ignore a noisy concept, path pattern, or term locally')
  .option('-r, --repo <path>', 'repository path', process.cwd())
  .option('--concept <id>', 'optional concept id')
  .option('--path <glob>', 'optional changed-path match or glob')
  .option('--term <text>', 'optional term')
  .option('--note <text>', 'optional note')
  .action(async (options: { repo: string; concept?: string; path?: string; term?: string; note?: string }) => {
    if (!options.concept && !options.path && !options.term) throw new Error('concept ignore needs --concept, --path, or --term.');
    const lexicon = await loadLexicon(options.repo);
    await saveLexicon(options.repo, { ...lexicon, ignores: [...lexicon.ignores, { conceptId: options.concept, pathPattern: options.path, term: options.term, note: options.note }] });
    process.stdout.write('Saved local ignore rule. Run ingest to apply it.\n');
  });

concept.command('promote-corrections')
  .description('Promote existing corrections into local lexicon aliases, concepts, and ignores')
  .option('-r, --repo <path>', 'repository path', process.cwd())
  .action(async (options: { repo: string }) => {
    const next = promoteCorrectionsToLexicon(await loadState(options.repo), await loadLexicon(options.repo));
    await saveLexicon(options.repo, next);
    process.stdout.write('Promoted corrections into .skilltrace/lexicon.json. Run ingest to apply them.\n');
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`mergelearn-tutor: ${message}\n`);
  process.exitCode = 1;
});
