import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildProgram } from '../../src/libCli.js';
import { importAgentSet } from '../../src/core/library/importAgentSet.js';
import type { AgentSetPatch } from '../../src/core/library/types.js';

/** Capture stdout AND stderr separately: the truncation hint must stay off
 * stdout so `list cards --json | jq` keeps working. */
async function run(root: string, ...args: string[]): Promise<{ out: string; err: string }> {
  const outLines: string[] = [];
  const errLines: string[] = [];
  const log = console.log;
  const error = console.error;
  const previousExitCode = process.exitCode;
  process.exitCode = undefined;
  console.log = (...v: unknown[]) => { outLines.push(v.map(String).join(' ')); };
  console.error = (...v: unknown[]) => { errLines.push(v.map(String).join(' ')); };
  try {
    await buildProgram().parseAsync(['node', 'libCli.js', '--home', root, ...args]);
  } finally {
    console.log = log;
    console.error = error;
    process.exitCode = previousExitCode;
  }
  return { out: outLines.join('\n'), err: errLines.join('\n') };
}

const CARD_COUNT = 130; // deliberately past the 100-row human page

async function libraryWithManyCards(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'ml-listcards-'));
  const cards = Array.from({ length: CARD_COUNT }, (_, i) => ({
    localId: `c${i}`,
    tagRefs: [],
    front: { prompt: `Card ${i}: why does this behave this way?` },
    back: { shortAnswer: `Mechanism ${i}.`, explanationMarkdown: `Explanation ${i}.` },
  }));
  const patch = {
    version: 1,
    set: { id: 'many-cards', title: 'Many cards', tagIds: [] },
    tagPatch: { reuse: [], add: [] },
    order: cards.map((c) => c.localId),
    cards,
  } as unknown as AgentSetPatch;
  const res = await importAgentSet(root, patch);
  expect(res.ok).toBe(true);
  return root;
}

describe('list cards does not silently truncate the machine surface', () => {
  it('--json returns EVERY card, not the first 100', async () => {
    const root = await libraryWithManyCards();
    const { out } = await run(root, 'list', 'cards', '--json');
    const parsed = JSON.parse(out) as { cards: unknown[]; total: number };
    expect(parsed.cards).toHaveLength(CARD_COUNT);
    expect(parsed.total).toBe(CARD_COUNT);
  });

  it('--json reports total/returned/truncated so a page is never mistaken for the whole library', async () => {
    const root = await libraryWithManyCards();
    const { out } = await run(root, 'list', 'cards', '--json');
    expect(JSON.parse(out)).toMatchObject({
      total: CARD_COUNT, returned: CARD_COUNT, truncated: false,
    });
  });

  it('--limit pages the JSON and says it truncated', async () => {
    const root = await libraryWithManyCards();
    const { out } = await run(root, 'list', 'cards', '--json', '--limit', '25');
    const parsed = JSON.parse(out) as { cards: unknown[]; total: number; returned: number; truncated: boolean };
    expect(parsed.cards).toHaveLength(25);
    // The whole point of the envelope: a bare array of 25 could not be
    // distinguished from a library that only holds 25 cards.
    expect(parsed).toMatchObject({ total: CARD_COUNT, returned: 25, truncated: true });
  });

  it('--limit 0 means everything', async () => {
    const root = await libraryWithManyCards();
    const { out } = await run(root, 'list', 'cards', '--json', '--limit', '0');
    const parsed = JSON.parse(out) as { cards: unknown[]; truncated: boolean };
    expect(parsed.cards).toHaveLength(CARD_COUNT);
    expect(parsed.truncated).toBe(false);
  });

  it('human output pages at 100 and SAYS so on stderr', async () => {
    const root = await libraryWithManyCards();
    const { out, err } = await run(root, 'list', 'cards');
    expect(out.split('\n')).toHaveLength(100);
    expect(err).toContain(`showing 100 of ${CARD_COUNT}`);
    expect(err).toContain('--limit 0');
    // The hint must NOT pollute stdout.
    expect(out).not.toContain('showing 100 of');
  });

  it('says nothing about truncation when nothing was truncated', async () => {
    const root = await libraryWithManyCards();
    const { err } = await run(root, 'list', 'cards', '--limit', '0');
    expect(err).not.toContain('showing');
  });

  it('honours an explicit human --limit', async () => {
    const root = await libraryWithManyCards();
    const { out, err } = await run(root, 'list', 'cards', '--limit', '5');
    expect(out.split('\n')).toHaveLength(5);
    expect(err).toContain(`showing 5 of ${CARD_COUNT}`);
  });
});
