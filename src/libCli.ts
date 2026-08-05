#!/usr/bin/env node
/**
 * MergeLearn CLI: a model-free library authored by coding agents and reviewed
 * locally. The public surface is grouped by job in cliHelp.ts; deprecated
 * spellings remain hidden compatibility aliases during the 0.1.x transition.
 *
 * Canonical workflow:
 *   context           emit AuthoringContext for an agent
 *   apply [--open]    validate/store an AgentSetPatch, optionally open it
 *   list/show/grade   inspect and review the resulting library
 *   import/export     exchange state-free lesson bundles
 *   mastery/check     inspect learner progress and source-code drift
 *
 * buildProgram() is exported so tests drive the real command wiring directly.
 */

import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Command, Help } from 'commander';

import { resolveLibraryRoot } from './core/library/libraryStore.js';
import { buildAuthoringContext } from './core/library/authoringContext.js';
import { registerRepo } from './core/library/repoRegistry.js';
import { importAgentSet } from './core/library/importAgentSet.js';
import { formatLessonSummary, summarizeLesson } from './core/library/lessonSummary.js';
import { installSampleLesson } from './core/library/sampleLesson.js';
import { runDoctor } from './core/library/doctor.js';
import { listSetSummaries } from './core/library/setStore.js';
import { loadCard } from './core/library/cardStore.js';
import { getDueCards, selectDueCards } from './core/library/review/dueQueue.js';
import { orderDueQueue } from './core/library/review/interleave.js';
import { loadUserPreferences, saveUserPreferences, type QueueStrategy } from './core/library/userPreferences.js';
import { archiveCard, deleteCard, deleteSet, editCard, unarchiveCard } from './core/library/cardLifecycle.js';
import { searchCards } from './core/library/searchCards.js';
import {
  directoryHasEntries, exportLessonBundle, exportProfileBackup, importLessonBundle, restoreProfileBackup,
} from './core/library/bundle.js';
import { startSession, gradeCard, endSession } from './core/library/review/session.js';
import { ensureServer, probeServer, readServerLock, startManagedServer } from './session/managedServer.js';
import { createAndOpen } from './createAndOpen.js';
import { appendDogfoodEvent, dogfoodEventCounts } from './core/library/dogfood.js';
import { loadMasteryReport, type ProgressStats } from './core/library/mastery.js';
import {
  loadWeakReport, WEAK_MIN_ATTEMPTS, WEAK_MIN_FAILURES, WEAK_WINDOW,
} from './core/library/weakCards.js';
import { checkDrift, type DriftReport } from './core/library/drift.js';
import { formatCardRef, resolveCardRef, resolveTargetRef } from './core/library/cardRef.js';
import { renderHelp } from './cliHelp.js';
import {
  AGENT_ADAPTERS, applyInstall, detectAgents, planInstall, uninstall,
  type Scope,
} from './core/agentSkills.js';
import type { AgentSetPatch, ReviewRating } from './core/library/types.js';

function rootFrom(opts: { home?: string }): string {
  return resolveLibraryRoot(opts.home);
}

const out = (s: string) => console.log(s);
const note = (s: string) => console.error(s); // non-blocking hints; keeps stdout clean for piping

type GlobalOptions = { home?: string; json?: boolean; yes?: boolean };

/** Rows of `list cards` printed for a human before a truncation hint. The JSON
 * path is deliberately uncapped; see listCards. */
const HUMAN_CARD_PAGE = 100;

function deprecation(oldName: string, replacement: string): void {
  note(`deprecated: \`mergelearn ${oldName}\`; use \`mergelearn ${replacement}\``);
}

function printDrift(report: DriftReport): void {
  if (report.stale.length === 0) {
    out(`No stale citations (${report.groundedCards} grounded card(s) checked).`);
    return;
  }
  out(`${report.stale.length} stale card(s) across ${report.groundedCards} grounded card(s):`);
  for (const card of report.stale) {
    out(`  ${card.status.padEnd(17)} ${formatCardRef(card.setId, card.cardId)}  ${card.prompt}`);
    for (const ref of card.refs) {
      out(`    ${ref.path}:${ref.startLine ?? 1}-${ref.endLine ?? ref.startLine ?? 1} — ${ref.detail}`);
    }
  }
}

const packageVersion = (): string => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
  return pkg.version;
};

function requestBrowserOpen(url: string): boolean {
  const [command, args] = process.platform === 'darwin'
    ? ['open', [url]]
    : process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : ['xdg-open', [url]];
  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    // A missing platform opener reports asynchronously; consume it so the CLI
    // still returns the printed URL instead of crashing.
    child.once('error', () => undefined);
    child.unref();
    return true;
  } catch {
    return false;
  }
}

export function buildProgram(deps: {
  openUrl?: (url: string) => boolean;
  ensureLocalServer?: typeof ensureServer;
} = {}): Command {
  const program = new Command();
  const defaultHelp = new Help();
  const openUrl = deps.openUrl ?? requestBrowserOpen;
  const ensureLocalServer = deps.ensureLocalServer ?? ensureServer;
  program
    .name('mergelearn')
    .description('Model-free, agent-authored learning library')
    .version(packageVersion())
    .option('--home <path>', 'which library (default: MERGELEARN_HOME or ~/.mergelearn)')
    .option('--json', 'emit machine-readable output')
    .option('--yes', 'assume yes for destructive or bulk actions')
    .addHelpCommand(false)
    .configureHelp({
      formatHelp: (command, helper) => command.parent
        ? defaultHelp.formatHelp(command, helper)
        : renderHelp(new Set(command.commands.map((child) => child.name()))),
    });

  const globalOpt = () => program.opts<GlobalOptions>();
  const homeOpt = () => globalOpt();
  const wantsJson = (local?: { json?: boolean }) => !!(local?.json || globalOpt().json);
  const assumesYes = (local?: { yes?: boolean }) => !!(local?.yes || globalOpt().yes);

  program
    .command('help [command]')
    .description('show top-level or command-specific help')
    .option('--all', 'include internal, trial, and deprecated commands')
    .action((commandName: string | undefined, opts: { all?: boolean }) => {
      if (!commandName) {
        out(renderHelp(new Set(program.commands.map((command) => command.name())), { all: opts.all }).trimEnd());
        return;
      }
      const command = program.commands.find((candidate) => candidate.name() === commandName);
      if (!command) {
        out(`unknown command: ${commandName}`);
        process.exitCode = 1;
        return;
      }
      command.outputHelp();
    });

  type ApplyOptions = {
    file: string; agent?: string; dryRun?: boolean; open?: boolean; json?: boolean;
    /** Compatibility vocabulary for the pre-0.2 `import <patch>` spelling. */
    legacyImportWording?: boolean;
  };
  const runApply = async (opts: ApplyOptions): Promise<void> => {
    const noun = opts.legacyImportWording ? 'import' : 'apply';
    const past = opts.legacyImportWording ? 'imported' : 'applied';
    const patch = JSON.parse(await readFile(opts.file, 'utf8')) as AgentSetPatch;
    if (opts.open) {
      const result = await createAndOpen(rootFrom(homeOpt()), patch, {
        agentName: opts.agent, dryRun: opts.dryRun, openUrl,
      });
      if (wantsJson(opts)) out(JSON.stringify({ ...result, dryRun: !!opts.dryRun }, null, 2));
      else if (!result.imported) {
        out(`${noun} REJECTED (${result.errors.length} error(s)) — nothing written:`);
        for (const error of result.errors) out(`  - ${error.code}: ${error.message}`);
      } else if (!result.ok) {
        out(`lesson ${past} as ${result.setId}, but the local GUI did not start: ${result.errors[0]?.message}`);
        out('Run `mergelearn serve` to open the stored lesson.');
      } else {
        out(`${past} set "${result.setId}": ${result.cards.length} card(s)`);
        for (const line of formatLessonSummary(result.summary!)) out(`  ${line}`);
        out(`open: ${result.url}`);
      }
      if (!result.ok) process.exitCode = 1;
      return;
    }

    const result = await importAgentSet(rootFrom(homeOpt()), patch, {
      agentName: opts.agent, dryRun: opts.dryRun,
    });
    if (!result.ok) {
      if (wantsJson(opts)) out(JSON.stringify({ ...result, dryRun: !!opts.dryRun }, null, 2));
      else {
        const lead = opts.dryRun ? `preview: ${noun} WOULD BE REJECTED` : `${noun} REJECTED`;
        out(`${lead} (${result.errors.length} error(s)) — nothing written:`);
        for (const error of result.errors) out(`  - ${error.code}: ${error.message}`);
      }
      process.exitCode = 1;
      return;
    }
    const summary = summarizeLesson(patch, result.cards);
    if (wantsJson(opts)) {
      out(JSON.stringify({ ...result, dryRun: !!opts.dryRun, summary }, null, 2));
      return;
    }
    const active = result.cards.filter((card) => card.status === 'active').length;
    const flagged = result.cards.length - active;
    const verb = opts.dryRun ? `would ${noun}` : past;
    // "would apply set X" alone reads identically whether X is new or already
    // holds a lesson, which is how an unintended merge stays invisible until
    // the original content is gone.
    const into = result.mergedIntoExisting ? ' (into the EXISTING lesson)' : ' (new lesson)';
    out(`${verb} set "${result.setId}"${into}: ${active} active${flagged ? `, ${flagged} needs_review` : ''}, +${result.tagIdsAdded.length} tags`);
    for (const line of formatLessonSummary(summary)) out(`  ${line}`);
    for (const card of result.cards.filter((card) => card.status !== 'active')) {
      out(`  needs_review ${card.cardId}: ${card.reasons.join(', ')}`);
    }
    if (opts.dryRun) out('(dry run: nothing written — omit --dry-run to apply)');
    else {
      out('Run `mergelearn serve` to learn it, or pass `--open` next time.');
      // Cheapest possible reminder: the developer is already in the terminal at
      // the exact moment a lesson lands, so surface any backlog now rather than
      // hoping they remember to check later. Exclude the lesson just applied:
      // its cards are due immediately by definition, and echoing them back as a
      // "backlog" would be noise rather than news.
      const due = await getDueCards(rootFrom(homeOpt()), new Date());
      const elsewhere = due.filter((card) => card.setId !== result.setId).length;
      if (elsewhere) out(`${elsewhere} card(s) from other lessons also due for review.`);
    }
  };

  type BundleImportOptions = { file: string; asCopy?: boolean; dryRun?: boolean; json?: boolean };
  const runBundleImport = async (opts: BundleImportOptions): Promise<void> => {
    const result = await importLessonBundle(rootFrom(homeOpt()), opts.file, {
      asCopy: opts.asCopy, dryRun: opts.dryRun,
    });
    if (wantsJson(opts)) out(JSON.stringify(result, null, 2));
    else out(`${opts.dryRun ? 'would import' : 'imported'} ${result.cards.length} cards as ${result.setId}${opts.dryRun ? ' (dry run: nothing written)' : ''}`);
  };

  const runSkip = async (opts: { task: string; reason: string; json?: boolean }): Promise<void> => {
    const event = await appendDogfoodEvent(rootFrom(homeOpt()), {
      kind: 'skipped', task: opts.task, reason: opts.reason,
    });
    if (wantsJson(opts)) out(JSON.stringify(event, null, 2));
    else out(`recorded skipped task at ${event.ts}`);
  };

  type ListOptions = {
    set?: string; query?: string; archived?: boolean; tag?: string; folder?: string;
    limit?: string; strategy?: string; json?: boolean;
    /** Summary line only, no per-card list. */
    quiet?: boolean;
    /** Print nothing at all when nothing is due (for shell prompt hooks). */
    ifAny?: boolean;
  };
  const listSets = async (opts: ListOptions = {}): Promise<void> => {
    const summaries = await listSetSummaries(rootFrom(homeOpt()));
    if (wantsJson(opts)) return out(JSON.stringify(summaries, null, 2));
    if (summaries.length === 0) return out('(no sets yet — ask your agent to create a lesson)');
    for (const set of summaries) {
      out(`${set.id}  ${set.title}  [${set.cardCount} cards]${set.folderPath ? `  ${set.folderPath}` : ''}`);
    }
  };

  const listCards = async (opts: ListOptions = {}): Promise<void> => {
    // Fetch the FULL result set, then decide presentation here. searchCards
    // already walks every set and card before slicing, so asking for everything
    // costs nothing and buys an accurate total.
    const hits = await searchCards(rootFrom(homeOpt()), opts.query ?? '', {
      setIds: opts.set ? [opts.set] : undefined, includeArchived: opts.archived, limit: 0,
    });
    const explicitLimit = opts.limit === undefined ? undefined : Math.max(0, Number(opts.limit));
    // --json is COMPLETE by default. A machine consumer (the agent authoring
    // lessons) that receives 100 of 400 cards concludes the learner has nothing
    // on a topic they have 40 cards on, and re-teaches it. A wrong answer is
    // worse than a long one, and the caller can still page with --limit.
    if (wantsJson(opts)) {
      const shown = explicitLimit && explicitLimit > 0 ? hits.slice(0, explicitLimit) : hits;
      // Envelope, not a bare array: `returned` vs `total` is the only way a
      // consumer can tell a small library from a paged result.
      return out(JSON.stringify({
        cards: shown,
        total: hits.length,
        returned: shown.length,
        truncated: shown.length < hits.length,
      }, null, 2));
    }
    const cap = explicitLimit === undefined ? HUMAN_CARD_PAGE : explicitLimit;
    const shown = cap > 0 ? hits.slice(0, cap) : hits;
    for (const hit of shown) out(`${hit.status.padEnd(10)} ${formatCardRef(hit.setId, hit.cardId)}  ${hit.prompt}`);
    // Truncation must never be silent. stderr keeps stdout pipeable.
    if (shown.length < hits.length) {
      note(`showing ${shown.length} of ${hits.length} card(s); use --limit 0 for all, or --query to narrow`);
    }
  };

  const listDue = async (opts: ListOptions = {}): Promise<void> => {
    const root = rootFrom(homeOpt());
    const prefs = await loadUserPreferences(root);
    const limit = opts.limit === undefined ? prefs.reviewSessionCap : Number(opts.limit);
    const strategy = (opts.strategy ?? prefs.queueStrategy) as QueueStrategy;
    if (!Number.isInteger(limit) || limit < 0 || !['overdue', 'interleaved'].includes(strategy)) {
      out('limit must be non-negative and strategy must be overdue or interleaved');
      process.exitCode = 1;
      return;
    }
    const all = await getDueCards(root, new Date(), {
      setIds: opts.set ? [opts.set] : undefined,
      tagIds: opts.tag ? [opts.tag] : undefined,
      folderPaths: opts.folder ? [opts.folder] : undefined,
    });
    // --if-any makes this safe to put in a shell prompt hook: silent when there
    // is nothing to do, one line when there is. Spaced repetition only works if
    // the review happens near its scheduled moment, and nothing else in the
    // product ever tells the user that moment has arrived. Exit code stays 0 so
    // a precmd hook never pollutes $?.
    if (opts.ifAny && all.length === 0) return;
    const queueOptions = { strategy, seed: new Date().toISOString().slice(0, 10) };
    const prioritized = orderDueQueue(all, queueOptions);
    const cards = orderDueQueue(selectDueCards(prioritized, limit), queueOptions);
    if (wantsJson(opts)) {
      out(JSON.stringify({ total: all.length, shown: cards.length, strategy, cards }, null, 2));
      return;
    }
    if (opts.quiet) {
      out(`${all.length} card(s) due for review — run \`mergelearn serve\``);
      return;
    }
    out(`${cards.length} of ${all.length} card(s) due (${strategy})`);
    for (const card of cards) out(`  ${formatCardRef(card.setId, card.id)}  ${card.front.prompt}`);
  };

  // Step 1 of the manual authoring path: print the library state an agent
  // authors against. Your agent normally runs this for you.
  program
    .command('context')
    .description('print the library state (sets, tags, folders) for an agent to author against')
    .option('--goal <text>', 'optional: what to author, e.g. "Explain the auth changes in my last PR"')
    .option('--repo <path>', 'register + attach a repo for grounded cards')
    .option('--target-set <id>', 'author into an existing set')
    .option('--recent <n>', 'recent lessons to include for progression context', (value) => Number(value), 10)
    .action(async (opts: { goal?: string; repo?: string; targetSet?: string; recent: number }) => {
      const root = rootFrom(homeOpt());
      const repo = opts.repo ? await registerRepo(root, opts.repo) : undefined;
      const ctx = await buildAuthoringContext(root, { goal: opts.goal, repo, targetSetId: opts.targetSet, recent: opts.recent });
      out(JSON.stringify(ctx, null, 2));
      if (!opts.goal) note('note: no --goal given, so the agent has no steer on what to author. Add e.g. --goal "TypeScript unions" for a focused lesson.');
    });

  program
    .command('list <kind>')
    .description('list sets, cards, or cards due now')
    .option('--set <id>', 'only this set')
    .option('--query <text>', 'search set title, prompt, and short answer', '')
    .option('--archived', 'include archived cards')
    .option('--tag <id>', 'only due cards with this tag')
    .option('--folder <path>', 'only due cards in this folder subtree')
    .option('--limit <n>', 'cards: rows to print (0 = all; --json is always complete); due: override the review cap')
    .option('--strategy <name>', 'override due ordering: interleaved or overdue')
    .option('--quiet', 'due: print only the summary line')
    .option('--if-any', 'due: print nothing when nothing is due')
    .action(async (kind: string, opts: ListOptions) => {
      if (kind === 'sets') return listSets(opts);
      if (kind === 'cards') return listCards(opts);
      if (kind === 'due') return listDue(opts);
      out('kind must be sets, cards, or due');
      process.exitCode = 1;
    });

  program
    .command('sets', { hidden: true })
    .description('deprecated alias for `list sets`')
    .action(async () => { deprecation('sets', 'list sets'); await listSets(); });

  // Opt-in sample lesson so a fresh install has something to learn immediately.
  program
    .command('sample')
    .description('install the built-in sample lesson so you can try MergeLearn right away')
    .option('--dry-run', 'show what would happen, write nothing')
    .action(async (opts: { dryRun?: boolean; json?: boolean }) => {
      const res = await installSampleLesson(rootFrom(homeOpt()), { dryRun: opts.dryRun });
      if (wantsJson(opts)) {
        out(JSON.stringify({ ...res, dryRun: !!opts.dryRun }, null, 2));
        if (!res.ok) process.exitCode = 1;
        return;
      }
      if (!res.ok) {
        out(`sample install failed (${res.errors?.length ?? 0} error(s)):`);
        for (const e of res.errors ?? []) out(`  - ${e.code}: ${e.message}`);
        process.exitCode = 1;
        return;
      }
      if (res.status === 'current') {
        out(`Sample lesson already installed: "${res.title}" (${res.setId}).`);
      } else if (opts.dryRun) {
        out(`would install sample lesson "${res.title}" (${res.setId}): ${res.cardCount} activities`);
        out('(dry run: nothing written — omit --dry-run to apply)');
        return;
      } else {
        out(`Installed sample lesson "${res.title}" (${res.setId}): ${res.cardCount} activities.`);
      }
      out('Run `mergelearn serve` and open the printed URL to learn it.');
    });

  program
    .command('doctor')
    .description('diagnose local setup (read-only, offline)')
    .action(async (opts: { json?: boolean }) => {
      const result = await runDoctor(rootFrom(homeOpt()));
      if (wantsJson(opts)) out(JSON.stringify(result, null, 2));
      else {
        for (const c of result.checks) out(`${c.status.padEnd(4)} ${c.id.padEnd(12)} ${c.message}`);
        out(result.ok ? '\nSetup is usable.' : '\nSetup has blocking failures. Fix FAIL items, then rerun doctor.');
      }
      if (!result.ok) process.exitCode = 1;
    });

  // Agent -> library: one storage primitive, optionally followed by opening the GUI.
  program
    .command('apply')
    .description('apply an AgentSetPatch; optionally open the imported lesson')
    .requiredOption('--file <path>', 'AgentSetPatch JSON path')
    .option('--agent <name>', 'authoring agent name (provenance)')
    .option('--dry-run', 'validate and preview, write nothing')
    .option('--open', 'start/reuse the GUI and open the imported lesson')
    .action(runApply);

  program
    .command('create-and-open', { hidden: true })
    .description('deprecated alias for `apply --open`')
    .requiredOption('--file <path>', 'AgentSetPatch JSON path')
    .option('--agent <name>', 'authoring agent name (provenance)')
    .option('--dry-run', 'validate and preview, write nothing')
    .option('--no-open', 'apply and start the GUI without launching a browser')
    .action(async (opts: ApplyOptions & { open?: boolean }) => {
      deprecation('create-and-open', 'apply --open');
      if (opts.open === false) {
        const patch = JSON.parse(await readFile(opts.file, 'utf8')) as AgentSetPatch;
        const result = await createAndOpen(rootFrom(homeOpt()), patch, {
          agentName: opts.agent, dryRun: opts.dryRun, noOpen: true, openUrl,
        });
        if (wantsJson(opts)) out(JSON.stringify({ ...result, dryRun: !!opts.dryRun }, null, 2));
        else if (result.url) out(`open: ${result.url}`);
        if (!result.ok) process.exitCode = 1;
        return;
      }
      await runApply({ ...opts, open: true });
    });

  program.command('export')
    .description('export one lesson as a shareable, state-free bundle')
    .requiredOption('--set <id>', 'set id')
    .requiredOption('--output <path>', 'output .mergelearn.zip path')
    .action(async (opts: { set: string; output: string; json?: boolean }) => {
      const manifest = await exportLessonBundle(rootFrom(homeOpt()), opts.set, opts.output);
      if (wantsJson(opts)) out(JSON.stringify({ ok: true, output: opts.output, manifest }, null, 2));
      else out(`exported ${manifest.cardCount} cards to ${opts.output}`);
    });

  program
    .command('skip')
    .description('record a meaningful task for which no lesson was created')
    .requiredOption('--task <text>', 'completed task')
    .requiredOption('--reason <text>', 'why no lesson was worthwhile')
    .action(runSkip);

  program
    .command('skipped', { hidden: true })
    .description('deprecated alias for `skip`')
    .requiredOption('--task <text>', 'completed task')
    .requiredOption('--reason <text>', 'why no lesson was worthwhile')
    .action(async (opts: { task: string; reason: string; json?: boolean }) => {
      deprecation('skipped', 'skip');
      await runSkip(opts);
    });

  program
    .command('dogfood-summary')
    .description('summarize local dogfooding events')
    .action(async (opts: { json?: boolean }) => {
      const counts = await dogfoodEventCounts(rootFrom(homeOpt()));
      if (wantsJson(opts)) out(JSON.stringify(counts, null, 2));
      else out(`opened=${counts.opened}\nfeedback=${counts.feedback}\ndeferred=${counts.deferred}\nskipped=${counts.skipped}`);
    });

  program.command('import')
    .description('import a shared lesson bundle; legacy JSON patches route to `apply`')
    .requiredOption('--file <path>', 'bundle .mergelearn.zip path')
    .option('--as-copy', 'allocate a new set and card ids if the set already exists')
    .option('--dry-run', 'validate without writing')
    .option('--agent <name>', 'legacy JSON patch authoring agent name')
    .option('--open', 'legacy JSON patch: open after applying')
    .action(async (opts: BundleImportOptions & { agent?: string; open?: boolean }) => {
      if (opts.file.toLowerCase().endsWith('.json')) {
        deprecation('import --file <patch.json>', 'apply --file <patch.json>');
        await runApply({
          file: opts.file, agent: opts.agent, dryRun: opts.dryRun, open: opts.open,
          legacyImportWording: true,
        });
        return;
      }
      await runBundleImport(opts);
    });

  program.command('import-bundle', { hidden: true })
    .description('deprecated alias for `import`')
    .requiredOption('--file <path>', 'bundle .mergelearn.zip path')
    .option('--as-copy', 'allocate new set and card ids on collision')
    .option('--dry-run', 'validate without writing')
    .action(async (opts: BundleImportOptions) => {
      deprecation('import-bundle', 'import');
      await runBundleImport(opts);
    });

  program.command('backup')
    .description('create a private backup containing learning state and history')
    .requiredOption('--output <path>', 'output .mergelearn-backup.zip path')
    .action(async (opts: { output: string; json?: boolean }) => {
      const manifest = await exportProfileBackup(rootFrom(homeOpt()), opts.output);
      if (wantsJson(opts)) out(JSON.stringify({ ok: true, output: opts.output, manifest }, null, 2));
      else out(`private unencrypted backup written to ${opts.output} (${manifest.entryCount} files); store it securely`);
    });

  program.command('restore')
    .description('validate and restore a private profile backup')
    .requiredOption('--file <path>', 'backup .mergelearn-backup.zip path')
    .option('--force', 'replace a non-empty profile after validated staging')
    .option('--dry-run', 'validate without writing')
    .action(async (opts: { file: string; force?: boolean; dryRun?: boolean; json?: boolean }) => {
      const root = rootFrom(homeOpt());
      const manifest = await restoreProfileBackup(root, opts.file, { force: opts.force, dryRun: opts.dryRun });
      // A dry run now succeeds against a non-empty profile, so it must say that
      // the real restore will still need --force; otherwise "backup valid" reads
      // as "restore will work".
      const needsForce = !!opts.dryRun && !opts.force && await directoryHasEntries(root);
      if (wantsJson(opts)) {
        out(JSON.stringify({ ok: true, restored: !opts.dryRun, forceRequired: needsForce, manifest }, null, 2));
      } else if (opts.dryRun) {
        out(`backup valid (${manifest.entryCount} files; dry run: nothing written)`);
        if (needsForce) out('This profile is not empty — the real restore needs --force to replace it.');
      } else {
        out(`restored ${manifest.entryCount} files from private backup`);
      }
    });

  program
    .command('settings')
    .description('show or update review settings')
    .option('--review-session-cap <n>', 'maximum distinct cards per review sitting; 0 means uncapped')
    .option('--queue-strategy <name>', 'interleaved (default) or overdue')
    .action(async (opts: { reviewSessionCap?: string; queueStrategy?: string; json?: boolean }) => {
      const root = rootFrom(homeOpt());
      const current = await loadUserPreferences(root);
      const cap = opts.reviewSessionCap === undefined ? current.reviewSessionCap : Number(opts.reviewSessionCap);
      if (!Number.isInteger(cap) || cap < 0) { out('review session cap must be a non-negative integer'); process.exitCode = 1; return; }
      if (opts.queueStrategy && !['overdue', 'interleaved'].includes(opts.queueStrategy)) {
        out('queue strategy must be overdue or interleaved'); process.exitCode = 1; return;
      }
      const next = { reviewSessionCap: cap, queueStrategy: (opts.queueStrategy ?? current.queueStrategy) as QueueStrategy };
      if (opts.reviewSessionCap !== undefined || opts.queueStrategy !== undefined) await saveUserPreferences(root, next);
      if (wantsJson(opts)) out(JSON.stringify(next, null, 2));
      else out(`reviewSessionCap=${next.reviewSessionCap}\nqueueStrategy=${next.queueStrategy}`);
    });

  program
    .command('cards', { hidden: true })
    .description('deprecated alias for `list cards`')
    .option('--set <id>', 'only this set')
    .option('--query <text>', 'search set title, prompt, and short answer', '')
    .option('--archived', 'include archived cards')
    .action(async (opts: ListOptions) => { deprecation('cards', 'list cards'); await listCards(opts); });

  for (const action of ['archive', 'unarchive'] as const) {
    program.command(`${action} [ref]`)
      .description(`${action} one card; ref is setId/cardId`)
      .option('--set <id>', 'deprecated: set id')
      .option('--card <id>', 'deprecated: card id')
      .action(async (ref: string | undefined, opts: { set?: string; card?: string; json?: boolean }) => {
        const target = resolveCardRef(ref, opts);
        const card = action === 'archive'
          ? await archiveCard(rootFrom(homeOpt()), target.setId, target.cardId)
          : await unarchiveCard(rootFrom(homeOpt()), target.setId, target.cardId);
        if (wantsJson(opts)) out(JSON.stringify(card, null, 2));
        else out(`${action}d ${formatCardRef(card.setId, card.id)}`);
      });
  }

  program.command('edit [ref]')
    .description('edit teaching text without resetting the schedule; ref is setId/cardId')
    .option('--set <id>', 'deprecated: set id')
    .option('--card <id>', 'deprecated: card id')
    .option('--prompt <text>', 'new prompt')
    .option('--short-answer <text>', 'new short answer')
    .option('--explanation <text>', 'new explanation markdown')
    .action(async (ref: string | undefined, opts: {
      set?: string; card?: string; prompt?: string; shortAnswer?: string;
      explanation?: string; json?: boolean;
    }) => {
      const target = resolveCardRef(ref, opts);
      const card = await editCard(rootFrom(homeOpt()), target.setId, target.cardId, {
        ...(opts.prompt !== undefined ? { front: { prompt: opts.prompt } } : {}),
        ...(opts.shortAnswer !== undefined || opts.explanation !== undefined ? { back: {
          ...(opts.shortAnswer !== undefined ? { shortAnswer: opts.shortAnswer } : {}),
          ...(opts.explanation !== undefined ? { explanationMarkdown: opts.explanation } : {}),
        } } : {}),
      });
      if (wantsJson(opts)) out(JSON.stringify(card, null, 2));
      else out(`edited ${formatCardRef(card.setId, card.id)}`);
    });

  program.command('delete [ref]')
    .description('permanently delete a set or card; ref is setId or setId/cardId')
    .option('--set <id>', 'deprecated: set id')
    .option('--card <id>', 'deprecated: card id')
    .option('--yes', 'confirm permanent deletion')
    .option('--force', 'allow set deletion when review history exists')
    .action(async (ref: string | undefined, opts: {
      set?: string; card?: string; yes?: boolean; force?: boolean; json?: boolean;
    }) => {
      const target = resolveTargetRef(ref, opts);
      if (!assumesYes(opts)) {
        out('refusing permanent deletion without --yes; use archive for reversible removal');
        process.exitCode = 1;
        return;
      }
      if (target.cardId) {
        const result = await deleteCard(rootFrom(homeOpt()), target.setId, target.cardId);
        if (wantsJson(opts)) out(JSON.stringify(result, null, 2));
        else out(`deleted ${formatCardRef(target.setId, target.cardId)}`);
      } else {
        const result = await deleteSet(rootFrom(homeOpt()), target.setId, { force: opts.force });
        if (wantsJson(opts)) out(JSON.stringify(result, null, 2));
        else out(`deleted set ${target.setId}`);
      }
    });

  program
    .command('due')
    .description('list cards due now (shortcut for `list due`)')
    .option('--set <id>', 'only this set')
    .option('--tag <id>', 'only cards with this tag')
    .option('--folder <path>', 'only this folder subtree')
    .option('--limit <n>', 'override the configured review cap')
    .option('--strategy <name>', 'override: interleaved or overdue')
    .option('--quiet', 'print only the summary line, not each card')
    .option('--if-any', 'print nothing when nothing is due (for shell prompt hooks)')
    .action(listDue);

  program
    .command('show [ref]')
    .description('print a card front and back; ref is setId/cardId')
    .option('--set <id>', 'deprecated: set id')
    .option('--card <id>', 'deprecated: card id')
    .action(async (ref: string | undefined, opts: { set?: string; card?: string; json?: boolean }) => {
      const target = resolveCardRef(ref, opts);
      const card = await loadCard(rootFrom(homeOpt()), target.setId, target.cardId);
      if (!card) { out('card not found'); process.exitCode = 1; return; }
      if (wantsJson(opts)) return out(JSON.stringify(card, null, 2));
      out(`Q: ${card.front.prompt}`);
      if (card.front.contextMarkdown) out(`\n${card.front.contextMarkdown}`);
      out(`\nA: ${card.back.shortAnswer}`);
      out(`\n${card.back.explanationMarkdown}`);
      for (const source of card.sourceRefs ?? []) {
        out(`\n[source ${source.path}:${source.startLine}-${source.endLine} @ ${source.commit.slice(0, 8)} (${source.status})]`);
        if (source.frozenText) out(source.frozenText);
      }
    });

  program
    .command('grade [ref] [rating]')
    .description('grade a due card: 1 Again, 2 Hard, 3 Good, 4 Easy')
    .option('--set <id>', 'deprecated: set id')
    .option('--card <id>', 'deprecated: card id; without --set searches the due queue')
    .option('--rating <1-4>', 'deprecated: FSRS rating')
    .action(async (ref: string | undefined, ratingArg: string | undefined, opts: {
      set?: string; card?: string; rating?: string; json?: boolean;
    }) => {
      const root = rootFrom(homeOpt());
      const rating = Number(ratingArg ?? opts.rating) as ReviewRating;
      if (![1, 2, 3, 4].includes(rating)) {
        out('rating must be 1..4'); process.exitCode = 1; return;
      }
      const due = await getDueCards(root, new Date());
      let card;
      if (ref || opts.set) {
        const target = resolveCardRef(ref, opts);
        card = due.find((candidate) => candidate.setId === target.setId && candidate.id === target.cardId);
      } else if (opts.card) {
        // Pre-positional compatibility: card ids are stable and library-unique.
        card = due.find((candidate) => candidate.id === opts.card);
      }
      if (!card) { out('card not due (or not found)'); process.exitCode = 1; return; }
      const session = startSession('recommended');
      const updated = await gradeCard(root, session, card, rating);
      await endSession(root, session);
      const result = { card: formatCardRef(updated.setId, updated.id), rating, due: updated.fsrs.due };
      if (wantsJson(opts)) out(JSON.stringify(result, null, 2));
      else {
        const displayedRef = !ref && !opts.set && opts.card ? updated.id : result.card;
        out(`graded ${displayedRef} (${rating}); next due ${result.due}`);
      }
    });

  program
    .command('mastery')
    .description('show what has been learned, and how much is still remembered')
    .action(async (opts: { json?: boolean }) => {
      const report = await loadMasteryReport(rootFrom(homeOpt()));
      if (wantsJson(opts)) return out(JSON.stringify(report, null, 2));
      // Weakest first. A progress report exists to answer "where should the
      // next session go?", and a best-first list buries exactly that answer.
      const weakestFirst = <T extends ProgressStats>(rows: readonly T[]): T[] =>
        [...rows].sort((a, b) => a.coverage - b.coverage || a.retention - b.retention);
      const row = (label: string, s: ProgressStats): string => {
        // Never print "0% retained" for an unstudied topic: 0% reads as total
        // forgetting when it actually means nothing has been attempted yet.
        const retained = s.studied === 0 ? '—' : `${s.retention}%`;
        return `  ${`${s.coverage}%`.padStart(7)}  ${retained.padStart(8)}  `
          + `${`${s.studied}/${s.cardCount}`.padStart(7)}   ${label}`;
      };
      out('  learned  retained  studied   skill (tag)');
      if (report.tags.length === 0) out('  (no tagged cards yet)');
      for (const tag of weakestFirst(report.tags)) out(row(tag.label, tag));
      out('\n  learned  retained  studied   folder');
      if (report.folders.length === 0) out('  (no foldered cards yet)');
      for (const folder of weakestFirst(report.folders)) out(row(folder.path, folder));
      out('\nlearned = reached review at least once; retained = recalled right now (of studied)');
    });

  program
    .command('weak')
    .description('cards you keep failing to recall, from real review evidence')
    .action(async (opts: { json?: boolean }) => {
      const report = await loadWeakReport(rootFrom(homeOpt()));
      if (wantsJson(opts)) return out(JSON.stringify(report, null, 2));

      if (report.cards.length === 0) {
        // Never pad an empty result by ranking thin evidence: a command that
        // confidently names noise teaches the user to distrust it.
        out('No cards have enough evidence to call weak.');
        out(`Weakness requires at least ${WEAK_MIN_ATTEMPTS} attempts with at least `
          + `${WEAK_MIN_FAILURES} retrieval failures (last ${WEAK_WINDOW} attempts).`);
        out(report.attemptedCards === 0
          ? 'No cards have been reviewed yet — run `mergelearn serve` to start.'
          : `${report.attemptedCards} card(s) attempted; ${report.watch.length} need more evidence.`);
        return;
      }

      if (report.tags.length) {
        out('Weakest skills');
        // `weak/eligible` keeps the denominator visible: 3/4 and 3/40 are very
        // different situations and a bare count hides which one you are in.
        for (const tag of report.tags) out(`  ${tag.weak}/${tag.eligible}  ${tag.label}`);
        out('');
      }
      out('Weakest cards (most-failed first)');
      for (const card of report.cards) {
        out(`  ${card.failures}/${card.attempts} failed  ${formatCardRef(card.setId, card.cardId)}  ${card.prompt}`);
        const concepts = card.tagLabels.length ? `${card.tagLabels.join(', ')}  |  ` : '';
        out(`      ${concepts}${card.retention}% recall now, ${card.lapses} lifetime lapse(s), `
          + `${card.stability}d stability`);
      }
      if (report.watch.length) {
        note(`${report.watch.length} more card(s) attempted but below the evidence bar`);
      }
    });

  program
    .command('check')
    .description('find cards whose cited repository code is stale')
    .option('--set <id>', 'only this set')
    .option('--archived', 'also check archived cards')
    .action(async (opts: { set?: string; archived?: boolean; json?: boolean }) => {
      const report = await checkDrift(rootFrom(homeOpt()), {
        setId: opts.set, includeArchived: opts.archived,
      });
      if (wantsJson(opts)) out(JSON.stringify(report, null, 2));
      else printDrift(report);
    });

  program
    .command('prune')
    .description('archive cards whose cited repository code is stale')
    .option('--set <id>', 'only this set')
    .option('--yes', 'archive every matched active card')
    .action(async (opts: { set?: string; yes?: boolean; json?: boolean }) => {
      const root = rootFrom(homeOpt());
      const report = await checkDrift(root, { setId: opts.set });
      if (!assumesYes(opts)) {
        const preview = { ...report, archived: [] as string[], dryRun: true };
        if (wantsJson(opts)) out(JSON.stringify(preview, null, 2));
        else {
          printDrift(report);
          if (report.stale.length > 0) out('\nDry run: pass --yes to archive these cards. Nothing changed.');
        }
        return;
      }
      const archived: string[] = [];
      for (const stale of report.stale) {
        await archiveCard(root, stale.setId, stale.cardId);
        archived.push(formatCardRef(stale.setId, stale.cardId));
      }
      const result = { ...report, archived, dryRun: false };
      if (wantsJson(opts)) out(JSON.stringify(result, null, 2));
      else out(`Archived ${archived.length} stale card(s).`);
    });

  program
    .command('status')
    .description('show the managed local server state and installed version')
    .action(async (opts: { json?: boolean }) => {
      const root = rootFrom(homeOpt());
      const lock = await readServerLock(root);
      const healthy = lock ? await probeServer(lock) : false;
      // The due count belongs here because `status` is the one command a user
      // runs to ask "is there anything to do?". Without it, the only ways to
      // find out are `due` or opening the browser, both of which require
      // already remembering the tool exists.
      const due = await getDueCards(root, new Date());
      const result = {
        version: packageVersion(), library: root, running: healthy, due: due.length,
        ...(lock ? {
          url: lock.url, pid: lock.pid, port: lock.port, startedAt: lock.startedAt,
          managed: lock.managed, staleLock: !healthy,
        } : {}),
      };
      if (wantsJson(opts)) return out(JSON.stringify(result, null, 2));
      out(`MergeLearn ${result.version}`);
      out(`Library: ${root}`);
      out(result.due
        ? `Due: ${result.due} card(s) for review — run \`mergelearn serve\``
        : 'Due: nothing right now');
      if (healthy && lock) out(`Server: running at ${lock.url} (pid ${lock.pid})`);
      else if (lock) out(`Server: not running (stale lock for pid ${lock.pid})`);
      else out('Server: not running');
    });

  program
    .command('serve')
    .description('open the local review GUI (Home + Practice) in your browser')
    .option('--port <n>', 'port (default: random free port)', (v) => Number(v))
    .action(async (opts: { port?: number; json?: boolean }) => {
      const root = rootFrom(homeOpt());
      const server = await ensureLocalServer(root, { port: opts.port });
      if (wantsJson(opts)) {
        out(JSON.stringify({ ok: true, ...server }, null, 2));
        return;
      }
      out(`MergeLearn review GUI running at ${server.url}${server.reused ? ' (reused)' : ''}`);
      out(server.reused ? 'A local GUI is already running.' : 'Open it in your browser. It closes after inactivity.');
      if (!openUrl(server.url)) note(`Could not open a browser. Open ${server.url} manually.`);
    });

  program
    .command('server-run', { hidden: true })
    .description('internal managed local server entry point')
    .option('--port <n>', 'internal requested port', (v) => Number(v))
    .action(async (opts: { port?: number }) => {
      const managed = await startManagedServer(rootFrom(homeOpt()), { port: opts.port });
      out(`MergeLearn managed review GUI running at ${managed.url}`);
      const shutdown = () => { void managed.close().finally(() => process.exit(0)); };
      process.once('SIGINT', shutdown);
      process.once('SIGTERM', shutdown);
    });

  // Install the canonical authoring skill into coding agents' discovery dirs.
  program
    .command('setup-agent')
    .description('install the MergeLearn authoring skill into your coding agent(s)')
    .option('--agent <csv>', 'comma-separated agent ids or "all" (default: detected)')
    .option('--scope <scope>', 'global (default) or project', 'global')
    .option('--dry-run', 'show what would change, write nothing')
    .option('--uninstall', 'remove skills this tool installed (manifest-tracked only)')
    .action(async (opts: {
      agent?: string; scope?: string; dryRun?: boolean; uninstall?: boolean; json?: boolean;
    }) => {
      const root = rootFrom(homeOpt());
      const scope: Scope = opts.scope === 'project' ? 'project' : 'global';
      const known = Object.keys(AGENT_ADAPTERS);
      let agents = opts.agent
        ? opts.agent.split(',').map((s) => s.trim()).filter(Boolean)
        : await detectAgents(scope);
      if (!opts.agent && agents.length === 0) {
        out(`No coding agents detected for ${scope} scope. Pass --agent <${known.join('|')}|all>.`);
        process.exitCode = 1;
        return;
      }
      if (!opts.agent) out(`Detected agent(s): ${agents.join(', ')}`);

      if (opts.uninstall) {
        const { removed, missing } = await uninstall(root, { agents, scope });
        if (wantsJson(opts)) {
          out(JSON.stringify({ ok: true, action: 'uninstall', scope, agents, removed, missing }, null, 2));
          return;
        }
        out(`uninstalled ${removed.length} skill copy(ies)${missing.length ? `, ${missing.length} already gone` : ''}`);
        for (const r of removed) out(`  removed ${r.agent}/${r.skill}: ${r.destPath}`);
        return;
      }

      if (opts.dryRun) {
        const plan = await planInstall(root, { agents, scope });
        if (wantsJson(opts)) {
          out(JSON.stringify({ ok: true, action: 'install', scope, agents, dryRun: true, plan }, null, 2));
          return;
        }
        out(`Plan (${scope} scope) — dry run, nothing written:`);
        for (const a of plan) out(`  ${a.status.padEnd(16)} ${a.agent}/${a.skill} -> ${a.destDir}`);
        return;
      }

      const { copied, skipped } = await applyInstall(root, { agents, scope });
      if (wantsJson(opts)) {
        out(JSON.stringify({ ok: true, action: 'install', scope, agents, copied, skipped }, null, 2));
        return;
      }
      out(`Installed ${copied.length} skill copy(ies) into ${agents.length} agent dir(s):`);
      for (const a of copied) out(`  ${a.status.padEnd(10)} ${a.agent}/${a.skill} -> ${a.destDir} (${a.sourceChecksum.slice(0, 12)})`);
      for (const s of skipped) {
        const why = s.status === 'locally_modified' ? 'locally modified — left untouched' : 'already current';
        out(`  skipped    ${s.agent}/${s.skill}: ${why}`);
      }
      out('\nNext: open your coding agent in a repo and ask, e.g. "Create a MergeLearn lesson from my last PR."');
      out('Then run `mergelearn serve` to learn it in your browser. (The agent runs `context` and `apply` for you.)');
    });

  return program;
}

// Entry point: run only when this module is the process entry, not when a test
// imports buildProgram(). We compare realpaths so the npm-linked `mergelearn`
// bin (a symlink to dist/libCli.js) still matches — the old `endsWith('libCli.js')`
// check silently no-op'd under the linked bin name, killing `serve` and `--help`.
function isEntryPoint(): boolean {
  const arg = process.argv[1];
  if (!arg) return false;
  try {
    return realpathSync(arg) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}
if (isEntryPoint()) {
  buildProgram().parseAsync(process.argv).catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}
