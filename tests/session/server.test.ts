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
  it('renders an onboarding empty state (bridge to the agent) when the library has no sets', async () => {
    const emptyRoot = await mkdtemp(join(tmpdir(), 'mlt-empty-'));
    running = await startReviewServer(emptyRoot);
    const { status, text } = await get(`${running.url}/`);
    expect(status).toBe(200);
    expect(text).toContain('No lessons yet');
    // Bridges back to the agent with a concrete, copyable prompt.
    expect(text).toContain('Create a MergeLearn lesson from my last PR.');
    expect(text).toContain('class="copyable"');
    // Refresh control + a first-run setup hint + a manual fallback path.
    expect(text).toContain('id="refresh-home"');
    expect(text).toContain('mergelearn setup-agent');
    expect(text).toContain('Prefer to do it yourself?');
    // Immediate first-value path: opt-in sample, never auto-installed.
    expect(text).toContain('id="try-sample"');
    expect(text).toContain("fetch('/api/sample'");
  });

  it('installs the sample via POST /api/sample and is idempotent', async () => {
    const emptyRoot = await mkdtemp(join(tmpdir(), 'mlt-sample-api-'));
    running = await startReviewServer(emptyRoot);
    const first = await (await fetch(`${running.url}/api/sample`, { method: 'POST' })).json();
    expect(first).toMatchObject({ ok: true, status: 'installed', setId: 'mergelearn-sample' });
    const lesson = await (await fetch(`${running.url}/api/lesson?set=mergelearn-sample`)).json();
    expect(lesson.ok).toBe(true);
    expect(lesson.cards).toHaveLength(4);
    expect(lesson.cards.map((c: { interaction: { type: string } }) => c.interaction.type))
      .toEqual(['choice', 'self_response', 'parsons', 'flashcard']);

    const second = await (await fetch(`${running.url}/api/sample`, { method: 'POST' })).json();
    expect(second.status).toBe('current');
  });

  it('renders Home with the set and the due count', async () => {
    running = await startReviewServer(await seed());
    const { status, text } = await get(`${running.url}/`);
    expect(status).toBe(200);
    expect(text).toContain('Server Deck');
    expect(text).toContain('1</strong>'); // due banner count
    expect(text).toContain('Review 1 due'); // Review is the separate FSRS entry
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

  it('stores a pre-reveal attempt sent with a grade, end-to-end to the session file', async () => {
    const root = await seed();
    running = await startReviewServer(root);
    const due = await (await fetch(`${running.url}/api/due`)).json();
    const card = due.cards[0];
    const start = await (await fetch(`${running.url}/api/session/start`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    })).json();
    const graded = await (await fetch(`${running.url}/api/session/grade`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId: start.sessionId, cardId: card.id, setId: card.setId, rating: 3,
        attempt: { interaction: 'self_response', responseText: 'a union is one of several', revealedFull: true, elapsedMs: 3100 },
      }),
    })).json();
    expect(graded.ok).toBe(true);

    await (await fetch(`${running.url}/api/session/end`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: start.sessionId }),
    })).json();

    // Read the persisted session file back and confirm the attempt survived.
    const fs = await import('node:fs/promises');
    const sessionsDir = join(root, 'profile', 'sessions');
    const days = await fs.readdir(sessionsDir);
    const files = await fs.readdir(join(sessionsDir, days[0]));
    const saved = JSON.parse(await fs.readFile(join(sessionsDir, days[0], files[0]), 'utf8'));
    expect(saved.events[0].attempt.interaction).toBe('self_response');
    expect(saved.events[0].attempt.responseText).toContain('one of several');
    expect(saved.events[0].attempt.revealedFull).toBe(true);
  });

  it('stores a parsons attempt (ordered block ids + correctness) to the session file', async () => {
    const root = await seed();
    running = await startReviewServer(root);
    const due = await (await fetch(`${running.url}/api/due`)).json();
    const card = due.cards[0];
    const start = await (await fetch(`${running.url}/api/session/start`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    })).json();
    const graded = await (await fetch(`${running.url}/api/session/grade`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId: start.sessionId, cardId: card.id, setId: card.setId, rating: 3,
        attempt: { interaction: 'parsons', orderedBlockIds: ['guard', 'use', 'close'], correct: true, elapsedMs: 5200 },
      }),
    })).json();
    expect(graded.ok).toBe(true);

    await (await fetch(`${running.url}/api/session/end`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: start.sessionId }),
    })).json();

    const fs = await import('node:fs/promises');
    const sessionsDir = join(root, 'profile', 'sessions');
    const days = await fs.readdir(sessionsDir);
    const files = await fs.readdir(join(sessionsDir, days[0]));
    const saved = JSON.parse(await fs.readFile(join(sessionsDir, days[0], files[0]), 'utf8'));
    expect(saved.events[0].attempt.interaction).toBe('parsons');
    expect(saved.events[0].attempt.orderedBlockIds).toEqual(['guard', 'use', 'close']);
    expect(saved.events[0].attempt.correct).toBe(true);
  });

  it('serves a lesson in authored order with objective and interaction, independent of due state', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mlt-srv-'));
    const patch: AgentSetPatch = {
      version: 1,
      set: { title: 'Union Lesson', folderPath: 'ts/unions', tagIds: [], objective: 'Narrow a union', lessonKind: 'general' },
      tagPatch: { reuse: [], add: [{ localId: 'u', label: 'unions', kind: 'topic' }] },
      order: ['b', 'a'], // authored order deliberately not alphabetical
      cards: [
        {
          localId: 'a', tagRefs: ['u'], front: { prompt: 'What narrows a union?' },
          back: { shortAnswer: 'A type guard.', explanationMarkdown: 'typeof/in/instanceof narrow.' },
          interaction: {
            type: 'choice',
            options: [
              { id: 'x', text: 'a cast', feedback: 'No — a cast asserts, it does not narrow.' },
              { id: 'y', text: 'a type guard', feedback: 'Yes.' },
            ],
            correctOptionIds: ['y'],
          },
        },
        {
          localId: 'b', tagRefs: ['u'], front: { prompt: 'What is a union?' },
          back: { shortAnswer: 'One of several types.', explanationMarkdown: 'A | B.' },
          interaction: { type: 'self_response', placeholder: 'in your words' },
        },
      ],
    };
    const res = await importAgentSet(root, patch, { now: new Date('2026-07-07T12:00:00Z') });
    expect(res.ok).toBe(true);
    running = await startReviewServer(root);
    const lesson = await (await fetch(`${running.url}/api/lesson?set=${res.setId}`)).json();
    expect(lesson.ok).toBe(true);
    expect(lesson.lesson.objective).toBe('Narrow a union');
    expect(lesson.total).toBe(2);
    // authored order preserved: 'b' (self_response) before 'a' (choice)
    expect(lesson.cards[0].interaction.type).toBe('self_response');
    expect(lesson.cards[1].interaction.type).toBe('choice');
    expect(lesson.cards[1].interaction.options).toHaveLength(2);
  });

  it('starts a lesson-mode session when lessonSetId is provided', async () => {
    running = await startReviewServer(await seed());
    const start = await (await fetch(`${running.url}/api/session/start`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lessonSetId: 'server-deck' }),
    })).json();
    expect(start.ok).toBe(true);
    expect(start.mode).toBe('lesson');
  });

  it('tracks lesson progress: grading one card yields in_progress, resume target, and a Continue action', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mlt-srv-'));
    const patch: AgentSetPatch = {
      version: 1,
      set: { title: 'Progress Lesson', folderPath: 'ts/prog', tagIds: [], objective: 'Track progress' },
      tagPatch: { reuse: [], add: [{ localId: 'u', label: 'prog', kind: 'topic' }] },
      order: ['first', 'second'], // authored order
      cards: [
        { localId: 'first', tagRefs: ['u'], front: { prompt: 'Q1?' }, back: { shortAnswer: 'A1', explanationMarkdown: 'E1' } },
        { localId: 'second', tagRefs: ['u'], front: { prompt: 'Q2?' }, back: { shortAnswer: 'A2', explanationMarkdown: 'E2' } },
      ],
    };
    const res = await importAgentSet(root, patch, { now: new Date('2026-07-07T12:00:00Z') });
    expect(res.ok).toBe(true);
    running = await startReviewServer(root);

    // Before any attempt: not_started, resume at the first authored card.
    const before = await (await fetch(`${running.url}/api/lesson?set=${res.setId}`)).json();
    const firstId = before.cards[0].id;
    const secondId = before.cards[1].id;
    expect(before.progress.state).toBe('not_started');
    expect(before.progress.resumeCardId).toBe(firstId);

    // Grade the first authored card in a lesson-mode session.
    const start = await (await fetch(`${running.url}/api/session/start`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lessonSetId: res.setId }),
    })).json();
    const graded = await (await fetch(`${running.url}/api/session/grade`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: start.sessionId, cardId: firstId, setId: res.setId, rating: 3 }),
    })).json();
    expect(graded.ok).toBe(true);

    // After: in_progress, one attempted, resume at the SECOND card (durable — a
    // fresh /api/lesson call maps to a new session, so this proves the union rule).
    const after = await (await fetch(`${running.url}/api/lesson?set=${res.setId}`)).json();
    expect(after.progress.state).toBe('in_progress');
    expect(after.progress.attemptedCount).toBe(1);
    expect(after.progress.resumeCardId).toBe(secondId);

    // Home surfaces a Continue action for the partially-done lesson.
    const home = await get(`${running.url}/`);
    expect(home.text).toContain('Continue lesson');
  });

  it('ignores a malformed attempt but still records the grade', async () => {
    running = await startReviewServer(await seed());
    const due = await (await fetch(`${running.url}/api/due`)).json();
    const card = due.cards[0];
    const start = await (await fetch(`${running.url}/api/session/start`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    })).json();
    const graded = await (await fetch(`${running.url}/api/session/grade`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId: start.sessionId, cardId: card.id, setId: card.setId, rating: 3,
        attempt: { interaction: 'not_a_type', foo: 'bar' },
      }),
    })).json();
    expect(graded.ok).toBe(true); // malformed attempt is dropped, grade still succeeds
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
