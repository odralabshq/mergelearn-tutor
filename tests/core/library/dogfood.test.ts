import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { appendDogfoodEvent, dogfoodEventCounts, listDogfoodEvents } from '../../../src/core/library/dogfood.js';

describe('dogfood records', () => {
  it('appends parseable local events and summarizes their kinds', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mlt-dogfood-'));
    await appendDogfoodEvent(root, { kind: 'opened', setId: 'auth', source: 'create-and-open' });
    await appendDogfoodEvent(root, { kind: 'feedback', setId: 'auth', worthAnswering: true, note: 'caught a bug' });
    await appendDogfoodEvent(root, { kind: 'deferred', setId: 'queues' });
    await appendDogfoodEvent(root, { kind: 'skipped', task: 'bump deps', reason: 'nothing to learn' });

    expect(await dogfoodEventCounts(root)).toEqual({ opened: 1, feedback: 1, deferred: 1, skipped: 1 });
    expect((await listDogfoodEvents(root)).map((event) => event.kind)).toEqual(['opened', 'feedback', 'deferred', 'skipped']);
  });

  it('rejects blank deliberate-skip data without writing a record', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mlt-dogfood-'));
    await expect(appendDogfoodEvent(root, { kind: 'skipped', task: ' ', reason: 'useful' }))
      .rejects.toThrow('task must not be empty');
    expect(await listDogfoodEvents(root)).toEqual([]);
  });

  it('returns an empty record list for a fresh library', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mlt-dogfood-'));
    expect(await listDogfoodEvents(root)).toEqual([]);
  });
});
