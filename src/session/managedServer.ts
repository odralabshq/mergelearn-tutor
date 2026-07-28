import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { appendDogfoodEvent } from '../core/library/dogfood.js';
import { startReviewServer, type ReviewServer } from './server.js';

export type ServerLock = {
  pid: number;
  port: number;
  instanceId: string;
  url: string;
  startedAt: string;
  managed: boolean;
};

export type EnsuredServer = { url: string; reused: boolean };
export type ManagedServer = EnsuredServer & { close: () => Promise<void> };
export type ManagedServerOptions = { idleMs?: number; pollMs?: number; port?: number };

const LOCK_FILE = 'server.json';
const CLAIM_FILE = 'server.starting';
const DEFAULT_IDLE_MS = 15 * 60 * 1000;

function lockPath(root: string): string { return join(root, LOCK_FILE); }
function claimPath(root: string): string { return join(root, CLAIM_FILE); }

export async function readServerLock(root: string): Promise<ServerLock | undefined> {
  try { return JSON.parse(await readFile(lockPath(root), 'utf8')) as ServerLock; }
  catch { return undefined; }
}

async function writeServerLock(root: string, lock: ServerLock): Promise<void> {
  await mkdir(root, { recursive: true });
  await writeFile(lockPath(root), `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
}

async function removeIfCurrent(root: string, instanceId: string): Promise<void> {
  const lock = await readServerLock(root);
  if (lock?.instanceId === instanceId) await rm(lockPath(root), { force: true });
}

export async function probeServer(lock: ServerLock): Promise<boolean> {
  try { process.kill(lock.pid, 0); } catch { return false; }
  try {
    const response = await fetch(`${lock.url}/health`, { signal: AbortSignal.timeout(500) });
    const health = await response.json() as { ok?: boolean; instanceId?: string };
    return response.ok && health.ok === true && health.instanceId === lock.instanceId;
  } catch { return false; }
}

export async function startManagedServer(root: string, options: ManagedServerOptions = {}): Promise<ManagedServer> {
  const instanceId = randomUUID();
  let lastActivityAt = Date.now();
  let closed = false;
  const idleMs = options.idleMs ?? DEFAULT_IDLE_MS;
  let closeServer: (() => Promise<void>) | undefined;
  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    await closeServer?.();
    await removeIfCurrent(root, instanceId);
  };
  const server: ReviewServer = await startReviewServer(root, options.port ?? 0, {
    instanceId,
    managed: true,
    onActivity: () => { lastActivityAt = Date.now(); },
    onLessonOpen: async (setId, source) => {
      lastActivityAt = Date.now();
      await appendDogfoodEvent(root, { kind: 'opened', setId, ...(source ? { source } : {}) });
    },
  });
  closeServer = server.close;
  const port = Number(new URL(server.url).port);
  await writeServerLock(root, { pid: process.pid, port, instanceId, url: server.url, startedAt: new Date().toISOString(), managed: true });
  const timer = setInterval(() => {
    if (Date.now() - lastActivityAt >= idleMs) void close();
  }, Math.min(30_000, idleMs));
  timer.unref();
  return { url: server.url, reused: false, close };
}

async function acquireClaim(root: string): Promise<() => Promise<void>> {
  await mkdir(root, { recursive: true });
  for (;;) {
    try {
      const handle = await open(claimPath(root), 'wx');
      return async () => { await handle.close(); await rm(claimPath(root), { force: true }); };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      try {
        const age = Date.now() - (await stat(claimPath(root))).mtimeMs;
        if (age > 5_000) await rm(claimPath(root), { force: true });
      } catch { /* Claim disappeared: retry. */ }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

function launchManagedChild(root: string, port?: number): void {
  // Preserve tsx/loader flags during development; a built CLI has no execArgv.
  const args = [...process.execArgv, process.argv[1], '--home', root, 'server-run'];
  if (port !== undefined) args.push('--port', String(port));
  const child = spawn(process.execPath, args, { detached: true, stdio: 'ignore' });
  child.unref();
}

export async function ensureServer(root: string, options: ManagedServerOptions = {}): Promise<EnsuredServer> {
  const existing = await readServerLock(root);
  if (existing && await probeServer(existing)) return { url: existing.url, reused: true };
  if (existing) await rm(lockPath(root), { force: true });

  const release = await acquireClaim(root);
  try {
    const raced = await readServerLock(root);
    if (raced && await probeServer(raced)) return { url: raced.url, reused: true };
    launchManagedChild(root, options.port);
    const deadline = Date.now() + 3_000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, options.pollMs ?? 50));
      const started = await readServerLock(root);
      if (started && await probeServer(started)) return { url: started.url, reused: false };
    }
    throw new Error('managed MergeLearn server did not become ready within 3 seconds');
  } finally {
    await release();
  }
}
