import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildProgram } from '../../src/libCli.js';
import { importAgentSet } from '../../src/core/library/importAgentSet.js';
import { libraryPaths } from '../../src/core/library/libraryStore.js';
import { readJson, writeJson } from '../../src/core/library/io.js';
import type { AgentSetPatch, Card } from '../../src/core/library/types.js';

/** Run one CLI invocation, capturing stdout and the exit code. Nothing in this
 * suite may set a non-zero exit code: a shell prompt hook that pollutes $?
 * would be worse than no reminder at all. */
async function run(root: string, ...args: string[]): Promise<{ out: string; code: number | undefined }> {
  const lines: string[] = [];
  const log = console.log;
  const previous = process.exitCode;
  process.exitCode = undefined;
  console.log = (...v: unknown[]) => { lines.push(v.map(String).join(' ')); };
  let code: number | undefined;
  try {
    await buildProgram().parseAsync(['node', 'libCli.js', '--home', root, ...args]);
    code = process.exitCode;
  } finally {
    console.log = log;
    process.exitCode = previous;
  }
  return { out: lines.join('\n'), code };
}

function lesson(id: string, title: string): AgentSetPatch {
  return {
    version: 1,
    set: { id, title, tagIds: [] },
    tagPatch: { reuse: [], add: [] },
    order: ['c1'],
    cards: [{
      localId: 'c1', tagRefs: [],
      front: { prompt: `Why does ${title} behave this way?` },
      back: { shortAnswer: 'A mechanism.', explanationMarkdown: 'The cause is X.' },
    }],
  } as AgentSetPatch;
}

const emptyRoot = () => mkdtemp(join(tmpdir(), 'ml-due-empty-'));

async function rootWithDueCard(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'ml-due-'));
  const res = await importAgentSet(root, lesson('due-fixture', 'Due fixture'));
  expect(res.ok).toBe(true);
  return root;
}

/** Push a card's due date into the future so it is NOT due now. */
async function scheduleFarFuture(root: string, setId: string, cardId: string): Promise<void> {
  const p = libraryPaths(root).cardFile(setId, cardId);
  const card = (await readJson<Card>(p))!;
  await writeJson(p, { ...card, fsrs: { ...card.fsrs, due: '2099-01-01T00:00:00.000Z' } });
}

describe('status answers "is there anything to do?"', () => {
  it('reports the due count in --json', async () => {
    const root = await rootWithDueCard();
    const { out } = await run(root, 'status', '--json');
    expect((JSON.parse(out) as { due: number }).due).toBe(1);
  });

  it('names the next action in human output when cards are due', async () => {
    const root = await rootWithDueCard();
    const { out } = await run(root, 'status');
    expect(out).toContain('Due: 1 card(s) for review');
    expect(out).toContain('mergelearn serve');
  });

  it('says so plainly when nothing is due', async () => {
    const root = await emptyRoot();
    const { out } = await run(root, 'status');
    expect(out).toContain('Due: nothing right now');
    expect((JSON.parse((await run(root, 'status', '--json')).out) as { due: number }).due).toBe(0);
  });

  it('does not count a card scheduled for the future', async () => {
    const root = await rootWithDueCard();
    const cards = (JSON.parse((await run(root, 'list', 'cards', '--json')).out) as { cards: { cardId: string }[] }).cards;
    await scheduleFarFuture(root, 'due-fixture', cards[0].cardId);
    expect((JSON.parse((await run(root, 'status', '--json')).out) as { due: number }).due).toBe(0);
  });
});

describe('due --if-any is safe to put in a shell prompt hook', () => {
  it('prints NOTHING when nothing is due', async () => {
    const root = await emptyRoot();
    const { out, code } = await run(root, 'due', '--if-any');
    expect(out).toBe('');
    // A precmd hook must never leave a non-zero $? behind.
    expect(code ?? 0).toBe(0);
  });

  it('prints one actionable line when something is due', async () => {
    const root = await rootWithDueCard();
    const { out, code } = await run(root, 'due', '--if-any', '--quiet');
    expect(out).toBe('1 card(s) due for review — run `mergelearn serve`');
    expect(code ?? 0).toBe(0);
  });

  it('--quiet omits the per-card list', async () => {
    const root = await rootWithDueCard();
    const { out } = await run(root, 'due', '--quiet');
    expect(out.split('\n')).toHaveLength(1);
    expect(out).not.toContain('Why does');
  });

  it('without --quiet it still lists each card', async () => {
    const root = await rootWithDueCard();
    const { out } = await run(root, 'due');
    expect(out).toContain('Why does Due fixture behave this way?');
  });

  it('works the same way through `list due`', async () => {
    const root = await emptyRoot();
    expect((await run(root, 'list', 'due', '--if-any')).out).toBe('');
  });
});

describe('apply surfaces an existing backlog', () => {
  it('reports cards due in OTHER lessons, excluding the one just applied', async () => {
    const root = await rootWithDueCard();          // lesson A: 1 card, due now
    const file = join(root, 'patch-b.json');
    await writeFile(file, JSON.stringify(lesson('second-lesson', 'Second lesson')), 'utf8');

    const { out } = await run(root, 'apply', '--file', file);

    // The lesson just applied is due by definition; echoing it back is noise.
    expect(out).toContain('1 card(s) from other lessons also due for review.');
  });

  it('says nothing about a backlog when there is none', async () => {
    const root = await emptyRoot();
    const file = join(root, 'patch-only.json');
    await writeFile(file, JSON.stringify(lesson('only-lesson', 'Only lesson')), 'utf8');

    const { out } = await run(root, 'apply', '--file', file);
    expect(out).not.toContain('also due for review');
  });

  it('stays silent about the backlog on a dry run', async () => {
    const root = await rootWithDueCard();
    const file = join(root, 'patch-dry.json');
    await writeFile(file, JSON.stringify(lesson('dry-lesson', 'Dry lesson')), 'utf8');

    const { out } = await run(root, 'apply', '--file', file, '--dry-run');
    expect(out).toContain('dry run');
    expect(out).not.toContain('also due for review');
  });
});
