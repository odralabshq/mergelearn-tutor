import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { atomicWriteJson, saveStateSafe, StateConflictError } from '../../src/core/safeStore.js';
import { createEmptyState, statePath, saveState } from '../../src/core/store.js';

let dir = '';

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mlt-safestore-'));
});

describe('atomicWriteJson', () => {
  it('writes valid JSON and leaves no temp files behind', async () => {
    const target = join(dir, 'out.json');
    await atomicWriteJson(target, { a: 1 });
    expect(JSON.parse(await readFile(target, 'utf8'))).toEqual({ a: 1 });
    // No leftover temp files in the dir.
    const { readdir } = await import('node:fs/promises');
    const files = await readdir(dir);
    expect(files.filter((f) => f.startsWith('.tmp-'))).toEqual([]);
  });
});

describe('saveStateSafe (optimistic concurrency)', () => {
  it('writes when the expected version matches (fresh file: undefined)', async () => {
    const state = createEmptyState(dir);
    const saved = await saveStateSafe(dir, state, undefined);
    expect(saved.updatedAt).toBeTruthy();
    const onDisk = JSON.parse(await readFile(statePath(dir), 'utf8'));
    expect(onDisk.repoPath).toBe(saved.repoPath);
  });

  it('refuses a stale write when the on-disk version moved on', async () => {
    // Writer A establishes state.
    const first = await saveStateSafe(dir, createEmptyState(dir), undefined);
    // Writer B commits a newer state (simulating a concurrent run).
    await saveState(dir, { ...first, updatedAt: '2999-01-01T00:00:00.000Z' });
    // Writer A tries to save based on the OLD version it loaded -> conflict.
    await expect(saveStateSafe(dir, first, first.updatedAt)).rejects.toBeInstanceOf(StateConflictError);
  });

  it('succeeds again when the caller reloads the current version', async () => {
    const first = await saveStateSafe(dir, createEmptyState(dir), undefined);
    // Reload the true current version and write against it.
    const current = JSON.parse(await readFile(statePath(dir), 'utf8'));
    const saved = await saveStateSafe(dir, current, current.updatedAt);
    expect(saved.updatedAt).toBeTruthy();
  });

  it('stamps a fresh updatedAt on every successful save', async () => {
    const first = await saveStateSafe(dir, createEmptyState(dir), undefined);
    const current = JSON.parse(await readFile(statePath(dir), 'utf8'));
    await new Promise((r) => setTimeout(r, 5));
    const second = await saveStateSafe(dir, current, current.updatedAt);
    expect(second.updatedAt).not.toBe(first.updatedAt);
  });
});
