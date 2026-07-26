#!/usr/bin/env node
/**
 * Library CLI (docs/design/redesign-2026-07). Additive entry point for the v2
 * agent-authored library; the legacy `mergelearn-tutor` bin is untouched until
 * the Phase B cutover.
 *
 * Commands:
 *   context  emit the AuthoringContext JSON (tutor -> agent, handshake step 1)
 *   import   apply an AgentSetPatch JSON     (agent -> tutor, handshake step 2)
 *   sets     list card sets
 *   due      list cards due now (optionally filtered)
 *   show     print a card front+back (learn by reading)
 *   grade    grade one due card non-interactively (1..4)
 *
 * buildProgram() is exported so tests drive the real command wiring directly.
 */

import { readFile } from 'node:fs/promises';
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Command } from 'commander';

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
import { exportLessonBundle, exportProfileBackup, importLessonBundle, restoreProfileBackup } from './core/library/bundle.js';
import { startSession, gradeCard, endSession } from './core/library/review/session.js';
import { startReviewServer } from './session/server.js';
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
const packageVersion = (): string => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
  return pkg.version;
};

export function buildProgram(): Command {
  const program = new Command();
  program
    .name('mergelearn')
    .description('Model-free, agent-authored learning library')
    .version(packageVersion())
    .option('--home <path>', 'library root (default: MERGELEARN_HOME or ~/.mergelearn)');

  program.addHelpText('after', `
Recommended: use MergeLearn through your coding agent.
  1. mergelearn setup-agent          install the authoring skill into your agent
  2. In your agent, ask:             "Create a MergeLearn lesson from my last PR."
  3. mergelearn serve                open the browser and learn
Your agent runs 'context' and 'import' for you; you rarely type them yourself.

Manual/advanced: author a lesson yourself.
  mergelearn context --goal "..."    print the library state to author against
  mergelearn import --file patch.json   validate + apply an AgentSetPatch (use --dry-run to preview)
  mergelearn serve                   open the browser and learn`);

  const homeOpt = () => program.opts<{ home?: string }>();

  // Step 1 of the manual authoring path: print the library state an agent
  // authors against. Your agent normally runs this for you.
  program
    .command('context')
    .description('print the library state (sets, tags, folders) for an agent to author against')
    .option('--goal <text>', 'optional: what to author, e.g. "Explain the auth changes in my last PR"')
    .option('--repo <path>', 'register + attach a repo for grounded cards')
    .option('--target-set <id>', 'author into an existing set')
    .action(async (opts: { goal?: string; repo?: string; targetSet?: string }) => {
      const root = rootFrom(homeOpt());
      const repo = opts.repo ? await registerRepo(root, opts.repo) : undefined;
      const ctx = await buildAuthoringContext(root, { goal: opts.goal, repo, targetSetId: opts.targetSet });
      out(JSON.stringify(ctx, null, 2));
      if (!opts.goal) note('note: no --goal given, so the agent has no steer on what to author. Add e.g. --goal "TypeScript unions" for a focused lesson.');
    });

  program
    .command('sets')
    .description('list card sets')
    .action(async () => {
      const summaries = await listSetSummaries(rootFrom(homeOpt()));
      if (summaries.length === 0) return out('(no sets yet — author one with `context` then `import`)');
      for (const s of summaries) {
        out(`${s.id}  ${s.title}  [${s.cardCount} cards]${s.folderPath ? `  ${s.folderPath}` : ''}`);
      }
    });

  // Opt-in sample lesson so a fresh install has something to learn immediately.
  program
    .command('sample')
    .description('install the built-in sample lesson so you can try MergeLearn right away')
    .option('--dry-run', 'show what would happen, write nothing')
    .action(async (opts: { dryRun?: boolean }) => {
      const res = await installSampleLesson(rootFrom(homeOpt()), { dryRun: opts.dryRun });
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
    .option('--json', 'emit machine-readable JSON for agents and issue reports')
    .action(async (opts: { json?: boolean }) => {
      const result = await runDoctor(rootFrom(homeOpt()));
      if (opts.json) out(JSON.stringify(result, null, 2));
      else {
        for (const c of result.checks) out(`${c.status.padEnd(4)} ${c.id.padEnd(12)} ${c.message}`);
        out(result.ok ? '\nSetup is usable.' : '\nSetup has blocking failures. Fix FAIL items, then rerun doctor.');
      }
      if (!result.ok) process.exitCode = 1;
    });

  // handshake step 2: agent -> tutor
  program
    .command('import')
    .description('apply an AgentSetPatch JSON file (the only card-creation path)')
    .requiredOption('--file <path>', 'path to the AgentSetPatch JSON')
    .option('--agent <name>', 'authoring agent name (provenance)')
    .option('--dry-run', 'validate and preview the outcome, write nothing')
    .option('--json', 'emit machine-readable import result + lesson summary')
    .action(async (opts: { file: string; agent?: string; dryRun?: boolean; json?: boolean }) => {
      const patch = JSON.parse(await readFile(opts.file, 'utf8')) as AgentSetPatch;
      const res = await importAgentSet(rootFrom(homeOpt()), patch, { agentName: opts.agent, dryRun: opts.dryRun });
      if (!res.ok) {
        if (opts.json) out(JSON.stringify({ ...res, dryRun: !!opts.dryRun }, null, 2));
        else {
          const lead = opts.dryRun ? 'preview: import WOULD BE REJECTED' : 'import REJECTED';
          out(`${lead} (${res.errors.length} error(s)) — nothing written:`);
          for (const e of res.errors) out(`  - ${e.code}: ${e.message}`);
        }
        process.exitCode = 1;
        return;
      }
      const summary = summarizeLesson(patch, res.cards);
      if (opts.json) {
        out(JSON.stringify({ ...res, dryRun: !!opts.dryRun, summary }, null, 2));
        return;
      }
      const active = res.cards.filter((c) => c.status === 'active').length;
      const flagged = res.cards.length - active;
      const verb = opts.dryRun ? 'would import' : 'imported';
      out(`${verb} set "${res.setId}": ${active} active${flagged ? `, ${flagged} needs_review` : ''}, +${res.tagIdsAdded.length} tags`);
      for (const line of formatLessonSummary(summary)) out(`  ${line}`);
      for (const c of res.cards.filter((c) => c.status !== 'active')) {
        out(`  needs_review ${c.cardId}: ${c.reasons.join(', ')}`);
      }
      if (opts.dryRun) out('(dry run: nothing written — omit --dry-run to apply)');
      else out('Run `mergelearn serve` and open the printed URL to learn it.');
    });

  program.command('export')
    .description('export one lesson as a shareable, state-free bundle')
    .requiredOption('--set <id>', 'set id')
    .requiredOption('--output <path>', 'output .mergelearn.zip path')
    .option('--json', 'emit machine-readable result')
    .action(async (opts: { set: string; output: string; json?: boolean }) => {
      const manifest = await exportLessonBundle(rootFrom(homeOpt()), opts.set, opts.output);
      if (opts.json) out(JSON.stringify({ ok: true, output: opts.output, manifest }, null, 2));
      else out(`exported ${manifest.cardCount} cards to ${opts.output}`);
    });

  program.command('import-bundle')
    .description('import a shareable lesson bundle with fresh review state')
    .requiredOption('--file <path>', 'bundle .mergelearn.zip path')
    .option('--as-copy', 'allocate a new set and card ids if the set already exists')
    .option('--dry-run', 'validate without writing')
    .option('--json', 'emit machine-readable result')
    .action(async (opts: { file: string; asCopy?: boolean; dryRun?: boolean; json?: boolean }) => {
      const result = await importLessonBundle(rootFrom(homeOpt()), opts.file, { asCopy: opts.asCopy, dryRun: opts.dryRun });
      if (opts.json) out(JSON.stringify(result, null, 2));
      else out(`${opts.dryRun ? 'would import' : 'imported'} ${result.cards.length} cards as ${result.setId}${opts.dryRun ? ' (dry run: nothing written)' : ''}`);
    });

  program.command('backup')
    .description('create a private backup containing learning state and history')
    .requiredOption('--output <path>', 'output .mergelearn-backup.zip path')
    .option('--json', 'emit machine-readable result')
    .action(async (opts: { output: string; json?: boolean }) => {
      const manifest = await exportProfileBackup(rootFrom(homeOpt()), opts.output);
      if (opts.json) out(JSON.stringify({ ok: true, output: opts.output, manifest }, null, 2));
      else out(`private unencrypted backup written to ${opts.output} (${manifest.entryCount} files); store it securely`);
    });

  program.command('restore')
    .description('validate and restore a private profile backup')
    .requiredOption('--file <path>', 'backup .mergelearn-backup.zip path')
    .option('--force', 'replace a non-empty profile after validated staging')
    .option('--dry-run', 'validate without writing')
    .option('--json', 'emit machine-readable result')
    .action(async (opts: { file: string; force?: boolean; dryRun?: boolean; json?: boolean }) => {
      const manifest = await restoreProfileBackup(rootFrom(homeOpt()), opts.file, { force: opts.force, dryRun: opts.dryRun });
      if (opts.json) out(JSON.stringify({ ok: true, restored: !opts.dryRun, manifest }, null, 2));
      else out(opts.dryRun ? `backup valid (${manifest.entryCount} files; dry run: nothing written)` : `restored ${manifest.entryCount} files from private backup`);
    });

  program
    .command('settings')
    .description('show or update review settings')
    .option('--review-session-cap <n>', 'maximum distinct cards per review sitting; 0 means uncapped')
    .option('--queue-strategy <name>', 'interleaved (default) or overdue')
    .option('--json', 'emit machine-readable settings')
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
      if (opts.json) out(JSON.stringify(next, null, 2));
      else out(`reviewSessionCap=${next.reviewSessionCap}\nqueueStrategy=${next.queueStrategy}`);
    });

  program
    .command('cards')
    .description('list or search cards')
    .option('--set <id>', 'only this set')
    .option('--query <text>', 'search set title, prompt, and short answer', '')
    .option('--archived', 'include archived cards')
    .option('--json', 'emit machine-readable results')
    .action(async (opts: { set?: string; query: string; archived?: boolean; json?: boolean }) => {
      const hits = await searchCards(rootFrom(homeOpt()), opts.query, {
        setIds: opts.set ? [opts.set] : undefined, includeArchived: opts.archived,
      });
      if (opts.json) out(JSON.stringify(hits, null, 2));
      else for (const hit of hits) out(`${hit.status.padEnd(10)} ${hit.setId}/${hit.cardId}  ${hit.prompt}`);
    });

  for (const action of ['archive', 'unarchive'] as const) {
    program.command(action)
      .description(`${action} one card`)
      .requiredOption('--set <id>', 'set id')
      .requiredOption('--card <id>', 'card id')
      .action(async (opts: { set: string; card: string }) => {
        const card = action === 'archive'
          ? await archiveCard(rootFrom(homeOpt()), opts.set, opts.card)
          : await unarchiveCard(rootFrom(homeOpt()), opts.set, opts.card);
        out(`${action}d ${card.setId}/${card.id}`);
      });
  }

  program.command('edit')
    .description('edit teaching text on one card without resetting its schedule')
    .requiredOption('--set <id>', 'set id')
    .requiredOption('--card <id>', 'card id')
    .option('--prompt <text>', 'new prompt')
    .option('--short-answer <text>', 'new short answer')
    .option('--explanation <text>', 'new explanation markdown')
    .action(async (opts: { set: string; card: string; prompt?: string; shortAnswer?: string; explanation?: string }) => {
      const card = await editCard(rootFrom(homeOpt()), opts.set, opts.card, {
        ...(opts.prompt !== undefined ? { front: { prompt: opts.prompt } } : {}),
        ...(opts.shortAnswer !== undefined || opts.explanation !== undefined ? { back: {
          ...(opts.shortAnswer !== undefined ? { shortAnswer: opts.shortAnswer } : {}),
          ...(opts.explanation !== undefined ? { explanationMarkdown: opts.explanation } : {}),
        } } : {}),
      });
      out(`edited ${card.setId}/${card.id}`);
    });

  program.command('delete')
    .description('permanently delete one card or set (archive is safer)')
    .requiredOption('--set <id>', 'set id')
    .option('--card <id>', 'card id; omit to delete the set')
    .option('--yes', 'confirm permanent deletion')
    .option('--force', 'allow set deletion when review history exists')
    .action(async (opts: { set: string; card?: string; yes?: boolean; force?: boolean }) => {
      if (!opts.yes) { out('refusing permanent deletion without --yes; use archive for reversible removal'); process.exitCode = 1; return; }
      if (opts.card) { await deleteCard(rootFrom(homeOpt()), opts.set, opts.card); out(`deleted ${opts.set}/${opts.card}`); }
      else { await deleteSet(rootFrom(homeOpt()), opts.set, { force: opts.force }); out(`deleted set ${opts.set}`); }
    });

  program
    .command('due')
    .description('list cards due now')
    .option('--set <id>', 'only this set')
    .option('--tag <id>', 'only cards with this tag')
    .option('--folder <path>', 'only this folder subtree')
    .option('--limit <n>', 'override the configured review cap')
    .option('--strategy <name>', 'override: interleaved or overdue')
    .action(async (opts: { set?: string; tag?: string; folder?: string; limit?: string; strategy?: string }) => {
      const root = rootFrom(homeOpt());
      const filter = {
        setIds: opts.set ? [opts.set] : undefined,
        tagIds: opts.tag ? [opts.tag] : undefined,
        folderPaths: opts.folder ? [opts.folder] : undefined,
      };
      const prefs = await loadUserPreferences(root);
      const limit = opts.limit === undefined ? prefs.reviewSessionCap : Number(opts.limit);
      const strategy = (opts.strategy ?? prefs.queueStrategy) as QueueStrategy;
      if (!Number.isInteger(limit) || limit < 0 || !['overdue', 'interleaved'].includes(strategy)) {
        out('limit must be non-negative and strategy must be overdue or interleaved'); process.exitCode = 1; return;
      }
      const all = await getDueCards(root, new Date(), filter);
      const queueOptions = { strategy, seed: new Date().toISOString().slice(0, 10) };
      const prioritized = orderDueQueue(all, queueOptions);
      const due = orderDueQueue(selectDueCards(prioritized, limit), queueOptions);
      out(`${due.length} of ${all.length} card(s) due (${strategy})`);
      for (const c of due) out(`  ${c.setId}/${c.id}  ${c.front.prompt}`);
    });

  program
    .command('show')
    .description('print a card front + back (learn by reading)')
    .requiredOption('--set <id>', 'set id')
    .requiredOption('--card <id>', 'card id')
    .action(async (opts: { set: string; card: string }) => {
      const card = await loadCard(rootFrom(homeOpt()), opts.set, opts.card);
      if (!card) { out('card not found'); process.exitCode = 1; return; }
      out(`Q: ${card.front.prompt}`);
      if (card.front.contextMarkdown) out(`\n${card.front.contextMarkdown}`);
      out(`\nA: ${card.back.shortAnswer}`);
      out(`\n${card.back.explanationMarkdown}`);
      for (const ref of card.sourceRefs ?? []) {
        out(`\n[source ${ref.path}:${ref.startLine}-${ref.endLine} @ ${ref.commit.slice(0, 8)} (${ref.status})]`);
        if (ref.frozenText) out(ref.frozenText);
      }
    });

  program
    .command('grade')
    .description('grade one due card (1 Again, 2 Hard, 3 Good, 4 Easy)')
    .requiredOption('--card <id>', 'card id (must be due)')
    .requiredOption('--rating <1-4>', 'FSRS rating')
    .action(async (opts: { card: string; rating: string }) => {
      const root = rootFrom(homeOpt());
      const rating = Number(opts.rating) as ReviewRating;
      if (![1, 2, 3, 4].includes(rating)) { out('rating must be 1..4'); process.exitCode = 1; return; }
      const due = await getDueCards(root, new Date());
      const card = due.find((c) => c.id === opts.card);
      if (!card) { out('card not due (or not found)'); process.exitCode = 1; return; }
      const session = startSession('recommended');
      const updated = await gradeCard(root, session, card, rating);
      await endSession(root, session);
      out(`graded ${card.id} (${rating}); next due ${updated.fsrs.due}`);
    });

  program
    .command('serve')
    .description('open the local review GUI (Home + Practice) in your browser')
    .option('--port <n>', 'port (default: random free port)', (v) => Number(v))
    .action(async (opts: { port?: number }) => {
      const root = rootFrom(homeOpt());
      const { url } = await startReviewServer(root, opts.port ?? 0);
      out(`MergeLearn review GUI running at ${url}`);
      out('Open it in your browser. Press Ctrl+C to stop.');
      // The listening socket keeps the process alive; nothing else to do.
    });

  // Install the canonical authoring skill into coding agents' discovery dirs.
  program
    .command('setup-agent')
    .description('install the MergeLearn authoring skill into your coding agent(s)')
    .option('--agent <csv>', 'comma-separated agent ids or "all" (default: detected)')
    .option('--scope <scope>', 'global (default) or project', 'global')
    .option('--dry-run', 'show what would change, write nothing')
    .option('--uninstall', 'remove skills this tool installed (manifest-tracked only)')
    .action(async (opts: { agent?: string; scope?: string; dryRun?: boolean; uninstall?: boolean }) => {
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
        out(`uninstalled ${removed.length} skill copy(ies)${missing.length ? `, ${missing.length} already gone` : ''}`);
        for (const r of removed) out(`  removed ${r.agent}/${r.skill}: ${r.destPath}`);
        return;
      }

      if (opts.dryRun) {
        const plan = await planInstall(root, { agents, scope });
        out(`Plan (${scope} scope) — dry run, nothing written:`);
        for (const a of plan) out(`  ${a.status.padEnd(16)} ${a.agent}/${a.skill} -> ${a.destDir}`);
        return;
      }

      const { copied, skipped } = await applyInstall(root, { agents, scope });
      out(`Installed ${copied.length} skill copy(ies) into ${agents.length} agent dir(s):`);
      for (const a of copied) out(`  ${a.status.padEnd(10)} ${a.agent}/${a.skill} -> ${a.destDir} (${a.sourceChecksum.slice(0, 12)})`);
      for (const s of skipped) {
        const why = s.status === 'locally_modified' ? 'locally modified — left untouched' : 'already current';
        out(`  skipped    ${s.agent}/${s.skill}: ${why}`);
      }
      out('\nNext: open your coding agent in a repo and ask, e.g. "Create a MergeLearn lesson from my last PR."');
      out('Then run `mergelearn serve` to learn it in your browser. (The agent runs `context` and `import` for you.)');
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
