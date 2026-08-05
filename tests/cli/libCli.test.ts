import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildProgram } from '../../src/libCli.js';
import type { AgentSetPatch } from '../../src/core/library/types.js';

/** Run the CLI with argv, capturing everything written to console.log. */
async function run(root: string, ...args: string[]): Promise<string> {
  const lines: string[] = [];
  const orig = console.log;
  console.log = (...a: unknown[]) => { lines.push(a.map(String).join(' ')); };
  try {
    await buildProgram().parseAsync(['node', 'libCli.js', '--home', root, ...args]);
  } finally {
    console.log = orig;
  }
  return lines.join('\n');
}

const patch: AgentSetPatch = {
  version: 1,
  set: { title: 'CLI Deck', folderPath: 'cli/deck', tagIds: [] },
  tagPatch: { reuse: [], add: [{ localId: 'topic', label: 'cli-topic', kind: 'topic' }] },
  order: ['c1'],
  cards: [{
    localId: 'c1', tagRefs: ['topic'],
    front: { prompt: 'What does the CLI import do?' },
    back: { shortAnswer: 'Applies an AgentSetPatch.', explanationMarkdown: 'It validates then writes the set.' },
  }],
};

describe('library CLI (functional, end-to-end)', () => {
  it('reports the package version', () => {
    expect(buildProgram().version()).toBe('1.2.0');
  });

  it('serve opens human output once, reports opener failure, and keeps JSON launch-free', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mlt-cli-serve-'));
    const opened: string[] = [];
    const errors: string[] = [];
    const logs: string[] = [];
    const originalError = console.error;
    const originalLog = console.log;
    console.error = (...args: unknown[]) => { errors.push(args.map(String).join(' ')); };
    console.log = (...args: unknown[]) => { logs.push(args.map(String).join(' ')); };
    const ensureLocalServer = async () => ({
      url: 'http://127.0.0.1:43210', pid: 123, port: 43210,
      startedAt: '2026-08-05T00:00:00.000Z', managed: true as const, reused: true,
    });
    try {
      const human = buildProgram({ ensureLocalServer, openUrl: (url) => { opened.push(url); return false; } });
      await human.parseAsync(['node', 'libCli.js', '--home', root, 'serve']);
      expect(opened).toEqual(['http://127.0.0.1:43210']);
      expect(logs.join('\n')).toContain('(reused)');
      expect(errors.join('\n')).toContain('Open http://127.0.0.1:43210 manually');

      logs.length = 0;
      const jsonOpened: string[] = [];
      const json = buildProgram({ ensureLocalServer, openUrl: (url) => { jsonOpened.push(url); return true; } });
      await json.parseAsync(['node', 'libCli.js', '--home', root, '--json', 'serve']);
      expect(JSON.parse(logs.join('\n'))).toMatchObject({ ok: true, url: 'http://127.0.0.1:43210' });
      expect(jsonOpened).toEqual([]);
    } finally {
      console.error = originalError;
      console.log = originalLog;
    }
  });

  it('drives context -> import -> sets -> due -> show -> grade against a real library', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mlt-cli-'));

    // context: empty library -> empty sets/tags, but valid JSON with the goal
    const ctxOut = await run(root, 'context', '--goal', 'author a CLI deck');
    const ctx = JSON.parse(ctxOut);
    expect(ctx.goal).toBe('author a CLI deck');
    expect(ctx.existingSets).toEqual([]);
    expect(ctx.existingTags).toEqual([]);

    // import: write the patch, apply it
    const patchFile = join(root, 'patch.json');
    await writeFile(patchFile, JSON.stringify(patch), 'utf8');
    const importOut = await run(root, 'import', '--file', patchFile, '--agent', 'tester');
    // The create-vs-merge disclosure is deliberate: "imported set X" alone reads
    // identically whether X is new or already held a lesson.
    expect(importOut).toContain('imported set "cli-deck" (new lesson): 1 active');
    expect(importOut).toContain('+1 tags');

    // context: recent lessons expose enough grounded metadata to deepen instead of repeat.
    const afterImport = JSON.parse(await run(root, 'context', '--recent', '1'));
    expect(afterImport.recentLessons).toMatchObject([{ setId: 'cli-deck', title: 'CLI Deck' }]);
    expect(afterImport.recentLessons[0].questionSummaries).toEqual(['What does the CLI import do?']);

    // sets: the new set shows up with its card count
    const setsOut = await run(root, 'sets');
    expect(setsOut).toContain('cli-deck');
    expect(setsOut).toContain('[1 cards]');

    // due: the fresh card is due
    const dueOut = await run(root, 'due');
    expect(dueOut).toContain('1 of 1 card(s) due');
    const cardId = dueOut.split('cli-deck/')[1].split(/\s/)[0];

    // show: front + back render (learn by reading)
    const showOut = await run(root, 'show', '--set', 'cli-deck', '--card', cardId);
    expect(showOut).toContain('Q: What does the CLI import do?');
    expect(showOut).toContain('A: Applies an AgentSetPatch.');
    expect(showOut).toContain('It validates then writes the set.');

    // grade: Good pushes the card out of the due queue
    const gradeOut = await run(root, 'grade', '--card', cardId, '--rating', '3');
    expect(gradeOut).toContain(`graded ${cardId} (3)`);
    const dueAfter = await run(root, 'due');
    expect(dueAfter).toContain('0 of 0 card(s) due');
  });

  it('context works without --goal (optional) and omits the goal field', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mlt-cli-'));
    const ctxOut = await run(root, 'context');
    const ctx = JSON.parse(ctxOut); // must still be valid JSON on stdout
    expect(ctx.goal).toBeUndefined();
    expect(ctx.existingSets).toEqual([]);
    expect(ctx.existingTags).toEqual([]);
    expect(Array.isArray(ctx.folderTree)).toBe(true);
  });

  it('rejects a bad patch at the CLI boundary and writes nothing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mlt-cli-'));
    const bad: AgentSetPatch = { ...patch, order: [] }; // order misses the card
    const badFile = join(root, 'bad.json');
    await writeFile(badFile, JSON.stringify(bad), 'utf8');
    const out = await run(root, 'import', '--file', badFile);
    expect(out).toContain('import REJECTED');
    expect(out).toContain('order_missing');
    const setsOut = await run(root, 'sets');
    expect(setsOut).toContain('no sets yet');
  });

  it('setup-agent --dry-run plans a copy for the named agent and writes nothing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mlt-cli-'));
    // Explicit --agent avoids machine-dependent detection; --dry-run is read-only.
    const out = await run(root, 'setup-agent', '--agent', 'claude', '--scope', 'project', '--dry-run');
    expect(out).toContain('dry run');
    expect(out).toContain('claude/mergelearn-authoring');
    expect(out).toMatch(/installed|current|updated|locally_modified/);
    // Dry run must not write a manifest into the library root.
    const { readdir } = await import('node:fs/promises');
    const entries = await readdir(root);
    expect(entries).not.toContain('agent-skills.json');
  });

  it('sample previews without writing, installs once, and is idempotent', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mlt-cli-sample-'));
    const preview = await run(root, 'sample', '--dry-run');
    expect(preview).toContain('would install sample lesson');
    expect(await run(root, 'sets')).toContain('no sets yet');

    const installed = await run(root, 'sample');
    expect(installed).toContain('Installed sample lesson');
    expect(installed).toContain('4 activities');
    expect(installed).toContain('mergelearn serve');
    expect(await run(root, 'sets')).toContain('mergelearn-sample');

    const again = await run(root, 'sample');
    expect(again).toContain('already installed');
  });

  it('doctor --json emits machine-readable setup checks', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mlt-cli-doctor-'));
    const result = JSON.parse(await run(root, 'doctor', '--json'));
    expect(Array.isArray(result.checks)).toBe(true);
    expect(result.checks.some((c: { id: string }) => c.id === 'skill-source')).toBe(true);
    expect(result.checks.some((c: { id: string }) => c.id === 'lessons')).toBe(true);
  });

  it('settings persists the review cap and queue strategy', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mlt-cli-settings-'));
    await run(root, 'settings', '--review-session-cap', '12', '--queue-strategy', 'overdue');
    const saved = JSON.parse(await run(root, 'settings', '--json'));
    expect(saved).toEqual({ reviewSessionCap: 12, queueStrategy: 'overdue' });
  });

  it('lists, archives, and restores a card', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mlt-cli-curation-'));
    const patchFile = join(root, 'patch.json');
    await writeFile(patchFile, JSON.stringify(patch), 'utf8');
    await run(root, 'import', '--file', patchFile);
    // The deprecated `cards` alias runs the canonical handler, so it returns the
    // same {cards,total,returned,truncated} envelope. One JSON contract for one
    // piece of data; an alias that answered in a different shape would be worse
    // than the changed shape.
    const cardsOf = async (...args: string[]): Promise<{ cardId: string; status: string; prompt: string }[]> =>
      JSON.parse(await run(root, 'cards', ...args, '--json')).cards;

    const cardId = (await cardsOf('--set', 'cli-deck'))[0]!.cardId;
    await run(root, 'archive', '--set', 'cli-deck', '--card', cardId);
    expect(await cardsOf('--set', 'cli-deck')).toEqual([]);
    expect((await cardsOf('--set', 'cli-deck', '--archived'))[0]!.status).toBe('archived');
    await run(root, 'unarchive', '--set', 'cli-deck', '--card', cardId);
    expect((await cardsOf('--set', 'cli-deck'))[0]!.status).toBe('active');
    expect(await run(root, 'delete', '--set', 'cli-deck', '--card', cardId)).toContain('refusing permanent deletion');
    expect(await cardsOf('--set', 'cli-deck')).toHaveLength(1);
    await run(root, 'edit', '--set', 'cli-deck', '--card', cardId, '--prompt', 'Fixed CLI prompt');
    expect((await cardsOf('--query', 'fixed cli'))[0]!.prompt).toBe('Fixed CLI prompt');
    await run(root, 'delete', '--set', 'cli-deck', '--card', cardId, '--yes');
    expect(await cardsOf('--set', 'cli-deck', '--archived')).toEqual([]);
  });

  it('exports and imports a portable lesson bundle', async () => {
    const source = await mkdtemp(join(tmpdir(), 'mlt-cli-bundle-source-'));
    const patchFile = join(source, 'patch.json');
    const bundle = join(source, 'cli-deck.mergelearn.zip');
    await writeFile(patchFile, JSON.stringify(patch), 'utf8');
    await run(source, 'import', '--file', patchFile);
    expect(await run(source, 'export', '--set', 'cli-deck', '--output', bundle)).toContain('exported 1 cards');

    const target = await mkdtemp(join(tmpdir(), 'mlt-cli-bundle-target-'));
    expect(await run(target, 'import-bundle', '--file', bundle, '--dry-run')).toContain('dry run: nothing written');
    expect(await run(target, 'sets')).not.toContain('cli-deck');
    expect(await run(target, 'import-bundle', '--file', bundle)).toContain('imported 1 cards as cli-deck');
    expect(await run(target, 'sets')).toContain('cli-deck');
  });

  it('backs up and restores the private profile', async () => {
    const source = await mkdtemp(join(tmpdir(), 'mlt-cli-backup-source-'));
    const patchFile = join(source, 'patch.json');
    const backup = join(await mkdtemp(join(tmpdir(), 'mlt-cli-backup-output-')), 'profile.mergelearn-backup.zip');
    await writeFile(patchFile, JSON.stringify(patch), 'utf8');
    await run(source, 'import', '--file', patchFile);
    expect(await run(source, 'backup', '--output', backup)).toContain('private unencrypted backup');

    const target = await mkdtemp(join(tmpdir(), 'mlt-cli-restore-target-'));
    expect(await run(target, 'restore', '--file', backup, '--dry-run')).toContain('dry run: nothing written');
    expect(await run(target, 'sets')).not.toContain('cli-deck');
    expect(await run(target, 'restore', '--file', backup)).toContain('restored');
    expect(await run(target, 'sets')).toContain('cli-deck');
  });

  it('import --dry-run --json includes a lesson summary and writes nothing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mlt-cli-summary-'));
    const patchFile = join(root, 'patch.json');
    await writeFile(patchFile, JSON.stringify(patch), 'utf8');
    const result = JSON.parse(await run(root, 'import', '--file', patchFile, '--dry-run', '--json'));
    expect(result.ok).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.summary.cardCount).toBe(1);
    expect(result.summary.interactionCounts).toEqual({ flashcard: 1 });
    expect(await run(root, 'sets')).toContain('no sets yet');
  });
});
