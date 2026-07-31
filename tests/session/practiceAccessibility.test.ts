import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { startReviewServer, type ReviewServer } from '../../src/session/server.js';
import { importAgentSet } from '../../src/core/library/importAgentSet.js';
import type { AgentSetPatch } from '../../src/core/library/types.js';

let running: ReviewServer | undefined;
afterEach(async () => { await running?.close(); running = undefined; });

async function seed(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'ml-a11y-'));
  const res = await importAgentSet(root, {
    version: 1,
    set: { id: 'a11y-deck', title: 'A11y deck', tagIds: [] },
    tagPatch: { reuse: [], add: [] },
    order: ['c1'],
    cards: [{
      localId: 'c1', tagRefs: [],
      front: { prompt: 'Is the reveal announced?' },
      back: { shortAnswer: 'It should be.', explanationMarkdown: 'Otherwise nobody hears it.' },
    }],
  } as AgentSetPatch);
  if (!res.ok) throw new Error('seed failed');
  return root;
}

const fetchText = async (url: string): Promise<string> => (await fetch(url)).text();

describe('practice reveals are announced to assistive technology', () => {
  it('marks the attempt review as a live region', async () => {
    running = await startReviewServer(await seed());
    const html = await fetchText(`${running.url}/practice`);
    // Checking answer inserts the result WITHOUT moving focus, so without a
    // live region a screen-reader user is never told the outcome arrived.
    expect(html).toContain('id="attempt-review" aria-live="polite"');
  });

  it('marks the session status as a live region', async () => {
    running = await startReviewServer(await seed());
    const html = await fetchText(`${running.url}/practice`);
    expect(html).toContain('id="status" aria-live="polite"');
  });

  it('keeps the inline client parseable after the markup change', async () => {
    running = await startReviewServer(await seed());
    const html = await fetchText(`${running.url}/practice`);
    const script = html.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
    expect(script).toBeTruthy();
    // The client is a string literal, so tsc cannot see inside it.
    expect(() => new Function(script!)).not.toThrow();
  });
});

describe('finishing a session always offers a way forward', () => {
  it('ships forward actions for both the completed and empty states', async () => {
    running = await startReviewServer(await seed());
    const script = (await fetchText(`${running.url}/practice`))
      .match(/<script>([\s\S]*?)<\/script>/i)?.[1] ?? '';
    // With a backlog: continue reviewing. Without one: the two things actually
    // worth doing next, instead of a dead end.
    expect(script).toContain('Review next sitting');
    expect(script).toContain('Back to lessons');
    expect(script).toContain('See your progress');
    expect(script).toContain('emptyNext');
  });
});
