#!/usr/bin/env node
import { Command } from 'commander';

import { extractConcepts } from './core/concepts.js';
import { coursesSummary, upsertCourse } from './core/courses.js';
import { enrichLearningItems, renderEnrichmentComparison } from './core/enrichment.js';
import { buildEvidenceTimeline } from './core/evidenceTimeline.js';
import { addCorrection, recordReviewEvent } from './core/events.js';
import { collectCommits, collectLastCommit } from './core/git.js';
import { applyLexicon, loadLexicon, promoteCorrectionsToLexicon, saveLexicon, type RepoLexicon } from './core/lexicon.js';
import { generateCardBatch, mergeLearningState, recordAnswer } from './core/planner.js';
import { loadPreferences, normalizePreferences, savePreferences } from './core/preferences.js';
import { draftQuestionsForCourse, questionSummary, updateQuestionStatus } from './core/questions.js';
import { createOutboundPreview, loadPrivacyConfig, renderOutboundPreview, savePrivacyConfig, type PrivacyConfig, type PrivacyProvider } from './core/privacy.js';
import { renderKnowledgeDebt, renderMermaidMap, renderProfile, renderProgress, renderReview, renderToday, stateSummary } from './core/render.js';
import { recordManualRating, renderManualRatingSummary } from './core/ratings.js';
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

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function scoreFrom(value?: string): number | undefined {
  return value === undefined ? undefined : Number.parseInt(value, 10);
}

function targetFrom(options: { item?: string; concept?: string }): { targetType: 'card' | 'concept'; targetId: string } {
  if (options.item && options.concept) throw new Error('Use either --item or --concept, not both.');
  if (options.item) return { targetType: 'card', targetId: options.item };
  if (options.concept) return { targetType: 'concept', targetId: options.concept };
  throw new Error('Manual rating requires --item <id> or --concept <id>.');
}

function renderLexicon(lexicon: RepoLexicon): string {
  const lines = ['Local repo lexicon', '', `Concepts: ${lexicon.concepts.length}`, `Aliases: ${lexicon.aliases.length}`, `Ignores: ${lexicon.ignores.length}`, ''];
  for (const concept of lexicon.concepts) lines.push(`- concept ${concept.id}: ${concept.label}`);
  for (const alias of lexicon.aliases) lines.push(`- alias ${alias.conceptId}: ${alias.label}`);
  for (const ignore of lexicon.ignores) lines.push(`- ignore ${ignore.conceptId ?? '*'} ${ignore.pathPattern ?? ignore.term ?? ''}`.trim());
  return `${lines.join('\n')}\n`;
}

function renderCourses(state: Awaited<ReturnType<typeof loadState>>): string {
  const courses = coursesSummary(state);
  return ['Learning courses', '', ...courses.map((course) => `- ${course.id}: ${course.title}\n  goal: ${course.goal}\n  materials: ${course.materialPaths.join(', ')}\n  docs: ${course.docPaths.join(', ')}\n  questions: ${course.questionCount}, active cards: ${course.activeCardCount}`)].join('\n') + '\n';
}

function renderQuestions(state: Awaited<ReturnType<typeof loadState>>): string {
  const summary = questionSummary(state);
  const lines = ['Question bank', '', `Total: ${summary.total}`, `Draft: ${summary.draft}`, `Accepted: ${summary.accepted}`, `Rejected: ${summary.rejected}`, `Draft batches: ${summary.batches}`, `Network used: ${summary.networkUsed ? 'yes' : 'no'}`, ''];
  for (const entry of state.questionBank.slice(-12).reverse()) lines.push(`- ${entry.id} [${entry.status}] ${entry.prompt}\n  course: ${entry.courseId ?? 'none'} · concept: ${entry.conceptId} · provider: ${entry.author.provider}`);
  return `${lines.join('\n')}\n`;
}

async function ingest(repo: string, since: string, limit: number): Promise<void> {
  const state = await loadState(repo);
  const artifacts = await collectCommits(repo, since, limit);
  const lexicon = await loadLexicon(repo);
  const concepts = applyLexicon(artifacts, extractConcepts(artifacts), lexicon);
  const next = mergeLearningState(state, artifacts, concepts, await loadPreferences(repo));
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

const cardsCommand = program.command('cards')
  .description('Manage generated flashcard batches');

cardsCommand.command('generate')
  .description('Generate more active cards or regenerate the current active queue')
  .option('-r, --repo <path>', 'repository path', process.cwd())
  .option('-n, --count <count>', 'number of cards to generate', '5')
  .option('--mode <mode>', 'more or regenerate', 'more')
  .option('--course <id>', 'optional course id to generate from accepted course questions')
  .option('--reason <text>', 'optional generation note')
  .action(async (options: { repo: string; count: string; mode: string; course?: string; reason?: string }) => {
    const mode = options.mode === 'regenerate' ? 'regenerate' : 'more';
    const next = generateCardBatch(await loadState(options.repo), await loadPreferences(options.repo), {
      count: Number.parseInt(options.count, 10),
      mode,
      courseId: options.course,
      reason: options.reason,
    });
    await saveState(options.repo, next);
    const lastBatch = next.cardBatches.at(-1)!;
    process.stdout.write(`Generated ${lastBatch.itemIds.length} cards in ${lastBatch.id}. Archived ${lastBatch.archivedItemIds.length}.\n`);
  });

const course = program.command('course')
  .description('Manage learning courses/tracks');

course.command('list')
  .description('List learning courses and their material/goals')
  .option('-r, --repo <path>', 'repository path', process.cwd())
  .action(async (options: { repo: string }) => {
    process.stdout.write(renderCourses(await loadState(options.repo)));
  });

course.command('create')
  .description('Create or update a course/track')
  .requiredOption('--id <id>', 'stable course id, e.g. learn-typescript')
  .requiredOption('--title <text>', 'course title')
  .requiredOption('--goal <text>', 'learning goal')
  .option('-r, --repo <path>', 'repository path', process.cwd())
  .option('--planes <csv>', 'enabled question planes')
  .option('--materials <csv>', 'material path globs')
  .option('--docs <csv>', 'documentation path globs')
  .option('--concepts <csv>', 'concept ids to focus')
  .action(async (options: { repo: string; id: string; title: string; goal: string; planes?: string; materials?: string; docs?: string; concepts?: string }) => {
    const next = upsertCourse(await loadState(options.repo), {
      id: options.id,
      title: options.title,
      goal: options.goal,
      enabledPlanes: listFrom(options.planes) as never,
      materialPaths: listFrom(options.materials),
      docPaths: listFrom(options.docs),
      conceptIds: listFrom(options.concepts),
    });
    await saveState(options.repo, next);
    process.stdout.write(`Saved course ${options.id}.\n`);
  });

const questions = program.command('questions')
  .description('Manage evidence-bound question drafts and accepted question bank entries');

questions.command('list')
  .description('List question drafts and accepted questions')
  .option('-r, --repo <path>', 'repository path', process.cwd())
  .action(async (options: { repo: string }) => {
    process.stdout.write(renderQuestions(await loadState(options.repo)));
  });

questions.command('draft')
  .description('Draft evidence-bound questions for a course with fake/local provider; remote is blocked')
  .option('-r, --repo <path>', 'repository path', process.cwd())
  .option('--course <id>', 'course id')
  .option('--provider <name>', 'fake, local, deterministic, or remote', 'fake')
  .option('--model <name>', 'provider model label')
  .option('-n, --count <count>', 'number of questions to draft', '6')
  .action(async (options: { repo: string; course?: string; provider: string; model?: string; count: string }) => {
    const next = draftQuestionsForCourse(await loadState(options.repo), { courseId: options.course, provider: options.provider as never, model: options.model, count: Number.parseInt(options.count, 10) });
    await saveState(options.repo, next);
    const batch = next.questionDraftBatches.at(-1)!;
    process.stdout.write(`Drafted ${batch.entryIds.length} questions in ${batch.id}. Network used: ${batch.networkUsed ? 'yes' : 'no'}.\n`);
  });

questions.command('accept')
  .description('Accept a question-bank draft for future course card generation')
  .requiredOption('--id <id>', 'question entry id')
  .option('-r, --repo <path>', 'repository path', process.cwd())
  .action(async (options: { repo: string; id: string }) => {
    const next = updateQuestionStatus(await loadState(options.repo), options.id, 'accepted');
    await saveState(options.repo, next);
    process.stdout.write(`Accepted question ${options.id}.\n`);
  });

questions.command('reject')
  .description('Reject a question-bank draft')
  .requiredOption('--id <id>', 'question entry id')
  .option('-r, --repo <path>', 'repository path', process.cwd())
  .action(async (options: { repo: string; id: string }) => {
    const next = updateQuestionStatus(await loadState(options.repo), options.id, 'rejected');
    await saveState(options.repo, next);
    process.stdout.write(`Rejected question ${options.id}.\n`);
  });

program.command('timeline')
  .description('Export evidence timeline/graph JSON for courses, docs, questions, cards, and events')
  .option('-r, --repo <path>', 'repository path', process.cwd())
  .action(async (options: { repo: string }) => {
    process.stdout.write(`${JSON.stringify(buildEvidenceTimeline(await loadState(options.repo)), null, 2)}\n`);
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

program.command('progress')
  .description('Show topic progress grouped by concept kind and hierarchy')
  .option('-r, --repo <path>', 'repository path', process.cwd())
  .action(async (options: { repo: string }) => {
    process.stdout.write(renderProgress(await loadState(options.repo)));
  });

const preferences = program.command('preferences')
  .description('Read or update snippet-first review preferences');

preferences.command('show')
  .description('Print .skilltrace/preferences.json, with defaults if missing')
  .option('-r, --repo <path>', 'repository path', process.cwd())
  .action(async (options: { repo: string }) => {
    process.stdout.write(`${JSON.stringify(await loadPreferences(options.repo), null, 2)}\n`);
  });

preferences.command('set')
  .description('Update snippet-first review preferences')
  .option('-r, --repo <path>', 'repository path', process.cwd())
  .option('--planes <csv>', 'enabled question planes, comma-separated')
  .option('--default-plane <plane>', 'fallback question plane')
  .option('--snippet-lines <count>', 'maximum snippet lines per card')
  .option('--show-explanations <value>', 'true or false')
  .action(async (options: { repo: string; planes?: string; defaultPlane?: string; snippetLines?: string; showExplanations?: string }) => {
    const current = await loadPreferences(options.repo);
    const next = normalizePreferences({
      ...current,
      review: {
        ...current.review,
        enabledPlanes: listFrom(options.planes) as typeof current.review.enabledPlanes | undefined ?? current.review.enabledPlanes,
        defaultPlane: options.defaultPlane as typeof current.review.defaultPlane | undefined ?? current.review.defaultPlane,
        snippetLineCount: options.snippetLines ? Number.parseInt(options.snippetLines, 10) : current.review.snippetLineCount,
        showExplanationsByDefault: options.showExplanations ? options.showExplanations === 'true' : current.review.showExplanationsByDefault,
      },
    });
    await savePreferences(options.repo, next);
    process.stdout.write(`${JSON.stringify(next, null, 2)}\n`);
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

const privacy = program.command('privacy')
  .description('Inspect local privacy config and outbound payload previews');

privacy.command('init')
  .description('Write an offline-by-default .skilltrace/privacy.json')
  .option('-r, --repo <path>', 'repository path', process.cwd())
  .option('--ignore-path <glob>', 'path/glob to omit from outbound previews', collect, [])
  .option('--redact <term>', 'extra literal term to redact from previews', collect, [])
  .action(async (options: { repo: string; ignorePath: string[]; redact: string[] }) => {
    const config: PrivacyConfig = { version: 1, network: { enabled: false, consentToSend: false }, redaction: { replacement: '[REDACTED]', extraTerms: options.redact }, ignorePaths: options.ignorePath, includeSnippetsByDefault: false };
    await savePrivacyConfig(options.repo, config);
    process.stdout.write('Wrote offline privacy config to .skilltrace/privacy.json.\n');
  });

privacy.command('preview')
  .description('Show exactly what optional enrichment would receive; sends nothing')
  .option('-r, --repo <path>', 'repository path', process.cwd())
  .option('--provider <name>', 'fake, local, or remote provider label for preview only')
  .option('--include-snippets', 'include bounded evidence snippets in the preview', false)
  .option('--limit <count>', 'maximum cards to preview', '5')
  .action(async (options: { repo: string; provider?: string; includeSnippets: boolean; limit: string }) => {
    const preview = createOutboundPreview(await loadState(options.repo), await loadPrivacyConfig(options.repo), {
      provider: options.provider as PrivacyProvider | undefined,
      includeSnippets: options.includeSnippets,
      limit: Number.parseInt(options.limit, 10),
    });
    process.stdout.write(renderOutboundPreview(preview));
  });

program.command('enrich')
  .description('Compare deterministic cards with fake/local wording enrichment; sends no network')
  .option('-r, --repo <path>', 'repository path', process.cwd())
  .option('--provider <name>', 'fake or local provider for the local-only experiment', 'fake')
  .option('--include-snippets', 'include bounded evidence snippets in the preview used for enrichment', false)
  .option('--limit <count>', 'maximum cards to enrich', '5')
  .action(async (options: { repo: string; provider: string; includeSnippets: boolean; limit: string }) => {
    const result = enrichLearningItems(await loadState(options.repo), await loadPrivacyConfig(options.repo), {
      provider: options.provider,
      includeSnippets: options.includeSnippets,
      limit: Number.parseInt(options.limit, 10),
    });
    process.stdout.write(renderEnrichmentComparison(result));
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
  .description('Mark a card useful, wrong, skipped, unsure, deferred, or quality-problem')
  .requiredOption('--item <id>', 'learning item id')
  .requiredOption('--event <type>', 'shown, skipped, marked_unsure, marked_wrong, marked_useful, marked_bad_card, marked_wrong_evidence, marked_duplicate, marked_correct, or deferred')
  .option('-r, --repo <path>', 'repository path', process.cwd())
  .option('--note <text>', 'optional note')
  .action(async (options: { repo: string; item: string; event: string; note?: string }) => {
    const eventType = options.event as Parameters<typeof recordReviewEvent>[1]['eventType'];
    const next = recordReviewEvent(await loadState(options.repo), { itemId: options.item, eventType, note: options.note });
    await saveState(options.repo, next);
    process.stdout.write(`Recorded ${options.event} for ${options.item}.\n`);
  });

program.command('rate')
  .description('Persist a manual 1-5 quality rating for a concept or card')
  .option('--item <id>', 'learning item/card id to rate')
  .option('--concept <id>', 'concept id to rate')
  .option('-r, --repo <path>', 'repository path', process.cwd())
  .option('--relevance <1-5>', 'concept relevance score')
  .option('--evidence <1-5>', 'evidence correctness score')
  .option('--answerability <1-5>', 'card answerability score')
  .option('--usefulness <1-5>', 'learning usefulness score')
  .option('--repeatability <1-5>', 'would-repeat-session score')
  .option('--note <text>', 'optional rating note')
  .action(async (options: { repo: string; item?: string; concept?: string; relevance?: string; evidence?: string; answerability?: string; usefulness?: string; repeatability?: string; note?: string }) => {
    const target = targetFrom(options);
    const next = recordManualRating(await loadState(options.repo), {
      ...target,
      relevance: scoreFrom(options.relevance),
      evidence: scoreFrom(options.evidence),
      answerability: scoreFrom(options.answerability),
      usefulness: scoreFrom(options.usefulness),
      repeatability: scoreFrom(options.repeatability),
      note: options.note,
    });
    await saveState(options.repo, next);
    process.stdout.write(`Recorded manual rating for ${target.targetId}.\n`);
  });

program.command('ratings')
  .description('Summarize persisted manual quality ratings')
  .option('-r, --repo <path>', 'repository path', process.cwd())
  .action(async (options: { repo: string }) => {
    process.stdout.write(renderManualRatingSummary(await loadState(options.repo)));
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
