import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { startReviewServer, type ReviewServer } from '../../src/session/server.js';
import { importAgentSet } from '../../src/core/library/importAgentSet.js';
import { archiveCard } from '../../src/core/library/cardLifecycle.js';
import { loadCard, loadCardsForSet, saveCard } from '../../src/core/library/cardStore.js';
import { loadSet, saveSet } from '../../src/core/library/setStore.js';
import { getDueCards } from '../../src/core/library/review/dueQueue.js';
import { gradePlannedSession, startPlannedSession } from '../../src/core/library/review/session.js';
import { saveUserPreferences } from '../../src/core/library/userPreferences.js';
import { acquireSessionWriter, SessionWriterError } from '../../src/session/writerClaim.js';
import type { AgentSetPatch, ReviewSession } from '../../src/core/library/types.js';

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

async function seedProblemRefs(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'mlt-problem-refs-'));
  const patch: AgentSetPatch = {
    version: 1,
    set: { id: 'problems', title: 'Problems', tagIds: [], problemRefs: [
      { sourceName: 'exa"mple', sourceId: 'shared', canonicalUrl: 'https://set.example/shared' },
      { sourceName: 'Unsafe', sourceId: 'stored', canonicalUrl: 'https://unsafe.example/stored' },
    ] },
    tagPatch: { reuse: [], add: [] }, order: ['c1'],
    cards: [{
      localId: 'c1', tagRefs: [],
      problemRefs: [{
        sourceName: 'EXA"MPLE', sourceId: 'SHARED', canonicalUrl: 'https://card.example/shared',
        attributions: [{ kind: 'company', label: 'Practice collection', observedOn: '2026-08-05' }],
      }],
      front: { prompt: 'Which source wins?' },
      back: { shortAnswer: 'The Card source.', explanationMarkdown: 'Card metadata is more specific.' },
    }],
  };
  const result = await importAgentSet(root, patch, { now: new Date('2026-08-05T12:00:00Z') });
  if (!result.ok) throw new Error('problem-ref seed failed');
  const set = (await loadSet(root, 'problems'))!;
  set.problemRefs![1]!.canonicalUrl = 'javascript:alert(1)';
  set.problemRefs![1]!.title = 'Safe \u202Egninrut';
  set.problemRefs![1]!.attributions = [
    { kind: 'company', label: 'Bad \u202Elabel', observedOn: '2026-08-05' },
    { kind: 'list', label: 'Bad date', observedOn: '2026-08-05 (verified)' },
  ];
  set.problemRefs!.push({ canonicalUrl: 'https://example.org/malformed' } as never);
  await saveSet(root, set);
  return root;
}

async function seedMany(count: number): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'mlt-many-'));
  const localIds = Array.from({ length: count }, (_, i) => `c${i}`);
  const patch: AgentSetPatch = {
    version: 1,
    set: { title: 'Many', tagIds: [] },
    tagPatch: { reuse: [], add: [] }, order: localIds,
    cards: localIds.map((localId, index) => ({
      localId, tagRefs: [], front: { prompt: `Question ${index}?` },
      back: { shortAnswer: `Answer ${index}`, explanationMarkdown: `Explanation ${index}` },
    })),
  };
  const result = await importAgentSet(root, patch, { now: new Date('2026-07-07T12:00:00Z') });
  if (!result.ok) throw new Error('many-card seed failed');
  return root;
}

async function seedTwoSets(countPerSet: number): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'mlt-two-sets-'));
  for (const setId of ['alpha', 'beta']) {
    const localIds = Array.from({ length: countPerSet }, (_, i) => `c${i}`);
    const patch: AgentSetPatch = {
      version: 1,
      set: { id: setId, title: `${setId} deck`, tagIds: [] },
      tagPatch: { reuse: [], add: [] },
      order: localIds,
      cards: localIds.map((localId) => ({
        localId, tagRefs: [], front: { prompt: localId },
        back: { shortAnswer: localId, explanationMarkdown: localId },
      })),
    };
    const result = await importAgentSet(root, patch, { now: new Date('2026-07-07T12:00:00Z') });
    if (!result.ok) throw new Error(`seed import failed: ${setId}`);
  }
  return root;
}

async function seedSiblingReview(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'mlt-siblings-'));
  const patch: AgentSetPatch = {
    version: 1,
    set: { id: 'siblings', title: 'Sibling review', tagIds: [] },
    tagPatch: { reuse: [], add: [] }, order: ['a1', 'b1', 'b2', 'c1', 'c2'],
    cards: [
      { localId: 'a1', id: 'a1', siblingGroupId: 'A', tagRefs: [],
        front: { prompt: 'A1?' }, back: { shortAnswer: 'A1', explanationMarkdown: 'A1 explanation' } },
      { localId: 'b1', id: 'b1', siblingGroupId: 'B', tagRefs: [],
        front: { prompt: 'B1?' }, back: { shortAnswer: 'B1', explanationMarkdown: 'B1 explanation' } },
      { localId: 'b2', id: 'b2', siblingGroupId: 'B', tagRefs: [],
        front: { prompt: 'B2?' }, back: { shortAnswer: 'B2', explanationMarkdown: 'B2 explanation' } },
      { localId: 'c1', id: 'c1', siblingGroupId: 'C', tagRefs: [],
        front: { prompt: 'C1?' }, back: { shortAnswer: 'C1', explanationMarkdown: 'C1 explanation' } },
      { localId: 'c2', id: 'c2', siblingGroupId: 'C', tagRefs: [],
        front: { prompt: 'C2?' }, back: { shortAnswer: 'C2', explanationMarkdown: 'C2 explanation' } },
    ],
  };
  const result = await importAgentSet(root, patch, { now: new Date('2026-07-07T12:00:00Z') });
  if (!result.ok) throw new Error('sibling seed failed');
  return root;
}

async function get(url: string): Promise<{ status: number; text: string }> {
  const r = await fetch(url);
  return { status: r.status, text: await r.text() };
}

function gradeBody(
  start: { sessionId: string; revision: number; current: { entryId: string } },
  card: { id: string; setId: string },
  extra: Record<string, unknown> = {},
) {
  return {
    sessionId: start.sessionId, requestId: 'grade', revision: start.revision,
    entryId: start.current.entryId, cardId: card.id, setId: card.setId, rating: 3,
    ...extra,
  };
}

describe('review GUI server (functional)', () => {
  it('exposes canonical Home, Library, and Practice routes with one-hop compatibility redirects', async () => {
    running = await startReviewServer(await seed());
    for (const [path, label, current] of [
      ['/', 'Home', 'page'],
      ['/library', 'Library', 'page'],
      ['/library/cards', 'Library', 'true'],
      ['/practice', 'Practice', 'page'],
      ['/practice/session', 'Practice', 'true'],
      ['/set/server-deck', 'Library', 'true'],
    ]) {
      const response = await fetch(`${running.url}${path}`);
      const html = await response.text();
      expect(response.status, path).toBe(200);
      expect(html, path).toContain(`<a href="${label === 'Home' ? '/' : `/${label.toLowerCase()}`}" aria-current="${current}">${label}</a>`);
      const nav = html.match(/<nav class="tabs">([\s\S]*?)<\/nav>/)?.[1] ?? '';
      expect(nav.match(/aria-current=/g), path).toHaveLength(1);
      const scripts = [...html.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script\s*>/gi)].map((match) => match[1]);
      expect(() => scripts.filter((script) => script.trim() && !script.trim().startsWith('{'))
        .forEach((script) => new Function(script))).not.toThrow();
    }

    for (const [path, location] of [
      ['/manage?tag=a&tag=b%20c', '/library/cards?tag=a&tag=b%20c'],
      ['/prepare?source=Interview%20list', '/practice/external?source=Interview%20list'],
      ['/prepare?set=s&source=x', '/practice/strengthen?set=s&source=x'],
      ['/practice?mode=lesson&set=server-deck', '/practice/session?mode=lesson&set=server-deck'],
      ['/practice?set=server-deck', '/practice/session?set=server-deck'],
    ]) {
      const response = await fetch(`${running.url}${path}`, { redirect: 'manual' });
      expect(response.status, path).toBe(302);
      expect(response.headers.get('location'), path).toBe(location);
    }

    const unknown = await fetch(`${running.url}/practice?utm=test`);
    expect(unknown.status).toBe(200);
    expect(await unknown.text()).toContain('Choose how to practice');
  });

  it('renders External problems with exact card fragments, safe links, and repeated source filters', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mlt-prepare-route-'));
    const result = await importAgentSet(root, {
      version: 1,
      set: { id: 'prep-set', title: 'Prepare & verify', tagIds: [] },
      tagPatch: { reuse: [], add: [] }, order: ['reserved'],
      cards: [{
        localId: 'reserved', id: 'reserved', tagRefs: [],
        problemRefs: [
          { sourceName: 'Good & Co', sourceId: 'A/1', canonicalUrl: 'https://example.org/a?q=1' },
          { sourceName: 'Other', sourceId: 'B', canonicalUrl: 'https://example.org/b' },
        ],
        front: { prompt: 'Which source?' },
        back: { shortAnswer: 'The supplied one.', explanationMarkdown: 'Use factual metadata.' },
      }],
    }, { now: new Date('2026-08-05T12:00:00Z') });
    expect(result.ok).toBe(true);
    const original = await loadCard(root, 'prep-set', 'reserved');
    expect(original).toBeDefined();
    await archiveCard(root, 'prep-set', 'reserved');
    await saveCard(root, { ...original!, id: 'snow 雪 %?#' });
    running = await startReviewServer(root);

    const html = await (await fetch(`${running.url}/practice/external?source=missing&source=Good%20%26%20Co`)).text();
    const fragment = `/set/${encodeURIComponent('prep-set')}#card-${encodeURIComponent('snow 雪 %?#')}`;
    expect(html).toContain('<a href="/practice" aria-current="true">Practice</a>');
    expect(html).toContain('href="/practice/external?source=missing&amp;source=Good%20%26%20Co" aria-current="page"');
    expect(html).toContain(`href="${fragment}"`);
    expect(html).toContain('Good &amp; Co');
    expect(html.match(/<input name="source"/g)).toHaveLength(2);
    expect(html).toContain('<label>Source 1<input name="source" value="missing">');
    expect(html).toContain('<label>Source 2<input name="source" value="Good &amp; Co">');
    expect(html).not.toContain('Problem reference supplied by Other');
    expect(html).not.toContain('href="/set/prep-set#card-reserved"');
    expect(html).toContain('target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer"');

    const setHtml = await (await fetch(`${running.url}${fragment}`)).text();
    expect(setHtml).toContain('id="card-snow 雪 %?#"');
  });

  it('distinguishes absent External metadata from filters that exclude it', async () => {
    const root = await seed();
    running = await startReviewServer(root);
    const strengthen = await (await fetch(`${running.url}/practice/strengthen`)).text();
    const absent = await (await fetch(`${running.url}/practice/external`)).text();
    expect(strengthen).toContain('No evidence-backed weak cards are available yet.');
    expect(absent).toContain('No problem references are available yet.');
    expect(absent).toContain('mergelearn apply --file examples/interview-pattern-lesson.json --open');
    await running.close();

    running = await startReviewServer(await seedProblemRefs());
    const populated = await (await fetch(`${running.url}/practice/external`)).text();
    expect(populated).toContain('<span class="secondary-action is-disabled">Link unavailable</span>');
    expect(populated).not.toContain('href="javascript:');
    expect(populated).not.toContain('Safe gninrut');
    const filtered = await (await fetch(`${running.url}/practice/external?source=missing`)).text();
    expect(filtered).toContain('No problem references match the active filters.');
  });

  it('reports health and keeps the health probe out of activity tracking', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mlt-health-'));
    let activity = 0;
    running = await startReviewServer(root, 0, { instanceId: 'test-instance', managed: true, onActivity: () => { activity += 1; } });

    const health = await (await fetch(`${running.url}/health`)).json();
    expect(health).toEqual({
      ok: true, instanceId: 'test-instance', managed: true, sessionWriter: 'owner',
    });
    expect(activity).toBe(0);

    expect((await (await fetch(`${running.url}/api/keepalive`)).json()).ok).toBe(true);
    expect(activity).toBe(1);
  });

  it('keeps a second same-root server readable but refuses session writes', async () => {
    const root = await seed();
    running = await startReviewServer(root, 0, { instanceId: 'owner' });
    const readOnly = await startReviewServer(root, 0, { instanceId: 'reader' });
    try {
      expect(await (await fetch(`${running.url}/health`)).json()).toMatchObject({ sessionWriter: 'owner' });
      expect(await (await fetch(`${readOnly.url}/health`)).json()).toMatchObject({
        sessionWriter: 'read_only', sessionWriterReason: 'session_writer_lost',
      });
      expect((await fetch(`${readOnly.url}/`)).status).toBe(200);

      const refused = await fetch(`${readOnly.url}/api/session/start`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
      });
      expect(refused.status).toBe(409);
      expect(await refused.json()).toMatchObject({ ok: false, code: 'session_writer_lost' });

      const card = (await (await fetch(`${running.url}/api/cards`)).json()).cards[0];
      const refusedArchive = await fetch(`${readOnly.url}/api/card/archive`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ setId: card.setId, cardId: card.id }),
      });
      expect(refusedArchive.status).toBe(409);
      expect(await refusedArchive.json()).toMatchObject({ code: 'session_writer_lost' });
      expect((await (await fetch(`${running.url}/api/cards`)).json()).cards[0].status).toBe('active');

      for (const [path, body] of [
        ['/api/sample', undefined],
        ['/api/set/spaced-repetition', { setId: card.setId, enabled: false }],
        ['/api/dogfood/feedback', { setId: card.setId, worthAnswering: true }],
        ['/api/dogfood/defer', { setId: card.setId }],
      ] as const) {
        const response = await fetch(`${readOnly.url}${path}`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({ code: 'session_writer_lost' });
      }

      const accepted = await fetch(`${running.url}/api/session/start`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
      });
      expect(accepted.status).toBe(200);
      const started = await accepted.json();
      expect(started).toMatchObject({ ok: true, revision: 0 });
      await archiveCard(root, started.current.card.setId, started.current.card.id);
      const peerView = await (await fetch(`${readOnly.url}/api/session/${started.sessionId}`)).json();
      expect(peerView).toMatchObject({ ok: true, current: null, remaining: 1 });
    } finally {
      await readOnly.close();
    }
  });

  it('starts read-only when local writer identity cannot be verified', async () => {
    const root = await seed();
    const writer = await acquireSessionWriter(root, 'reader', {
      resolveIdentity: async () => { throw new Error('identity probe unavailable'); },
    });
    running = await startReviewServer(root, 0, { instanceId: 'reader', sessionWriter: writer });
    expect(await (await fetch(`${running.url}/health`)).json()).toMatchObject({
      sessionWriter: 'read_only', sessionWriterReason: 'session_writer_unavailable',
    });
    expect((await fetch(`${running.url}/`)).status).toBe(200);
    const response = await fetch(`${running.url}/api/session/start`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'session_writer_unavailable' });
    expect(await (await fetch(`${running.url}/health`)).json()).toMatchObject({
      sessionWriter: 'read_only', sessionWriterReason: 'session_writer_unavailable',
    });
  });

  it('health revalidates a replaced writer claim before reporting ownership', async () => {
    const root = await seed();
    const writer = await acquireSessionWriter(root, 'owner');
    running = await startReviewServer(root, 0, { instanceId: 'owner', sessionWriter: writer });
    await writeFile(join(root, 'profile', 'session-writer.json'), JSON.stringify({
      hostId: 'replacement-host', pid: 999, processStart: 'replacement', instanceId: 'replacement',
    }), 'utf8');
    expect(await (await fetch(`${running.url}/health`)).json()).toMatchObject({
      sessionWriter: 'read_only', sessionWriterReason: 'session_writer_lost',
    });
  });

  it('gives direct servers a stable identity and embeds it in the shared status shell', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mlt-direct-identity-'));
    running = await startReviewServer(root);

    const health = await (await fetch(`${running.url}/health`)).json() as { instanceId?: string };
    expect(health.instanceId).toMatch(/^[0-9a-f-]{36}$/i);

    const html = await (await fetch(`${running.url}/`)).text();
    expect(html).toContain(`data-server-instance="${health.instanceId}"`);
    expect(html).toContain('id="connection-status"');
    expect(html).toContain('role="status" aria-live="polite"');
    expect(html).toContain('data-connection-controller');
    expect(html).toContain('data-connection-runtime');
    const runtime = html.match(/<script data-connection-runtime>([\s\S]*?)<\/script>/i)?.[1];
    expect(runtime).toBeTruthy();
    expect(() => new Function(runtime!)).not.toThrow();
    expect(html).toContain('data-server-mutation');
  });

  it('serves complete paged card metadata and rejects a stale snapshot', async () => {
    const root = await seedMany(101);
    running = await startReviewServer(root);

    const firstResponse = await fetch(`${running.url}/api/cards`);
    const first = await firstResponse.json();
    expect(firstResponse.status).toBe(200);
    expect(first).toMatchObject({ ok: true, total: 101, returned: 100, hasMore: true, nextOffset: 100 });
    expect(first.cards).toHaveLength(100);
    expect(first.snapshot).toMatch(/^[0-9a-f]{64}$/);

    const second = await (await fetch(
      `${running.url}/api/cards?offset=100&limit=100&snapshot=${first.snapshot}`,
    )).json();
    expect(second).toMatchObject({ ok: true, total: 101, returned: 1, hasMore: false, snapshot: first.snapshot });
    expect(second.nextOffset).toBeUndefined();

    const malformed = await (await fetch(`${running.url}/api/cards?offset=-1&limit=0&state=0`)).json();
    expect(malformed).toMatchObject({ total: 101, returned: 100, nextOffset: 100 });
    const nonnumeric = await (await fetch(`${running.url}/api/cards?offset=bad&limit=bad`)).json();
    expect(nonnumeric).toMatchObject({ total: 101, returned: 100, nextOffset: 100 });
    const beyond = await (await fetch(`${running.url}/api/cards?offset=999&limit=2.5`)).json();
    expect(beyond).toMatchObject({ cards: [], total: 101, returned: 0, hasMore: false });
    expect(beyond.nextOffset).toBeUndefined();

    const target = first.cards[0];
    const edited = await fetch(`${running.url}/api/card/edit`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        setId: target.setId, cardId: target.cardId, expectedUpdatedAt: target.updatedAt,
        edit: { front: { prompt: `${target.prompt} changed` } },
      }),
    });
    expect(edited.status).toBe(200);

    const stale = await fetch(`${running.url}/api/cards?offset=100&snapshot=${first.snapshot}`);
    expect(stale.status).toBe(409);
    const staleBody = await stale.json();
    expect(staleBody).toEqual({
      ok: false, code: 'snapshot_mismatch', snapshot: expect.stringMatching(/^[0-9a-f]{64}$/), total: 101,
    });
    expect(staleBody.snapshot).not.toBe(first.snapshot);
  });

  it('treats a blank Cards API state as All states', async () => {
    const root = await seed();
    const [card] = await loadCardsForSet(root, 'server-deck');
    await saveCard(root, { ...card!, fsrs: { ...card!.fsrs, state: 2 } });
    running = await startReviewServer(root);

    const all = await (await fetch(`${running.url}/api/cards`)).json();
    const blank = await (await fetch(`${running.url}/api/cards?state=`)).json();
    const fresh = await (await fetch(`${running.url}/api/cards?state=0`)).json();

    expect(all).toMatchObject({ total: 1, returned: 1 });
    expect(blank).toMatchObject({ total: 1, returned: 1 });
    expect(blank.cards.map((item: { cardId: string }) => item.cardId))
      .toEqual(all.cards.map((item: { cardId: string }) => item.cardId));
    expect(fresh).toMatchObject({ total: 0, returned: 0 });
  });

  it('records explicit dogfood feedback and deferral locally', async () => {
    const root = await seed();
    running = await startReviewServer(root);

    const feedback = await fetch(`${running.url}/api/dogfood/feedback`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ setId: 'server-deck', worthAnswering: true, note: 'caught an edge case' }),
    });
    expect(await feedback.json()).toMatchObject({ ok: true, event: { kind: 'feedback', setId: 'server-deck', worthAnswering: true } });

    const deferred = await fetch(`${running.url}/api/dogfood/defer`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ setId: 'server-deck' }),
    });
    expect(await deferred.json()).toMatchObject({ ok: true, event: { kind: 'deferred', setId: 'server-deck' } });

    const clear = await fetch(`${running.url}/api/dogfood/feedback`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ setId: 'server-deck', worthAnswering: null }),
    });
    expect(await clear.json()).toMatchObject({ ok: true, event: { kind: 'feedback', worthAnswering: null } });
  });

  it('hides dogfood controls when the development flag is disabled', async () => {
    running = await startReviewServer(await seed(), 0, { dogfoodControls: false });
    const text = await (await fetch(`${running.url}/set/server-deck`)).text();
    expect(text).not.toContain('data-dogfood=');
    expect(text).not.toContain('data-dogfood-defer');
  });

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

  it('renders Home as a next-action dashboard', async () => {
    running = await startReviewServer(await seed());
    const { status, text } = await get(`${running.url}/`);
    expect(status).toBe(200);
    expect(text).toContain('Review 1 now');
    expect(text).toContain('<h2>In progress</h2>');
    expect(text).toContain('<h2>Needs attention</h2>');
    expect(text).toContain('Opening these cards is ungraded and does not change scheduling.');
    expect(text).toContain('<form class="home-search" method="get" action="/library/cards">');
    expect(text).toContain('.home-search input,.home-search button{width:100%;min-height:44px}');
    expect(text).toContain("active()?'<p class=\"caught-up\"><strong>You are caught up in this scope.</strong>");
    expect(text).toContain("':'<p class=\"caught-up\"><strong>You are caught up.</strong>");
    expect(text).toContain('href="/library">Browse lessons</a>');
    expect(text).not.toContain('<h2>Lessons</h2>');
    expect(text).toContain('aria-current="page"'); // Home tab active
  });

  it('renders card search, archive, and edit controls on Manage', async () => {
    running = await startReviewServer(await seed());
    const { status, text } = await get(`${running.url}/manage`);
    expect(status).toBe(200);
    expect(text).toContain('id="card-search"');
    expect(text).toContain('id="card-set"');
    expect(text).toContain('id="card-tags" name="tag" multiple');
    expect(text).toContain('id="card-state"');
    expect(text).toContain('id="card-status" tabindex="-1" role="status" aria-live="polite"');
    expect(text).toContain('id="load-more-cards"');
    expect(text).toContain('id="reload-cards"');
    expect(text).toContain("params.set('offset',String(expectedOffset))");
    expect(text).toContain("params.set('snapshot',cardPage.snapshot)");
    expect(text).toContain('requestGeneration!==cardPage.generation');
    expect(text).toContain('expectedOffset!==cardPage.offset');
    expect(text).toContain('if(cardPage.inFlight)return;');
    expect(text).toContain("cardStatus((cardPage.notice?cardPage.notice+' ':'')+cardPage.offset+' of '+cardPage.total)");
    expect(text).toContain('data-card-action');
    expect(text).toContain('data-copy-card');
    expect(text).toContain('Edit teaching text');
    expect(text).toContain('class="curation-head-actions"');
    expect(text).toContain('class="copy-reference" data-copy-card');
    expect(text).toContain('class="copy-reference" data-card-action=');
    expect(text).toContain('class="curation-edit"');
    expect(text).not.toContain('class="curation-actions"');
    expect(text.indexOf('class="curation-head-actions"')).toBeLessThan(text.indexOf('class="curation-edit"'));
    expect(text).toContain('<span data-copy-label>Copy reference</span>');
    expect(text).not.toContain('Practice filters');
    const scripts = [...text.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script\s*>/gi)].map((match) => match[1]);
    expect(() => scripts.filter((script) => script.trim() && !script.trim().startsWith('{'))
      .forEach((script) => new Function(script))).not.toThrow();
  });

  it('server-renders Cards queries and explains moved legacy Review scope', async () => {
    running = await startReviewServer(await seed());
    const searched = await get(`${running.url}/library/cards?q=union`);
    expect(searched.status).toBe(200);
    expect(searched.text).toContain('value="union"');
    expect(searched.text).toContain('<noscript><style>#card-results{display:none}</style><ul class="prepare-list">');
    expect(searched.text).toContain('What is a union type?');

    const blankState = await get(`${running.url}/library/cards?q=union&set=&state=`);
    expect(blankState.status).toBe(200);
    expect(blankState.text).toContain('<option value="">All states</option>');
    expect(blankState.text).not.toContain('<option value="0" selected>New</option>');

    const legacy = await get(`${running.url}/manage?folderPath=ts%2Fbasics`);
    expect(legacy.status).toBe(200);
    expect(legacy.text).toContain('Temporary Review scope moved to <a href="/practice">Practice</a>');
  });

  it('serves the active Review runner', async () => {
    running = await startReviewServer(await seed());
    const { status, text } = await get(`${running.url}/practice/session`);
    expect(status).toBe(200);
    expect(text).toContain('id="mount"');
    expect(text).toContain('/api/session/start');
    expect(text).toContain('function applySessionState');
    expect(text).toContain("if(j.sessionMode)practiceMode=j.sessionMode==='lesson'?'lesson':'review'");
    expect(text).toContain("document.title='MergeLearn — '+(practiceMode==='lesson'?'Learn':'Review')");
    expect(text).toContain("heading.textContent=practiceMode==='lesson'?'Learn':'Review'");
    expect(text).not.toContain("fetch('/api/due'");
    expect(text).not.toContain('function planRequeue');
    expect(text).toContain('/api/session/undo');
    expect(text).toContain('Undo last answer');
    expect(text).toContain('Copy reference');
    expect(text).toContain("var inspectCommand='mergelearn show '+c.setId+'/'+c.id");
    expect(text).not.toContain('mergelearn show --set');
    expect(text).toContain('data-copy-practice-card');
    expect(text).toContain('class="copy-reference copy-practice-card"');
    expect(text).toContain('aria-label="Copy reference"');
    expect(text).toContain('<span data-copy-label>Copy reference</span>');
    expect(text).toContain('<svg viewBox="0 0 24 24" aria-hidden="true">');
    expect(text).toContain("button.classList.add('copied')");
    const practiceScript = text.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
    expect(practiceScript).toBeTruthy();
    expect(() => new Function(practiceScript!)).not.toThrow();
    expect(text).toContain('function problemRefsHtml(c)');
    expect(text).toContain('<div id="problem-refs"></div>');
    expect(text).toContain("document.getElementById('problem-refs').innerHTML=problemRefsHtml(c)");
    expect(text).toContain('rel="noopener noreferrer" referrerpolicy="no-referrer"');
    expect(text).toContain('Link unavailable');
    expect(text).toContain("'Reported by '+esc(ref.sourceName)+': '");
    expect(text.match(/problemRefsHtml\(c\)/g)).toHaveLength(2);
    expect(text).toContain('aria-labelledby="problem-refs-label"');
    expect(text).toContain('opens in a new tab');
    expect(text).toContain('Submit and reveal: how confident are you?');
    expect(text).toContain('function setConfidence(n)');
    expect(text).toContain('confidence=n;');
    expect(text).toContain('if(!reveal()){confidence=0;');
    expect(text).not.toContain('id="check-answer"');
    expect(text).not.toContain('Check answer');
    expect(text).toContain("['INPUT','TEXTAREA','SELECT','BUTTON'].indexOf(e.target.tagName)>=0");
    expect(text).toContain("responseText:''");
    expect(text).toContain("/^[1-4]$/.test(e.key)&&isRevealed()");
    expect(text).toContain('entryId:currentEntryId');
    expect(text).toContain('requestId:pendingRequestId');
    expect(text).toContain('var sentBody=pendingRequestBody');
    expect(text).toContain('JSON.stringify(sentBody)');
    expect(text).toContain('id="end-session"');
    expect(text).toContain('id="continue-session"');
    expect(text).toContain("fetch('/api/session/end'");
    expect(text).toContain('waitingBacklog');
    expect(text).toContain('Review next sitting');
    expect(text).toContain("esc(c.setTitle||'Review')");
    expect(text).not.toContain("esc(c.setId)+'</span><span>'+esc(c.id)");
    expect(text).toContain('aria-label="Good, shortcut 3"');
    expect(text).toContain('@media(max-width:600px)');
    expect(text).toContain('.hint{display:none}');
  });

  it('renders copy commands, reversible feedback, and default-on scheduling on a lesson', async () => {
    running = await startReviewServer(await seed());
    const text = await (await fetch(`${running.url}/set/server-deck`)).text();
    expect(text).toContain('Copy reference');
    expect(text).toContain('mergelearn show server-deck/');
    expect(text).not.toContain('mergelearn show --set');
    expect(text).toContain('class="copy-reference copy-card"');
    expect(text).toContain('aria-label="Copy reference"');
    expect(text).toContain('<span data-copy-label>Copy reference</span>');
    expect(text.indexOf("document.querySelectorAll('[data-copy-command]')"))
      .toBeGreaterThan(text.indexOf('data-copy-command='));
    const scripts = [...text.matchAll(/<script>([\s\S]*?)<\/script\s*>/gi)].map((match) => match[1]);
    expect(scripts.length).toBeGreaterThan(0);
    expect(() => scripts.forEach((script) => new Function(script))).not.toThrow();
    expect(text).toContain('id="spaced-repetition" checked');
    expect(text).toContain('worthAnswering:value');
    expect(text).toContain('var value=on?null:');
  });

  it('can opt a lesson out of spaced repetition and re-enable it', async () => {
    const root = await seed();
    running = await startReviewServer(root);
    expect((await (await fetch(`${running.url}/api/due`)).json()).total).toBe(1);

    const disable = await fetch(`${running.url}/api/set/spaced-repetition`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ setId: 'server-deck', enabled: false }),
    });
    expect(await disable.json()).toEqual({ ok: true, enabled: false });
    expect((await (await fetch(`${running.url}/api/due`)).json()).total).toBe(0);
    expect((await (await fetch(`${running.url}/api/lesson?set=server-deck`)).json()).cards).toHaveLength(1);

    await fetch(`${running.url}/api/set/spaced-repetition`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ setId: 'server-deck', enabled: true }),
    });
    expect((await (await fetch(`${running.url}/api/due`)).json()).total).toBe(1);
  });

  it('/api/due returns the due card with its self-contained back', async () => {
    running = await startReviewServer(await seed());
    const r = await fetch(`${running.url}/api/due`);
    const j = await r.json();
    expect(j.total).toBe(1);
    expect(j.cards[0].prompt).toBe('What is a union type?');
    expect(j.cards[0].setTitle).toBe('Server Deck');
    expect(j.cards[0].shortAnswer).toBe('One of several types.');
    expect(j.cards[0].explanation).toContain('either A or B');
  });

  it('projects a Card-wins reveal union and makes unsafe stored URLs non-linkable', async () => {
    running = await startReviewServer(await seedProblemRefs());
    const due = await (await fetch(`${running.url}/api/due`)).json();
    expect(due.cards[0].problemRefs).toEqual([
      expect.objectContaining({ sourceName: 'EXA"MPLE', sourceId: 'SHARED', hostname: 'card.example', href: 'https://card.example/shared' }),
      expect.objectContaining({ sourceName: 'Unsafe', sourceId: 'stored', hostname: null, href: null }),
    ]);
    expect(JSON.stringify(due.cards[0].problemRefs)).not.toContain('set.example');
    expect(JSON.stringify(due.cards[0].problemRefs)).not.toContain('malformed');
    expect(JSON.stringify(due.cards[0].problemRefs)).not.toContain('gninrut');
    expect(JSON.stringify(due.cards[0].problemRefs)).not.toContain('verified');
    expect(JSON.stringify(due.cards[0].problemRefs)).not.toContain('Bad date');
  });

  it('/api/due applies the user cap and reports the waiting backlog', async () => {
    const root = await seedMany(5);
    await saveUserPreferences(root, { reviewSessionCap: 3, queueStrategy: 'interleaved' });
    running = await startReviewServer(root);
    const j = await (await fetch(`${running.url}/api/due`)).json();
    expect(j).toMatchObject({ total: 3, totalDue: 5, remaining: 2, strategy: 'interleaved' });
    expect(j.cards).toHaveLength(3);
    const home = await (await fetch(`${running.url}/`)).text();
    expect(home).toContain('Review 3 now');
    expect(home).toContain('2 more waiting');
  });

  it('/api/due interleaves sets before applying the sitting cap', async () => {
    const root = await seedTwoSets(4);
    await saveUserPreferences(root, { reviewSessionCap: 4, queueStrategy: 'interleaved' });
    running = await startReviewServer(root);
    const j = await (await fetch(`${running.url}/api/due`)).json();
    const setIds = j.cards.map((card: { setId: string }) => card.setId);
    expect(j).toMatchObject({ total: 4, totalDue: 8, remaining: 4, strategy: 'interleaved' });
    expect(new Set(setIds)).toEqual(new Set(['alpha', 'beta']));
    expect(setIds.every((setId: string, index: number) => index === 0 || setId !== setIds[index - 1])).toBe(true);
  });

  it('spaces siblings after Review membership is selected in preview and session start', async () => {
    const root = await seedSiblingReview();
    await saveUserPreferences(root, { reviewSessionCap: 3, queueStrategy: 'overdue' });
    running = await startReviewServer(root);

    const due = await (await fetch(`${running.url}/api/due`)).json();
    expect(due).toMatchObject({ total: 3, totalDue: 5, remaining: 2 });
    expect(due.cards.map((card: { id: string }) => card.id)).toEqual(['b1', 'a1', 'b2']);
    expect(new Set(due.cards.map((card: { id: string }) => card.id))).toEqual(new Set(['a1', 'b1', 'b2']));

    const start = await (await fetch(`${running.url}/api/session/start`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    })).json();
    expect(start).toMatchObject({ current: { card: { id: 'b1' } }, plannedCount: 3, backlog: 2 });
  });

  it('keeps authored order for lesson, study_once, and retry_missed sibling plans', async () => {
    running = await startReviewServer(await seedSiblingReview());
    for (const body of [
      { lessonSetId: 'siblings' },
      { mode: 'study_once', setIds: ['siblings'] },
      { mode: 'retry_missed', setIds: ['siblings'] },
    ]) {
      const started = await (await fetch(`${running.url}/api/session/start`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      })).json();
      expect(started.current.card.id).toBe('a1');
    }
  });

  it('archives a card through the API and finds it in archived search', async () => {
    running = await startReviewServer(await seed());
    const card = (await (await fetch(`${running.url}/api/due`)).json()).cards[0];
    const response = await fetch(`${running.url}/api/card/archive`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ setId: card.setId, cardId: card.id }),
    });
    expect(response.status).toBe(200);
    expect((await (await fetch(`${running.url}/api/due`)).json()).total).toBe(0);
    const hits = await (await fetch(`${running.url}/api/cards?q=union&archived=1`)).json();
    expect(hits.cards).toMatchObject([{ cardId: card.id, status: 'archived' }]);
  });

  it('/api/session lifecycle advances FSRS and drops the card from the due queue', async () => {
    running = await startReviewServer(await seed());
    const due = await (await fetch(`${running.url}/api/due`)).json();
    const card = due.cards[0];

    // Start a session, grade through it, then end it.
    const start = await (await fetch(`${running.url}/api/session/start`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    })).json();
    expect(start).toMatchObject({ ok: true, revision: 0, current: { card: { id: card.id } } });

    const graded = await (await fetch(`${running.url}/api/session/grade`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId: start.sessionId, requestId: 'grade-1', revision: start.revision,
        entryId: start.current.entryId, cardId: card.id, setId: card.setId, rating: 3,
      }),
    })).json();
    expect(graded).toMatchObject({ ok: true, requestId: 'grade-1', revision: 1, resultClass: 'scheduled' });
    expect(new Date(graded.due).getTime()).toBeGreaterThan(Date.now());

    const replay = await (await fetch(`${running.url}/api/session/grade`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId: start.sessionId, requestId: 'grade-1', revision: start.revision,
        entryId: start.current.entryId, cardId: card.id, setId: card.setId, rating: 3,
      }),
    })).json();
    expect(replay).toMatchObject({ ok: true, replayed: true, revision: 1 });

    const resumed = await (await fetch(`${running.url}/api/session/${start.sessionId}`)).json();
    expect(resumed).toMatchObject({ ok: true, sessionId: start.sessionId, revision: 1, current: null });

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

  it('does not keep a completed lesson session resumable', async () => {
    running = await startReviewServer(await seedTwoSets(1));
    const start = await (await fetch(`${running.url}/api/session/start`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lessonSetId: 'beta' }),
    })).json();
    const graded = await (await fetch(`${running.url}/api/session/grade`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(gradeBody(start, start.current.card, { requestId: 'complete-beta' })),
    })).json();
    expect(graded.state).toMatchObject({ current: null, remaining: 0, resumable: false });
  });

  it('keeps scheduled Review as the only Review action on populated Home', async () => {
    const root = await seedTwoSets(2);
    running = await startReviewServer(root);
    const start = await (await fetch(`${running.url}/api/session/start`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lessonSetId: 'alpha' }),
    })).json();
    await fetch(`${running.url}/api/session/grade`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(gradeBody(start, start.current.card, { requestId: 'progress-alpha' })),
    });
    const home = await (await fetch(`${running.url}/`)).text();
    expect(home).toContain('<h2>In progress</h2>');
    expect(home).toMatch(/Review \d+ now/);
    expect(home).not.toMatch(/Review \d+ due/);
  });

  it('advances an archived planned card and returns the next authoritative entry', async () => {
    const root = await seedMany(2);
    running = await startReviewServer(root);
    const start = await (await fetch(`${running.url}/api/session/start`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    })).json();
    const first = start.current.card;
    const archived = await fetch(`${running.url}/api/card/archive`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ setId: first.setId, cardId: first.id }),
    });
    expect(archived.status).toBe(200);

    const response = await fetch(`${running.url}/api/session/grade`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(gradeBody(start, first, { requestId: 'archived-current' })),
    });
    const skipped = await response.json();
    expect(response.status).toBe(409);
    expect(skipped).toMatchObject({
      ok: false, code: 'card_unavailable',
      state: { revision: 1, unresolved: 1, summary: { reviewedCount: 0, unresolved: 1 } },
    });
    expect(skipped.state.current.card.id).not.toBe(first.id);

    const ended = await (await fetch(`${running.url}/api/session/end`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: start.sessionId }),
    })).json();
    expect(ended).toMatchObject({ ok: true, summary: { reviewedCount: 0, unresolved: 1 } });
  });

  it('advances an archived current card while resuming without a grade request', async () => {
    const root = await seedMany(2);
    running = await startReviewServer(root);
    const start = await (await fetch(`${running.url}/api/session/start`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    })).json();
    const first = start.current.card;
    await fetch(`${running.url}/api/card/archive`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ setId: first.setId, cardId: first.id }),
    });

    const resumed = await (await fetch(`${running.url}/api/session/${start.sessionId}`)).json();
    expect(resumed).toMatchObject({
      ok: true, revision: 1, unresolved: 1,
      summary: { reviewedCount: 0, unresolved: 1 },
    });
    expect(resumed.current.card.id).not.toBe(first.id);
  });

  it('recovers a prepared grade before traversing an archived next entry on GET', async () => {
    const root = await seedMany(3);
    const now = new Date('2026-08-05T12:00:00.000Z');
    const session = startPlannedSession(
      'recommended', 'review_due', await getDueCards(root, now), undefined, now,
    );
    const [first, second, third] = session.plan!.entries;
    await expect(gradePlannedSession(root, session, {
      requestId: 'prepared-before-get', revision: 0, entryId: first.id,
      setId: first.setId, cardId: first.cardId, rating: 3,
    }, now, { afterIntent: () => { throw new Error('simulated crash'); } }))
      .rejects.toThrow('simulated crash');
    await archiveCard(root, second.setId, second.cardId, new Date('2026-08-05T12:00:30.000Z'));

    running = await startReviewServer(root);
    const resumed = await (await fetch(`${running.url}/api/session/${session.id}`)).json();
    expect(resumed).toMatchObject({
      ok: true, revision: 2,
      current: { entryId: third.id, card: { id: third.cardId } },
      summary: { reviewedCount: 1, unresolved: 1 },
    });
  });

  it('skips an archived next entry before returning a successful grade response', async () => {
    const root = await seedMany(3);
    running = await startReviewServer(root);
    const start = await (await fetch(`${running.url}/api/session/start`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    })).json();
    const session = await (await fetch(`${running.url}/api/session/${start.sessionId}`)).json();
    const days = await readdir(join(root, 'profile', 'sessions'));
    const files = await readdir(join(root, 'profile', 'sessions', days[0]));
    const persisted = JSON.parse(await readFile(
      join(root, 'profile', 'sessions', days[0], files.find((file) => file.startsWith('session_'))!), 'utf8',
    )) as ReviewSession;
    const next = persisted.plan!.entries[1];
    await archiveCard(root, next.setId, next.cardId);

    const response = await fetch(`${running.url}/api/session/grade`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(gradeBody(session, start.current.card, { requestId: 'skip-next' })),
    });
    const graded = await response.json();
    expect(response.status).toBe(200);
    expect(graded.state).toMatchObject({ revision: 2, unresolved: 1 });
    expect(graded.state.current).not.toBeNull();
    expect(graded.state.current.card.id).not.toBe(next.cardId);
  });

  it('traverses adjacent archived entries before returning a rejected grade state', async () => {
    const root = await seedMany(3);
    running = await startReviewServer(root);
    const start = await (await fetch(`${running.url}/api/session/start`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    })).json();
    const days = await readdir(join(root, 'profile', 'sessions'));
    const files = await readdir(join(root, 'profile', 'sessions', days[0]));
    const path = join(root, 'profile', 'sessions', days[0], files.find((file) => file.startsWith('session_'))!);
    const persisted = JSON.parse(await readFile(path, 'utf8')) as ReviewSession;
    for (const entry of persisted.plan!.entries.slice(0, 2)) {
      await archiveCard(root, entry.setId, entry.cardId);
    }
    const response = await fetch(`${running.url}/api/session/grade`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(gradeBody(start, start.current.card, { requestId: 'adjacent-archived' })),
    });
    const rejected = await response.json();
    expect(response.status).toBe(409);
    expect(rejected).toMatchObject({
      code: 'card_unavailable', state: { revision: 2, unresolved: 2, remaining: 1 },
    });
    expect(rejected.state.current.card.id).toBe(persisted.plan!.entries[2].cardId);
  });

  it('evicts the active cache when writer ownership is lost before GET', async () => {
    const root = await seedMany(2);
    let owned = true;
    const writer = {
      get owned() { return owned; },
      assertOwnership: async () => {
        if (!owned) throw new SessionWriterError('session_writer_lost', 'demoted');
      },
      release: async () => {},
    };
    running = await startReviewServer(root, 0, { sessionWriter: writer });
    const start = await (await fetch(`${running.url}/api/session/start`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    })).json();
    const days = await readdir(join(root, 'profile', 'sessions'));
    const files = await readdir(join(root, 'profile', 'sessions', days[0]));
    const path = join(root, 'profile', 'sessions', days[0], files.find((file) => file.startsWith('session_'))!);
    const disk = JSON.parse(await readFile(path, 'utf8')) as ReviewSession;
    disk.plan!.revision = 41;
    await writeFile(path, `${JSON.stringify(disk, null, 2)}\n`, 'utf8');
    owned = false;

    const response = await fetch(`${running.url}/api/session/${start.sessionId}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ revision: 41 });
  });

  it('recovers a prepared grade after ownership is lost between intent and card write', async () => {
    const root = await seed();
    let owned = true;
    let assertions = 0;
    let failAt = Number.POSITIVE_INFINITY;
    const writer = {
      get owned() { return owned; },
      assertOwnership: async () => {
        assertions += 1;
        if (assertions === failAt) {
          owned = false;
          throw new SessionWriterError('session_writer_lost', 'demoted after intent');
        }
      },
      release: async () => {},
    };
    running = await startReviewServer(root, 0, { sessionWriter: writer });
    const start = await (await fetch(`${running.url}/api/session/start`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    })).json();
    const before = (await getDueCards(root))[0];
    assertions = 0;
    failAt = 3; // route admission, intent guard, then pre-card guard
    const response = await fetch(`${running.url}/api/session/grade`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(gradeBody(start, start.current.card, { requestId: 'ownership-loss' })),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'session_writer_lost' });
    expect((await getDueCards(root))[0].fsrs).toEqual(before.fsrs);

    const days = await readdir(join(root, 'profile', 'sessions'));
    const files = await readdir(join(root, 'profile', 'sessions', days[0]));
    const path = join(root, 'profile', 'sessions', days[0], files.find((file) => file.startsWith('session_'))!);
    expect((JSON.parse(await readFile(path, 'utf8')) as ReviewSession).pendingTransition?.requestId)
      .toBe('ownership-loss');

    await running.close();
    running = await startReviewServer(root);
    const recovered = await (await fetch(`${running.url}/api/session/${start.sessionId}`)).json();
    expect(recovered).toMatchObject({ ok: true, summary: { reviewedCount: 1 } });
    expect((await getDueCards(root)).find((card) => card.id === before.id)).toBeUndefined();
  });

  it.each(['get', 'grade-replay'] as const)(
    'serializes %s pending-card recovery against archive',
    async (entryPoint) => {
      const root = await seedMany(2);
      const now = new Date('2026-08-05T12:00:00.000Z');
      const session = startPlannedSession(
        'recommended', 'review_due', await getDueCards(root, now), undefined, now,
      );
      const [first, second] = session.plan!.entries;
      const replayBody = {
        sessionId: session.id, requestId: 'first-complete', revision: 0, entryId: first.id,
        setId: first.setId, cardId: first.cardId, rating: 3 as const,
      };
      let pending = first;
      if (entryPoint === 'grade-replay') {
        await gradePlannedSession(root, session, replayBody, now);
        pending = second;
      }
      await expect(gradePlannedSession(root, session, {
        requestId: 'prepared-for-race', revision: session.plan!.revision, entryId: pending.id,
        setId: pending.setId, cardId: pending.cardId, rating: 3,
      }, new Date('2026-08-05T12:01:00.000Z'), {
        afterIntent: () => { throw new Error('simulated crash'); },
      })).rejects.toThrow('simulated crash');

      let assertions = 0;
      let resumeRecovery!: () => void;
      let archiveAdmitted!: () => void;
      const recoveryBarrier = new Promise<void>((resolve) => { resumeRecovery = resolve; });
      const archiveReady = new Promise<void>((resolve) => { archiveAdmitted = resolve; });
      const writer = {
        owned: true,
        assertOwnership: async () => {
          assertions += 1;
          if (assertions === 2) await recoveryBarrier;
          if (assertions === 3) archiveAdmitted();
        },
        release: async () => {},
      };
      running = await startReviewServer(root, 0, { sessionWriter: writer });
      const recovery = entryPoint === 'get'
        ? fetch(`${running.url}/api/session/${session.id}`)
        : fetch(`${running.url}/api/session/grade`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify(replayBody),
        });
      const archive = fetch(`${running.url}/api/card/archive`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ setId: pending.setId, cardId: pending.cardId }),
      });
      await archiveReady;
      resumeRecovery();
      expect((await recovery).status).toBe(200);
      expect((await archive).status).toBe(200);
      expect(await loadCard(root, pending.setId, pending.cardId)).toMatchObject({ status: 'archived' });
    },
  );

  it('keeps a definitive stale Grade non-retryable when state projection loses ownership', async () => {
    const root = await seed();
    let assertions = 0;
    let armed = false;
    const writer = {
      owned: true,
      assertOwnership: async () => {
        assertions += 1;
        if (armed && assertions === 2) {
          throw new SessionWriterError('session_writer_lost', 'lost while preparing conflict state');
        }
      },
      release: async () => {},
    };
    running = await startReviewServer(root, 0, { sessionWriter: writer });
    const start = await (await fetch(`${running.url}/api/session/start`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    })).json();
    armed = true;
    assertions = 0;
    await archiveCard(root, start.current.card.setId, start.current.card.id);
    const response = await fetch(`${running.url}/api/session/grade`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(gradeBody(start, start.current.card, { revision: -1 })),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual(expect.objectContaining({
      ok: false, code: 'stale_revision', retryable: false,
    }));
  });

  it('keeps a definitive stale Undo non-retryable when state projection loses ownership', async () => {
    const root = await seedMany(2);
    let assertions = 0;
    let armed = false;
    const writer = {
      owned: true,
      assertOwnership: async () => {
        assertions += 1;
        if (armed && assertions === 2) {
          throw new SessionWriterError('session_writer_lost', 'lost while preparing undo conflict state');
        }
      },
      release: async () => {},
    };
    running = await startReviewServer(root, 0, { sessionWriter: writer });
    const start = await (await fetch(`${running.url}/api/session/start`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    })).json();
    const graded = await (await fetch(`${running.url}/api/session/grade`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(gradeBody(start, start.current.card, { requestId: 'before-undo-conflict' })),
    })).json();
    await archiveCard(root, graded.state.current.card.setId, graded.state.current.card.id);
    assertions = 0;
    armed = true;

    const response = await fetch(`${running.url}/api/session/undo`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId: start.sessionId, requestId: 'stale-undo-projection', revision: -1,
        entryId: graded.entryId, gradeRequestId: graded.requestId,
      }),
    });
    expect(response.status).toBe(409);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual(expect.objectContaining({
      ok: false, code: 'stale_revision', retryable: false,
    }));
  });

  it('reports a committed Grade as success when ownership is lost during projection', async () => {
    const root = await seedMany(2);
    let assertions = 0;
    let armed = false;
    const writer = {
      owned: true,
      assertOwnership: async () => {
        assertions += 1;
        if (armed && assertions === 5) {
          throw new SessionWriterError('session_writer_lost', 'lost after committed grade');
        }
      },
      release: async () => {},
    };
    running = await startReviewServer(root, 0, { sessionWriter: writer });
    const start = await (await fetch(`${running.url}/api/session/start`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    })).json();
    const days = await readdir(join(root, 'profile', 'sessions'));
    const files = await readdir(join(root, 'profile', 'sessions', days[0]));
    const path = join(root, 'profile', 'sessions', days[0], files.find((file) => file.startsWith('session_'))!);
    const disk = JSON.parse(await readFile(path, 'utf8')) as ReviewSession;
    const next = disk.plan!.entries[1];
    await archiveCard(root, next.setId, next.cardId);
    assertions = 0;
    armed = true;

    const response = await fetch(`${running.url}/api/session/grade`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(gradeBody(start, start.current.card, { requestId: 'committed-before-loss' })),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true, requestId: 'committed-before-loss',
      state: { summary: { reviewedCount: 1 } },
    });
    expect((JSON.parse(await readFile(path, 'utf8')) as ReviewSession).events).toHaveLength(1);
  });

  it('recovers a pending Grade card before an Undo selects its target', async () => {
    const root = await seedMany(2);
    const now = new Date('2026-08-05T12:00:00.000Z');
    const session = startPlannedSession(
      'recommended', 'review_due', await getDueCards(root, now), undefined, now,
    );
    const [first, second] = session.plan!.entries;
    await gradePlannedSession(root, session, {
      requestId: 'first-before-pending', revision: 0, entryId: first.id,
      setId: first.setId, cardId: first.cardId, rating: 3,
    }, now);
    await expect(gradePlannedSession(root, session, {
      requestId: 'pending-second', revision: 1, entryId: second.id,
      setId: second.setId, cardId: second.cardId, rating: 3,
    }, new Date('2026-08-05T12:01:00.000Z'), {
      afterIntent: () => { throw new Error('simulated crash'); },
    })).rejects.toThrow('simulated crash');

    running = await startReviewServer(root);
    const response = await fetch(`${running.url}/api/session/undo`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId: session.id, requestId: 'undo-during-pending', revision: 1,
        entryId: first.id, gradeRequestId: 'first-before-pending',
      }),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: 'stale_revision', state: { revision: 2, summary: { reviewedCount: 2 } },
    });
    const recovered = await (await fetch(`${running.url}/api/session/${session.id}`)).json();
    expect(recovered).toMatchObject({ revision: 2, summary: { reviewedCount: 2 } });
  });

  it('keeps a persisted legacy session readable and endable but refuses grade and undo', async () => {
    const root = await seed();
    const startedAt = '2026-08-05T10:00:00.000Z';
    const legacy: ReviewSession = {
      id: 'legacy-http', startedAt, mode: 'recommended', events: [],
      summary: { reviewedCount: 0, distinctCardCount: 0, again: 0, hard: 0, good: 0, easy: 0 },
    };
    const dir = join(root, 'profile', 'sessions', '2026-08-05');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'session_2026-08-05T10-00-00-000Z.json'), `${JSON.stringify(legacy, null, 2)}\n`, 'utf8');
    running = await startReviewServer(root);

    expect(await (await fetch(`${running.url}/api/session/${legacy.id}`)).json()).toMatchObject({
      ok: true, sessionId: legacy.id, mode: null, current: null, resumable: false,
    });
    const grade = await fetch(`${running.url}/api/session/grade`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId: legacy.id, requestId: 'legacy-grade', revision: 0, entryId: 'legacy-entry',
        setId: 'server-deck', cardId: 'legacy-card', rating: 3,
      }),
    });
    expect(grade.status).toBe(409);
    expect(await grade.json()).toMatchObject({ code: 'legacy_session' });
    const undo = await fetch(`${running.url}/api/session/undo`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId: legacy.id, requestId: 'legacy-undo', revision: 0,
        entryId: 'legacy-entry', gradeRequestId: 'legacy-grade',
      }),
    });
    expect(undo.status).toBe(409);
    expect(await undo.json()).toMatchObject({ code: 'legacy_session' });
    const ended = await (await fetch(`${running.url}/api/session/end`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: legacy.id }),
    })).json();
    expect(ended).toMatchObject({ ok: true, sessionId: legacy.id, ended: true });
  });

  it('isolates a malformed persisted session file during lookup', async () => {
    const root = await seed();
    const dir = join(root, 'profile', 'sessions', '2026-08-05');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'session_broken.json'), '{not json', 'utf8');
    running = await startReviewServer(root);

    const response = await fetch(`${running.url}/api/session/missing`);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ ok: false, error: 'session not found' });
  });

  it('reports the pre-cap review backlog in the planned session view', async () => {
    const root = await seedMany(5);
    await saveUserPreferences(root, { reviewSessionCap: 3, queueStrategy: 'interleaved' });
    running = await startReviewServer(root);
    const start = await (await fetch(`${running.url}/api/session/start`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    })).json();
    expect(start).toMatchObject({ ok: true, plannedCount: 3, remaining: 3, backlog: 2 });
  });

  it('traverses a first card archived between fresh selection and Start projection', async () => {
    const root = await seedMany(2);
    let assertions = 0;
    let releasePersist!: () => void;
    let enteredPersist!: () => void;
    const persistBarrier = new Promise<void>((resolve) => { releasePersist = resolve; });
    const persistEntered = new Promise<void>((resolve) => { enteredPersist = resolve; });
    const writer = {
      owned: true,
      assertOwnership: async () => {
        assertions += 1;
        if (assertions === 2) {
          enteredPersist();
          await persistBarrier;
        }
      },
      release: async () => {},
    };
    running = await startReviewServer(root, 0, { sessionWriter: writer });
    const due = await (await fetch(`${running.url}/api/due`)).json();
    const first = due.cards[0];
    const startPromise = fetch(`${running.url}/api/session/start`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    });
    await persistEntered;
    const archived = await fetch(`${running.url}/api/card/archive`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ setId: first.setId, cardId: first.id }),
    });
    expect(archived.status).toBe(200);
    releasePersist();

    const response = await startPromise;
    expect(response.status).toBe(200);
    const started = await response.json();
    expect(started).toMatchObject({ ok: true, revision: 1, remaining: 1 });
    expect(started.current.card.id).not.toBe(first.id);
  });

  it('reports durable Start success when ownership is lost during initial projection', async () => {
    const root = await seedMany(2);
    let assertions = 0;
    let releasePersist!: () => void;
    let enteredPersist!: () => void;
    const persistBarrier = new Promise<void>((resolve) => { releasePersist = resolve; });
    const persistEntered = new Promise<void>((resolve) => { enteredPersist = resolve; });
    const writer = {
      owned: true,
      assertOwnership: async () => {
        assertions += 1;
        if (assertions === 2) {
          enteredPersist();
          await persistBarrier;
        }
        if (assertions === 3) {
          throw new SessionWriterError('session_writer_lost', 'lost during initial projection');
        }
      },
      release: async () => {},
    };
    running = await startReviewServer(root, 0, { sessionWriter: writer });
    const due = await (await fetch(`${running.url}/api/due`)).json();
    const first = due.cards[0];
    const startPromise = fetch(`${running.url}/api/session/start`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requestId: 'durable-start-projection' }),
    });
    await persistEntered;
    await archiveCard(root, first.setId, first.id);
    releasePersist();

    const response = await startPromise;
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    const started = await response.json();
    expect(started).toMatchObject({
      ok: true, current: null, remaining: 2, summary: { reviewedCount: 0 },
    });
    const replay = await fetch(`${running.url}/api/session/start`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requestId: 'durable-start-projection' }),
    });
    expect(replay.status).toBe(200);
    const replayed = await replay.json();
    expect(replayed).toMatchObject({ ok: true, replayed: true, revision: 1, remaining: 1 });
    expect(replayed.current.card.id).not.toBe(first.id);
  });

  it('reports distinct first-pass cards separately from revisit workload', async () => {
    running = await startReviewServer(await seedMany(2));
    const start = await (await fetch(`${running.url}/api/session/start`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    })).json();
    const first = start.current.card;
    const graded = await (await fetch(`${running.url}/api/session/grade`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(gradeBody(start, first, { rating: 1 })),
    })).json();

    expect(graded.requeued).toBe(true);
    expect(graded.state).toMatchObject({ remaining: 1, revisitRemaining: 1 });
    expect(graded.state.summary.unresolved).toBe(0);
  });

  it('replays one durable start across concurrent retries and a server restart', async () => {
    const root = await seedMany(2);
    running = await startReviewServer(root);
    const body = JSON.stringify({ requestId: 'start-replay-1', mode: 'review_due' });
    const request = () => fetch(`${running.url}/api/session/start`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body,
    }).then((response) => response.json());
    const [first, second] = await Promise.all([request(), request()]);
    expect(first.sessionId).toBe(second.sessionId);
    expect([first.replayed, second.replayed].filter(Boolean)).toHaveLength(1);
    const sessionId = first.sessionId;
    const days = await readdir(join(root, 'profile', 'sessions'));
    const files = await readdir(join(root, 'profile', 'sessions', days[0]));
    expect(files.filter((file) => file.startsWith('session_'))).toHaveLength(1);

    await running.close();
    await archiveCard(root, first.current.card.setId, first.current.card.id, new Date());
    running = await startReviewServer(root);
    const replay = await request();
    expect(replay).toMatchObject({
      ok: true, sessionId, replayed: true, remaining: 1,
      summary: { unresolved: 1 },
    });
    expect(replay.current.card.id).not.toBe(first.current.card.id);

    const conflict = await fetch(`${running.url}/api/session/start`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requestId: 'start-replay-1', mode: 'study_once' }),
    });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ ok: false, code: 'request_id_conflict' });
  });

  it('serializes Start replay with Grade and preserves the committed grade', async () => {
    const root = await seedMany(2);
    running = await startReviewServer(root);
    const startBody = JSON.stringify({ requestId: 'start-grade-race', mode: 'review_due' });
    const start = await (await fetch(`${running.url}/api/session/start`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: startBody,
    })).json();
    const [grade, replay] = await Promise.all([
      fetch(`${running.url}/api/session/grade`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(gradeBody(start, start.current.card)),
      }).then((response) => response.json()),
      fetch(`${running.url}/api/session/start`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: startBody,
      }).then((response) => response.json()),
    ]);
    expect(grade).toMatchObject({ ok: true, revision: 1 });
    expect(replay).toMatchObject({ ok: true, sessionId: start.sessionId, replayed: true });
    const current = await (await fetch(`${running.url}/api/session/${encodeURIComponent(start.sessionId)}`)).json();
    expect(current).toMatchObject({ ok: true, revision: 1, summary: { reviewedCount: 1 } });
  });

  it('never resurrects a card when archive and Grade race', async () => {
    const root = await seedMany(2);
    running = await startReviewServer(root);
    const start = await (await fetch(`${running.url}/api/session/start`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    })).json();
    const card = start.current.card;
    const [gradeResponse, archiveResponse] = await Promise.all([
      fetch(`${running.url}/api/session/grade`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(gradeBody(start, card)),
      }),
      fetch(`${running.url}/api/card/archive`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ setId: card.setId, cardId: card.id }),
      }),
    ]);
    expect(archiveResponse.status).toBe(200);
    expect([200, 409]).toContain(gradeResponse.status);
    expect(await loadCard(root, card.setId, card.id)).toMatchObject({ status: 'archived' });
  });

  it('/api/session/undo restores the last grade exactly', async () => {
    running = await startReviewServer(await seed());
    const card = (await (await fetch(`${running.url}/api/due`)).json()).cards[0];
    const start = await (await fetch(`${running.url}/api/session/start`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    })).json();
    const grade = await (await fetch(`${running.url}/api/session/grade`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(gradeBody(start, card)),
    })).json();
    const undoBody = {
      sessionId: start.sessionId, requestId: 'undo-http', revision: grade.revision,
      entryId: grade.entryId, gradeRequestId: grade.requestId,
    };

    const undoResponse = await fetch(`${running.url}/api/session/undo`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(undoBody),
    });
    const undo = await undoResponse.json();
    expect(undoResponse.status).toBe(200);
    expect(undo).toMatchObject({ ok: true, cardId: card.id, requestId: 'undo-http' });
    const replay = await (await fetch(`${running.url}/api/session/undo`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(undoBody),
    })).json();
    expect(replay).toMatchObject({ ok: true, replayed: true, requestId: 'undo-http' });
    expect((await (await fetch(`${running.url}/api/due`)).json()).total).toBe(1);

    const ended = await (await fetch(`${running.url}/api/session/end`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: start.sessionId }),
    })).json();
    expect(ended.summary).toMatchObject({ reviewedCount: 0, distinctCardCount: 0, good: 0 });
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
      body: JSON.stringify(gradeBody(start, card, { confidence: 4 })),
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
      body: JSON.stringify(gradeBody(start, card, {
        attempt: { interaction: 'self_response', responseText: 'a union is one of several', revealedFull: true, elapsedMs: 3100 },
      })),
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
      body: JSON.stringify(gradeBody(start, card, {
        attempt: { interaction: 'parsons', orderedBlockIds: ['guard', 'use', 'close'], correct: true, elapsedMs: 5200 },
      })),
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
    expect(start.mode).toBe('study_once');
    const graded = await (await fetch(`${running.url}/api/session/grade`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(gradeBody(start, start.current.card, { rating: 1 })),
    })).json();
    expect(graded).toMatchObject({ ok: true, resultClass: 'scheduled' });
    expect(graded.requeued).toBeUndefined();
    expect(graded.state.revisitRemaining).toBe(0);
  });

  it('rejects a revisit-producing mode combined with lessonSetId', async () => {
    running = await startReviewServer(await seed());
    const response = await fetch(`${running.url}/api/session/start`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lessonSetId: 'server-deck', mode: 'retry_missed' }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false, error: 'lessonSetId only supports study_once mode',
    });
  });

  it('Study once selects active scoped cards in authored order regardless of due date', async () => {
    const root = await seedMany(2);
    running = await startReviewServer(root);
    const lesson = await (await fetch(`${running.url}/api/lesson?set=many`)).json();
    const review = await (await fetch(`${running.url}/api/session/start`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    })).json();
    await fetch(`${running.url}/api/session/grade`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(gradeBody(review, review.current.card)),
    });
    expect((await (await fetch(`${running.url}/api/due`)).json()).total).toBe(1);

    const focused = await (await fetch(`${running.url}/api/session/start`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'study_once', setIds: ['many'] }),
    })).json();
    expect(focused).toMatchObject({ ok: true, mode: 'study_once' });
    expect(focused.current.card.id).toBe(lesson.cards[0].id);
  });

  it('continues a lesson beyond the 128-entry plan cap in authored chunks', async () => {
    const root = await seedMany(129);
    running = await startReviewServer(root);
    const lesson = await (await fetch(`${running.url}/api/lesson?set=many`)).json();
    let state = await (await fetch(`${running.url}/api/session/start`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lessonSetId: 'many' }),
    })).json();
    expect(state).toMatchObject({ plannedCount: 128, backlog: 1 });
    for (let index = 0; index < 128; index += 1) {
      const response = await fetch(`${running.url}/api/session/grade`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(gradeBody(state, state.current.card, { requestId: `lesson-${index}` })),
      });
      expect(response.status).toBe(200);
      const graded = await response.json();
      state = graded.state;
    }
    expect(state.current).toBeNull();
    await fetch(`${running.url}/api/session/end`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: state.sessionId }),
    });
    const next = await (await fetch(`${running.url}/api/session/start`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lessonSetId: 'many' }),
    })).json();
    expect(next).toMatchObject({ plannedCount: 1, backlog: 0 });
    expect(next.current.card.id).toBe(lesson.cards[128].id);
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
      body: JSON.stringify(gradeBody(start, { id: firstId, setId: res.setId })),
    })).json();
    expect(graded.ok).toBe(true);

    // After: one self-assessed pass, then resume at the second authored card.
    const after = await (await fetch(`${running.url}/api/lesson?set=${res.setId}`)).json();
    expect(after.progress).toMatchObject({
      state: 'in_progress', passedCount: 1, deterministicCount: 0,
      selfAssessedCount: 1, resumeCardId: secondId,
    });

    await fetch(`${running.url}/api/session/end`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: start.sessionId }),
    });
    const continued = await (await fetch(`${running.url}/api/session/start`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lessonSetId: res.setId }),
    })).json();
    expect(continued.current.card.id).toBe(secondId);

    // Home and Set expose honest evidence classes without mastery claims.
    const home = await get(`${running.url}/`);
    expect(home.text).toContain('Continue lesson');
    expect(home.text).toContain('0 deterministic recall');
    expect(home.text).toContain('1 self-assessed recall');
    const setPage = await get(`${running.url}/set/${res.setId}`);
    expect(setPage.text).toContain('0 deterministic recall');
    expect(setPage.text).toContain('1 self-assessed recall');
    expect(`${home.text}${setPage.text}`).not.toMatch(/Mastered|Ready|\d+% complete/);
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
      body: JSON.stringify(gradeBody(start, card, {
        attempt: { interaction: 'not_a_type', foo: 'bar' },
      })),
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
      body: JSON.stringify(gradeBody(start, card)),
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
