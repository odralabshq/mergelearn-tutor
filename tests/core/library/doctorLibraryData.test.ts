import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runDoctor } from '../../../src/core/library/doctor.js';
import { importAgentSet } from '../../../src/core/library/importAgentSet.js';
import { libraryPaths } from '../../../src/core/library/libraryStore.js';
import type { AgentSetPatch } from '../../../src/core/library/types.js';

const freshRoot = () => mkdtemp(join(tmpdir(), 'ml-doctor-data-'));

const lesson = (): AgentSetPatch => ({
  version: 1,
  set: { id: 'doctor-fixture', title: 'Doctor fixture', tagIds: [], objective: 'Data integrity' },
  tagPatch: { reuse: [], add: [] },
  order: ['c1'],
  cards: [{
    localId: 'c1', tagRefs: [],
    front: { prompt: 'Does doctor notice damaged data?' },
    back: { shortAnswer: 'It should.', explanationMarkdown: 'Otherwise recovery is guesswork.' },
  }],
} as AgentSetPatch);

const dataCheck = (checks: { id: string }[]) => checks.find((c) => c.id === 'library-data');

describe('doctor library-data integrity check', () => {
  it('passes on a healthy library', async () => {
    const root = await freshRoot();
    await importAgentSet(root, lesson());
    const res = await runDoctor(root);
    const check = dataCheck(res.checks) as { status: string; message: string } | undefined;
    expect(check?.status).toBe('PASS');
    expect(check?.message).toContain('parse');
  });

  it('passes on an empty library (absent files are not damage)', async () => {
    const res = await runDoctor(await freshRoot());
    expect((dataCheck(res.checks) as { status: string }).status).toBe('PASS');
  });

  it('FAILS and names the exact corrupt card file', async () => {
    const root = await freshRoot();
    const imported = await importAgentSet(root, lesson());
    const cardFile = libraryPaths(root).cardFile('doctor-fixture', imported.cards[0].cardId);
    await writeFile(cardFile, '{broken', 'utf8');

    const res = await runDoctor(root);
    const check = dataCheck(res.checks) as { status: string; message: string };
    expect(check.status).toBe('FAIL');
    expect(check.message).toContain(cardFile);
    // A FAIL must sink the overall verdict; reporting ok on unreadable data is
    // the contradiction this check exists to remove.
    expect(res.ok).toBe(false);
  });

  it('reports every damaged file, not just the first', async () => {
    const root = await freshRoot();
    const imported = await importAgentSet(root, lesson());
    const p = libraryPaths(root);
    await writeFile(p.cardFile('doctor-fixture', imported.cards[0].cardId), '{broken', 'utf8');
    await writeFile(p.setFile('doctor-fixture'), 'not json either', 'utf8');
    await writeFile(p.tags, '[[[', 'utf8');

    const res = await runDoctor(root);
    const check = dataCheck(res.checks) as { status: string; message: string };
    expect(check.status).toBe('FAIL');
    expect(check.message).toContain('3 unreadable file(s)');
  });
});
