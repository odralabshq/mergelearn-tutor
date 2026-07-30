import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { buildProgram } from '../../src/libCli.js';
import { unlistedCommands } from '../../src/cliHelp.js';
import { importAgentSet } from '../../src/core/library/importAgentSet.js';
import { registerRepo } from '../../src/core/library/repoRegistry.js';
import type { AgentSetPatch } from '../../src/core/library/types.js';

const execFileAsync = promisify(execFile);

/** Run one fresh CLI instance and capture its stdout. Global flags may appear
 * before or after a subcommand, matching how users actually type commands. */
async function run(root: string, ...args: string[]): Promise<string> {
  const lines: string[] = [];
  const original = console.log;
  const previousExitCode = process.exitCode;
  process.exitCode = undefined;
  console.log = (...values: unknown[]) => { lines.push(values.map(String).join(' ')); };
  try {
    await buildProgram().parseAsync(['node', 'libCli.js', '--home', root, ...args]);
  } finally {
    console.log = original;
    process.exitCode = previousExitCode;
  }
  return lines.join('\n');
}

const patch: AgentSetPatch = {
  version: 1,
  set: { id: 'surface-deck', title: 'Surface Deck', folderPath: 'cli/surface', tagIds: [] },
  tagPatch: { reuse: [], add: [{ localId: 'cli', label: 'cli-design', kind: 'topic' }] },
  order: ['c1'],
  cards: [{
    localId: 'c1', tagRefs: ['cli'],
    front: { prompt: 'Why use one canonical card reference?' },
    back: { shortAnswer: 'The UI and CLI speak the same language.', explanationMarkdown: 'Use setId/cardId.' },
  }],
};

async function appliedLibrary(): Promise<{ root: string; cardId: string; patchFile: string }> {
  const root = await mkdtemp(join(tmpdir(), 'mlt-surface-'));
  const patchFile = join(root, 'patch.json');
  await writeFile(patchFile, JSON.stringify(patch), 'utf8');
  await run(root, 'apply', '--file', patchFile);
  const cards = JSON.parse(await run(root, 'list', 'cards', '--json')) as { cardId: string }[];
  return { root, cardId: cards[0]!.cardId, patchFile };
}

describe('refined CLI command surface', () => {
  it('renders task-first grouped help and hides internal/deprecated commands by default', () => {
    const program = buildProgram();
    const help = program.helpInformation();
    expect(help).toContain('Start here');
    expect(help).toContain('Learn\n');
    expect(help).toContain('Library\n');
    expect(help).toContain('Skills\n');
    expect(help).toContain('Agent\n');
    expect(help).toContain('Share\n');
    expect(help).toContain('Setup\n');
    expect(help.indexOf('Start here')).toBeLessThan(help.indexOf('Global options'));
    expect(help).toContain('show <set/card>');
    expect(help).toContain('apply --file <patch>');
    expect(help).not.toContain('dogfood-summary');
    expect(help).not.toContain('create-and-open');
    expect(unlistedCommands(new Set(program.commands.map((command) => command.name())))).toEqual([]);
  });

  it('help --all reveals trial, internal, and deprecated spellings', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mlt-help-all-'));
    const help = await run(root, 'help', '--all');
    expect(help).toContain('Internal and trial');
    expect(help).toContain('dogfood-summary');
    expect(help).toContain('server-run');
    expect(help).toContain('Deprecated spellings');
    expect(help).toContain('create-and-open');
    expect(help).toContain('import-bundle');
  });

  it('uses apply/list as canonical names and accepts global --json after the subcommand', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mlt-canonical-'));
    const patchFile = join(root, 'patch.json');
    await writeFile(patchFile, JSON.stringify(patch), 'utf8');

    expect(await run(root, 'apply', '--file', patchFile)).toContain('applied set "surface-deck"');
    const sets = JSON.parse(await run(root, 'list', 'sets', '--json')) as { id: string }[];
    expect(sets.map((set) => set.id)).toEqual(['surface-deck']);
    const cards = JSON.parse(await run(root, 'list', 'cards', '--json')) as { setId: string }[];
    expect(cards).toHaveLength(1);
    expect(cards[0]!.setId).toBe('surface-deck');
  });

  it('accepts positional set/card refs across show, edit, archive, unarchive, and delete', async () => {
    const { root, cardId } = await appliedLibrary();
    const ref = `surface-deck/${cardId}`;

    expect(await run(root, 'show', ref)).toContain('Q: Why use one canonical card reference?');
    const shown = JSON.parse(await run(root, 'show', ref, '--json')) as { id: string };
    expect(shown.id).toBe(cardId);

    expect(await run(root, 'edit', ref, '--prompt', 'Updated positional prompt')).toContain(`edited ${ref}`);
    expect(await run(root, 'show', ref)).toContain('Updated positional prompt');

    expect(await run(root, 'archive', ref)).toContain(`archived ${ref}`);
    expect(JSON.parse(await run(root, 'list', 'cards', '--json'))).toEqual([]);
    expect(await run(root, 'unarchive', ref)).toContain(`unarchived ${ref}`);

    expect(await run(root, 'delete', ref)).toContain('refusing permanent deletion');
    expect(JSON.parse(await run(root, 'list', 'cards', '--json'))).toHaveLength(1);
    // Global --yes is accepted after the subcommand, not only before it.
    expect(await run(root, 'delete', ref, '--yes')).toContain(`deleted ${ref}`);
    expect(JSON.parse(await run(root, 'list', 'cards', '--archived', '--json'))).toEqual([]);
  });

  it('grades the canonical positional ref and emits qualified JSON', async () => {
    const { root, cardId } = await appliedLibrary();
    const ref = `surface-deck/${cardId}`;
    const result = JSON.parse(await run(root, 'grade', ref, '3', '--json')) as {
      card: string; rating: number; due: string;
    };
    expect(result.card).toBe(ref);
    expect(result.rating).toBe(3);
    expect(result.due).toMatch(/^\d{4}-/);
  });

  it('reports status and mastery as human or global JSON output', async () => {
    const { root } = await appliedLibrary();
    const status = JSON.parse(await run(root, 'status', '--json')) as {
      version: string; library: string; running: boolean;
    };
    expect(status).toMatchObject({ version: '0.1.1', library: root, running: false });

    const mastery = JSON.parse(await run(root, 'mastery', '--json')) as {
      tags: { label: string; cardCount: number; mastery: number }[];
      folders: { path: string; cardCount: number; mastery: number }[];
    };
    expect(mastery.tags).toEqual([
      expect.objectContaining({ label: 'cli-design', cardCount: 1, mastery: 0 }),
    ]);
    expect(mastery.folders).toEqual([
      expect.objectContaining({ path: 'cli/surface', cardCount: 1, mastery: 0 }),
    ]);
  });

  it('checks source drift and makes prune a dry run until --yes is supplied', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mlt-cli-drift-'));
    const repo = await mkdtemp(join(tmpdir(), 'mlt-cli-drift-repo-'));
    await mkdir(join(repo, 'src'), { recursive: true });
    await writeFile(join(repo, 'src', 'answer.ts'), 'export const answer = 42;\n', 'utf8');
    await execFileAsync('git', ['init', '-q'], { cwd: repo });
    await execFileAsync('git', ['config', 'user.email', 't@t.t'], { cwd: repo });
    await execFileAsync('git', ['config', 'user.name', 't'], { cwd: repo });
    await execFileAsync('git', ['add', '.'], { cwd: repo });
    await execFileAsync('git', ['commit', '-qm', 'init'], { cwd: repo });
    const repoId = (await registerRepo(root, repo)).id;
    const grounded: AgentSetPatch = {
      version: 1,
      set: { id: 'grounded', title: 'Grounded', tagIds: [] },
      tagPatch: { reuse: [], add: [] },
      order: ['c1'],
      cards: [{
        localId: 'c1', tagRefs: [],
        front: { prompt: 'What is the answer?' },
        back: { shortAnswer: '42', explanationMarkdown: 'The source says so.' },
        sourceRefs: [{ repoId, path: 'src/answer.ts', startLine: 1, endLine: 1 }],
      }],
    };
    const imported = await importAgentSet(root, grounded);
    expect(imported.ok).toBe(true);
    await writeFile(join(repo, 'src', 'answer.ts'), 'export const answer = 43;\n', 'utf8');

    const check = JSON.parse(await run(root, 'check', '--json')) as { stale: { cardId: string }[] };
    expect(check.stale).toHaveLength(1);
    const ref = `grounded/${check.stale[0]!.cardId}`;

    const preview = JSON.parse(await run(root, 'prune', '--json')) as {
      dryRun: boolean; archived: string[];
    };
    expect(preview).toEqual(expect.objectContaining({ dryRun: true, archived: [] }));
    expect(JSON.parse(await run(root, 'list', 'cards', '--json'))).toHaveLength(1);

    const pruned = JSON.parse(await run(root, 'prune', '--yes', '--json')) as {
      dryRun: boolean; archived: string[];
    };
    expect(pruned).toEqual(expect.objectContaining({ dryRun: false, archived: [ref] }));
    expect(JSON.parse(await run(root, 'list', 'cards', '--json'))).toEqual([]);
  });

  it('keeps export/import symmetric under the canonical names', async () => {
    const source = await appliedLibrary();
    const bundle = join(source.root, 'surface.mergelearn.zip');
    await run(source.root, 'export', '--set', 'surface-deck', '--output', bundle);

    const target = await mkdtemp(join(tmpdir(), 'mlt-canonical-import-'));
    expect(await run(target, 'import', '--file', bundle)).toContain('imported 1 cards as surface-deck');
    expect(await run(target, 'list', 'sets')).toContain('surface-deck');
  });
});
