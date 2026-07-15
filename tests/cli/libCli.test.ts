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
    expect(importOut).toContain('imported set "cli-deck": 1 active');
    expect(importOut).toContain('+1 tags');

    // sets: the new set shows up with its card count
    const setsOut = await run(root, 'sets');
    expect(setsOut).toContain('cli-deck');
    expect(setsOut).toContain('[1 cards]');

    // due: the fresh card is due
    const dueOut = await run(root, 'due');
    expect(dueOut).toContain('1 card(s) due');
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
    expect(dueAfter).toContain('0 card(s) due');
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
