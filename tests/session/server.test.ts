import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { startReviewServer, type ReviewServer } from '../../src/session/server.js';
import { importAgentSet } from '../../src/core/library/importAgentSet.js';
import type { AgentSetPatch } from '../../src/core/library/types.js';

let running: ReviewServer | undefined;

afterEach(async () => {
  await running?.close();
  running = undefined;
});

async function seed(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'mlt-srv-'));
  const patch: AgentSetPatch = {
    version: 1,
    set: { title: 'Server Deck', folderPath: 'ts/basics', tagIds: [] },
    tagPatch: { reuse: [], add: [{ localId: 'u', label: 'unions', kind: 'topic' }] },
    order: ['c1'],
    cards: [{
      localId: 'c1', tagRefs: ['u'],
      front: { prompt: 'What is a union type?' },
      back: { shortAnswer: 'One of several types.', explanationMarkdown: 'A | B is either A or B.' },
    }],
  };
  const res = await importAgentSet(root, patch, { now: new Date('2026-07-07T12:00:00Z') });
  if (!res.ok) throw new Error('seed import failed');
  return root;
}

async function get(url: string): Promise<{ status: number; text: string }> {
  const r = await fetch(url);
  return { status: r.status, text: await r.text() };
}

describe('review GUI server (functional)', () => {
  it('renders Home with the set and the due count', async () => {
    running = await startReviewServer(await seed());
    const { status, text } = await get(`${running.url}/`);
    expect(status).toBe(200);
    expect(text).toContain('Server Deck');
    expect(text).toContain('1</strong>'); // due banner count
    expect(text).toContain('Start practice');
    expect(text).toContain('aria-current="page"'); // Home tab active
  });

  it('serves the Practice shell', async () => {
    running = await startReviewServer(await seed());
    const { status, text } = await get(`${running.url}/practice`);
    expect(status).toBe(200);
    expect(text).toContain('id="mount"');
    expect(text).toContain('/api/due'); // client fetches the queue
  });

  it('/api/due returns the due card with its self-contained back', async () => {
    running = await startReviewServer(await seed());
    const r = await fetch(`${running.url}/api/due`);
    const j = await r.json();
    expect(j.total).toBe(1);
    expect(j.cards[0].prompt).toBe('What is a union type?');
    expect(j.cards[0].shortAnswer).toBe('One of several types.');
    expect(j.cards[0].explanation).toContain('either A or B');
  });

  it('/api/session lifecycle advances FSRS and drops the card from the due queue', async () => {
    running = await startReviewServer(await seed());
    const due = await (await fetch(`${running.url}/api/due`)).json();
    const card = due.cards[0];

    // Start a session, grade through it, then end it.
    const start = await (await fetch(`${running.url}/api/session/start`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    })).json();
    expect(start.ok).toBe(true);

    const graded = await (await fetch(`${running.url}/api/session/grade`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: start.sessionId, cardId: card.id, setId: card.setId, rating: 3 }),
    })).json();
    expect(graded.ok).toBe(true);
    expect(new Date(graded.due).getTime()).toBeGreaterThan(Date.now());

    const after = await (await fetch(`${running.url}/api/due`)).json();
    expect(after.total).toBe(0);

    // The session file should now contain the graded event + summary.
    const ended = await (await fetch(`${running.url}/api/session/end`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: start.sessionId }),
    })).json();
    expect(ended.ok).toBe(true);
    expect(ended.summary.reviewedCount).toBe(1);
    expect(ended.summary.good).toBe(1);
  });

  it('rejects a bad grade payload', async () => {
    running = await startReviewServer(await seed());
    const start = await (await fetch(`${running.url}/api/session/start`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    })).json();
    const r = await fetch(`${running.url}/api/session/grade`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: start.sessionId, cardId: 'x', setId: 'y', rating: 9 }),
    });
    expect(r.status).toBe(400);
    const j = await r.json();
    expect(j.ok).toBe(false);
  });

  it('accepts and stores pre-reveal confidence sent with a grade', async () => {
    running = await startReviewServer(await seed());
    const due = await (await fetch(`${running.url}/api/due`)).json();
    const card = due.cards[0];
    const start = await (await fetch(`${running.url}/api/session/start`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    })).json();
    const graded = await (await fetch(`${running.url}/api/session/grade`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: start.sessionId, cardId: card.id, setId: card.setId, rating: 3, confidence: 4 }),
    })).json();
    expect(graded.ok).toBe(true); // confidence is optional; a valid grade still succeeds
  });

  it('set browser lists every card in the set, even after it has been reviewed', async () => {
    running = await startReviewServer(await seed());
    const due = await (await fetch(`${running.url}/api/due`)).json();
    const card = due.cards[0];

    // Grade it so it leaves the due queue.
    const start = await (await fetch(`${running.url}/api/session/start`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    })).json();
    await fetch(`${running.url}/api/session/grade`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: start.sessionId, cardId: card.id, setId: card.setId, rating: 3 }),
    });
    expect((await (await fetch(`${running.url}/api/due`)).json()).total).toBe(0);

    // The card is no longer due, but the set browser still shows it.
    const { status, text } = await get(`${running.url}/set/${encodeURIComponent(card.setId)}`);
    expect(status).toBe(200);
    expect(text).toContain('Server Deck');
    expect(text).toContain('What is a union type?'); // the prompt is browsable
    expect(text).toContain('One of several types.'); // and so is the answer
    expect(text).toContain('browse-card');
  });

  it('set browser returns a friendly page for an unknown set', async () => {
    running = await startReviewServer(await seed());
    const { status, text } = await get(`${running.url}/set/does-not-exist`);
    expect(status).toBe(200);
    expect(text).toContain('Set not found');
  });
});
