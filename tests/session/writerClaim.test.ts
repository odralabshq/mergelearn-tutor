import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp } from 'node:fs/promises';

import { describe, expect, it, vi } from 'vitest';

import {
  acquireSessionWriter, currentProcessStart, SessionWriterError,
  type ProcessInspection, type WriterIdentity,
} from '../../src/session/writerClaim.js';

const local = { hostId: 'host-a', pid: 101, processStart: 'start-a' };
const live = async (): Promise<ProcessInspection> => ({ alive: true, processStart: 'start-a', verifiable: true });
const pathFor = (root: string) => join(root, 'profile', 'session-writer.json');

async function root(): Promise<string> { return mkdtemp(join(tmpdir(), 'ml-writer-')); }
async function put(rootPath: string, value: WriterIdentity): Promise<void> {
  await mkdir(join(rootPath, 'profile'), { recursive: true });
  await writeFile(pathFor(rootPath), JSON.stringify(value), 'utf8');
}

function options(inspect: (pid: number) => Promise<ProcessInspection> = live) {
  return { identity: local, inspect };
}

describe('session writer ownership', () => {
  it('permits one owner, refuses a live peer, and transfers after owner cleanup', async () => {
    const home = await root();
    const first = await acquireSessionWriter(home, 'one', options());
    const second = await acquireSessionWriter(home, 'two', options());
    expect(first.owned).toBe(true);
    expect(second).toMatchObject({ owned: false, reason: 'another live server owns session writes' });
    await first.release();
    expect((await acquireSessionWriter(home, 'two', options())).owned).toBe(true);
  });

  it.each([
    ['dead pid', async () => ({ alive: false, verifiable: true })],
    ['recycled pid', async () => ({ alive: true, processStart: 'different', verifiable: true })],
  ])('recovers a same-host %s claim', async (_label, inspect) => {
    const home = await root();
    await put(home, { ...local, instanceId: 'old' });
    expect((await acquireSessionWriter(home, 'new', options(inspect))).owned).toBe(true);
  });

  it('does not reclaim a live owner whose process start used the runtime fallback', async () => {
    const home = await root();
    await put(home, { ...local, processStart: 'runtime-123', instanceId: 'old' });
    const claim = await acquireSessionWriter(home, 'new', options(async () => ({
      alive: true, processStart: 'Mon Aug  5 12:00:00 2026', verifiable: true,
    })));
    expect(claim).toMatchObject({ owned: false, reason: 'another live server owns session writes' });
    expect(JSON.parse(await readFile(pathFor(home), 'utf8'))).toMatchObject({
      processStart: 'runtime-123', instanceId: 'old',
    });
  });

  it('refuses foreign-host and unverifiable claims', async () => {
    const foreign = await root();
    await put(foreign, { ...local, hostId: 'host-b', instanceId: 'old' });
    expect((await acquireSessionWriter(foreign, 'new', options())).reason).toContain('another host');

    const unknown = await root();
    await put(unknown, { ...local, instanceId: 'old' });
    const claim = await acquireSessionWriter(unknown, 'new', options(async () => ({ alive: true, verifiable: false })));
    expect(claim).toMatchObject({
      owned: false, reason: 'writer process identity cannot be verified safely',
      reasonCode: 'session_writer_unavailable',
    });
    await expect(claim.assertOwnership()).rejects.toMatchObject({ code: 'session_writer_unavailable' });
    expect(claim).toMatchObject({
      reason: 'writer process identity cannot be verified safely',
      reasonCode: 'session_writer_unavailable',
    });
  });

  it('detects claim replacement and old cleanup preserves the replacement', async () => {
    const home = await root();
    const claim = await acquireSessionWriter(home, 'one', options());
    const replacement = { ...local, pid: 202, processStart: 'start-b', instanceId: 'two' };
    await put(home, replacement);
    await expect(claim.assertOwnership()).rejects.toEqual(expect.objectContaining<Partial<SessionWriterError>>({
      code: 'session_writer_lost',
    }));
    await claim.release();
    expect(JSON.parse(await readFile(pathFor(home), 'utf8'))).toEqual(replacement);
  });

  it('does not self-demote while a stale reclaimer briefly moves and restores its claim', async () => {
    const home = await root();
    const claim = await acquireSessionWriter(home, 'winner', options());
    const moved = `${pathFor(home)}.recover-racer`;
    await rename(pathFor(home), moved);
    const restore = new Promise<void>((resolve, reject) => {
      setTimeout(() => { rename(moved, pathFor(home)).then(() => resolve(), reject); }, 20);
    });
    await expect(claim.assertOwnership()).resolves.toBeUndefined();
    await restore;
    expect(claim.owned).toBe(true);
    await claim.release();
  });

  it('degrades an unverifiable local identity to an explicit read-only claim', async () => {
    const home = await root();
    const claim = await acquireSessionWriter(home, 'reader', {
      resolveIdentity: async () => { throw new Error('identity probe unavailable'); },
    });
    expect(claim).toMatchObject({
      owned: false, reason: 'identity probe unavailable', reasonCode: 'session_writer_unavailable',
    });
    await expect(claim.assertOwnership()).rejects.toMatchObject({
      code: 'session_writer_unavailable',
    });
  });

  it('degrades claim-file creation failure to an explicit read-only claim', async () => {
    const home = await root();
    const blockedRoot = join(home, 'not-a-directory');
    await writeFile(blockedRoot, 'file', 'utf8');
    const claim = await acquireSessionWriter(blockedRoot, 'reader', options(async () => ({
      alive: true, processStart: local.processStart, verifiable: true,
    })));
    expect(claim).toMatchObject({ owned: false, reasonCode: 'session_writer_unavailable' });
    await expect(claim.assertOwnership()).rejects.toMatchObject({
      code: 'session_writer_unavailable',
    });
  });

  it('allows exactly one winner when two servers reclaim the same stale claim', async () => {
    const home = await root();
    await put(home, { ...local, instanceId: 'old' });
    const dead = async (): Promise<ProcessInspection> => ({ alive: false, verifiable: true });
    const [first, second] = await Promise.all([
      acquireSessionWriter(home, 'one', options(dead)),
      acquireSessionWriter(home, 'two', options(dead)),
    ]);
    expect([first.owned, second.owned].filter(Boolean)).toHaveLength(1);
    const winner = first.owned ? first : second;
    const loser = first.owned ? second : first;
    await expect(winner.assertOwnership()).resolves.toBeUndefined();
    await expect(loser.assertOwnership()).rejects.toMatchObject({ code: 'session_writer_lost' });
    await winner.release();
  });

  it('ignores an abandoned recovery artifact when reclaiming a stale claim', async () => {
    const home = await root();
    await put(home, { ...local, instanceId: 'old' });
    await writeFile(join(home, 'profile', 'session-writer.recovery.lock'), 'orphan', 'utf8');
    const claim = await acquireSessionWriter(home, 'new', options(async () => ({
      alive: false, verifiable: true,
    })));
    expect(claim.owned).toBe(true);
    await expect(claim.assertOwnership()).resolves.toBeUndefined();
    await claim.release();
  });

  it('treats EPERM as alive but unverifiable rather than dead', async () => {
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => {
      const error = new Error('not permitted') as NodeJS.ErrnoException;
      error.code = 'EPERM';
      throw error;
    });
    try {
      await expect(currentProcessStart(123)).resolves.toEqual({ alive: true, verifiable: false });
    } finally {
      kill.mockRestore();
    }
  });
});
