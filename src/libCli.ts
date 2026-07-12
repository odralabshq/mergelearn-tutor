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
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Command } from 'commander';

import { resolveLibraryRoot } from './core/library/libraryStore.js';
import { buildAuthoringContext } from './core/library/authoringContext.js';
import { registerRepo } from './core/library/repoRegistry.js';
import { importAgentSet } from './core/library/importAgentSet.js';
import { listSetSummaries } from './core/library/setStore.js';
import { loadCard } from './core/library/cardStore.js';
import { getDueCards } from './core/library/review/dueQueue.js';
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

export function buildProgram(): Command {
  const program = new Command();
  program
    .name('mergelearn')
    .description('Model-free, agent-authored learning library (v2)')
    .option('--home <path>', 'library root (default: MERGELEARN_HOME or ~/.mergelearn)');

  const homeOpt = () => program.opts<{ home?: string }>();

  // handshake step 1: tutor -> agent
  program
    .command('context')
    .description('emit the AuthoringContext JSON the agent authors against')
    .requiredOption('--goal <text>', 'what the agent should author')
    .option('--repo <path>', 'register + attach a repo for grounded cards')
    .option('--target-set <id>', 'author into an existing set')
    .action(async (opts: { goal: string; repo?: string; targetSet?: string }) => {
      const root = rootFrom(homeOpt());
      const repo = opts.repo ? await registerRepo(root, opts.repo) : undefined;
      const ctx = await buildAuthoringContext(root, { goal: opts.goal, repo, targetSetId: opts.targetSet });
      out(JSON.stringify(ctx, null, 2));
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

  // handshake step 2: agent -> tutor
  program
    .command('import')
    .description('apply an AgentSetPatch JSON file (the only card-creation path)')
    .requiredOption('--file <path>', 'path to the AgentSetPatch JSON')
    .option('--agent <name>', 'authoring agent name (provenance)')
    .option('--dry-run', 'validate and preview the outcome, write nothing')
    .action(async (opts: { file: string; agent?: string; dryRun?: boolean }) => {
      const patch = JSON.parse(await readFile(opts.file, 'utf8')) as AgentSetPatch;
      const res = await importAgentSet(rootFrom(homeOpt()), patch, { agentName: opts.agent, dryRun: opts.dryRun });
      if (!res.ok) {
        const lead = opts.dryRun ? 'preview: import WOULD BE REJECTED' : 'import REJECTED';
        out(`${lead} (${res.errors.length} error(s)) — nothing written:`);
        for (const e of res.errors) out(`  - ${e.code}: ${e.message}`);
        process.exitCode = 1;
        return;
      }
      const active = res.cards.filter((c) => c.status === 'active').length;
      const flagged = res.cards.length - active;
      const verb = opts.dryRun ? 'would import' : 'imported';
      out(`${verb} set "${res.setId}": ${active} active${flagged ? `, ${flagged} needs_review` : ''}, +${res.tagIdsAdded.length} tags`);
      for (const c of res.cards.filter((c) => c.status !== 'active')) {
        out(`  needs_review ${c.cardId}: ${c.reasons.join(', ')}`);
      }
      if (opts.dryRun) out('(dry run: nothing written — omit --dry-run to apply)');
    });

  program
    .command('due')
    .description('list cards due now')
    .option('--set <id>', 'only this set')
    .option('--tag <id>', 'only cards with this tag')
    .option('--folder <path>', 'only this folder subtree')
    .action(async (opts: { set?: string; tag?: string; folder?: string }) => {
      const filter = {
        setIds: opts.set ? [opts.set] : undefined,
        tagIds: opts.tag ? [opts.tag] : undefined,
        folderPaths: opts.folder ? [opts.folder] : undefined,
      };
      const due = await getDueCards(rootFrom(homeOpt()), new Date(), filter);
      out(`${due.length} card(s) due`);
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
      out('\nTest it: ask your agent "author a MergeLearn lesson about <topic>" — it should run `mergelearn context` and return an AgentSetPatch.');
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
