import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createAndOpen } from '../src/createAndOpen.js';
import { loadSet } from '../src/core/library/setStore.js';
import type { AgentSetPatch } from '../src/core/library/types.js';

const validPatch: AgentSetPatch = {
  version: 1,
  set: { title: 'Workflow Deck', tagIds: [] },
  tagPatch: { reuse: [], add: [] },
  order: ['card-1'],
  cards: [{
    localId: 'card-1', tagRefs: [],
    front: { prompt: 'What does create-and-open combine?' },
    back: { shortAnswer: 'Import, serve, and open.', explanationMarkdown: 'It removes manual navigation.' },
  }],
};

async function root(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'mlt-create-open-'));
}

describe('createAndOpen', () => {
  it('imports, ensures a server, and requests the exact deep-link URL', async () => {
    const library = await root();
    const opened: string[] = [];
    const result = await createAndOpen(library, validPatch, {
      ensure: async () => ({ url: 'http://127.0.0.1:4321', reused: false }),
      openUrl: (url) => { opened.push(url); return true; },
    });

    expect(result).toMatchObject({ ok: true, imported: true, setId: 'workflow-deck', reused: false, openRequested: true });
    expect(result.url).toBe('http://127.0.0.1:4321/set/workflow-deck?source=apply-open');
    expect(opened).toEqual([result.url]);
  });

  it('does not invoke a server or opener for a rejected patch', async () => {
    const library = await root();
    const badPatch = { ...validPatch, order: [] };
    const result = await createAndOpen(library, badPatch, {
      ensure: async () => { throw new Error('must not run'); },
      openUrl: () => { throw new Error('must not run'); },
    });

    expect(result).toMatchObject({ ok: false, imported: false, url: null, openRequested: false });
    expect(result.errors.map((error) => error.code)).toContain('order_missing');
  });

  it('stores the lesson but reports partial success when server startup fails', async () => {
    const library = await root();
    const result = await createAndOpen(library, validPatch, {
      ensure: async () => { throw new Error('server unavailable'); },
    });

    expect(result).toMatchObject({ ok: false, imported: true, setId: 'workflow-deck', url: null });
    expect(result.errors).toEqual([{ code: 'server:start', message: 'server unavailable' }]);
    expect((await loadSet(library, 'workflow-deck'))?.title).toBe('Workflow Deck');
  });

  it('keeps a usable URL but does not call an opener with noOpen', async () => {
    const library = await root();
    const result = await createAndOpen(library, validPatch, {
      noOpen: true,
      ensure: async () => ({ url: 'http://127.0.0.1:4321', reused: true }),
      openUrl: () => { throw new Error('must not run'); },
    });

    expect(result).toMatchObject({ ok: true, openRequested: false, reused: true });
    expect(result.url).toContain('/set/workflow-deck?source=apply-open');
  });
});
