import { execFile } from 'node:child_process';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const CLAIM_FILE = 'session-writer.json';

export type WriterIdentity = {
  hostId: string;
  pid: number;
  processStart: string;
  instanceId: string;
};

export type ProcessInspection = {
  alive: boolean;
  processStart?: string;
  verifiable: boolean;
};

export class SessionWriterError extends Error {
  constructor(public readonly code: 'session_writer_unavailable' | 'session_writer_lost', message: string) {
    super(message);
    this.name = 'SessionWriterError';
  }
}

export type WriterClaimOptions = {
  identity?: Omit<WriterIdentity, 'instanceId'>;
  resolveIdentity?: (instanceId: string) => Promise<WriterIdentity>;
  inspect?: (pid: number) => Promise<ProcessInspection>;
};

export type SessionWriterClaim = {
  owned: boolean;
  reason?: string;
  reasonCode?: 'session_writer_unavailable' | 'session_writer_lost';
  assertOwnership: () => Promise<void>;
  release: () => Promise<void>;
};

function claimPath(root: string): string { return join(root, 'profile', CLAIM_FILE); }

export async function currentProcessStart(pid: number): Promise<ProcessInspection> {
  try { process.kill(pid, 0); }
  catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH'
      ? { alive: false, verifiable: true }
      : { alive: true, verifiable: false };
  }
  try {
    const { stdout } = await execFileAsync('/bin/ps', ['-o', 'lstart=', '-p', String(pid)]);
    const processStart = stdout.trim();
    return processStart ? { alive: true, processStart, verifiable: true }
      : { alive: true, verifiable: false };
  } catch { return { alive: true, verifiable: false }; }
}

async function ownIdentity(instanceId: string): Promise<WriterIdentity> {
  const inspected = await currentProcessStart(process.pid);
  const processStart = inspected.processStart
    ?? `runtime-${Math.round(Date.now() - process.uptime() * 1000)}`;
  return { hostId: hostname(), pid: process.pid, processStart, instanceId };
}

async function readClaim(root: string): Promise<WriterIdentity | undefined> {
  try { return JSON.parse(await readFile(claimPath(root), 'utf8')) as WriterIdentity; }
  catch { return undefined; }
}

async function createExclusive(root: string, identity: WriterIdentity): Promise<boolean> {
  await mkdir(join(root, 'profile'), { recursive: true });
  try {
    const handle = await open(claimPath(root), 'wx');
    try { await handle.writeFile(`${JSON.stringify(identity, null, 2)}\n`, 'utf8'); }
    finally { await handle.close(); }
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  }
}

function sameClaim(a: WriterIdentity | undefined, b: WriterIdentity): boolean {
  return !!a && a.hostId === b.hostId && a.pid === b.pid
    && a.processStart === b.processStart && a.instanceId === b.instanceId;
}

function unavailableClaim(error: unknown): SessionWriterClaim {
  const reason = error instanceof Error ? error.message : 'session writer claim cannot be created';
  return {
    owned: false, reason, reasonCode: 'session_writer_unavailable',
    assertOwnership: async () => {
      throw new SessionWriterError('session_writer_unavailable', reason);
    },
    release: async () => {},
  };
}

export async function acquireSessionWriter(
  root: string,
  instanceId: string,
  options: WriterClaimOptions = {},
): Promise<SessionWriterClaim> {
  let base: Omit<WriterIdentity, 'instanceId'>;
  try {
    const resolved = options.identity
      ? { ...options.identity, instanceId }
      : await (options.resolveIdentity ?? ownIdentity)(instanceId);
    base = resolved;
  } catch (error) { return unavailableClaim(error); }
  const identity: WriterIdentity = { ...base, instanceId };
  const inspect = options.inspect ?? currentProcessStart;
  let owned: boolean;
  try { owned = await createExclusive(root, identity); }
  catch (error) { return unavailableClaim(error); }
  let reason: string | undefined;
  let reasonCode: SessionWriterClaim['reasonCode'];

  if (!owned) {
    let existing = await readClaim(root);
    if (!existing) {
      try { owned = await createExclusive(root, identity); }
      catch (error) { return unavailableClaim(error); }
      if (!owned) existing = await readClaim(root);
    }
    if (owned) {
      // The previous owner released between our exclusive-create failure and read.
    }
    else if (!existing) {
      reason = 'writer claim exists but cannot be read safely';
      reasonCode = 'session_writer_unavailable';
    } else if (existing.hostId !== identity.hostId) {
      reason = 'writer belongs to another host';
      reasonCode = 'session_writer_unavailable';
    }
    else {
      const state = await inspect(existing.pid);
      const comparableStart = !existing.processStart.startsWith('runtime-')
        && !!state.processStart && !state.processStart.startsWith('runtime-');
      const stale = !state.alive || (state.verifiable && comparableStart
        && state.processStart !== existing.processStart);
      if (!state.verifiable) {
        reason = 'writer process identity cannot be verified safely';
        reasonCode = 'session_writer_unavailable';
      } else if (!stale) {
        reason = 'another live server owns session writes';
        reasonCode = 'session_writer_lost';
      }
      else {
        const recoveryPath = `${claimPath(root)}.recover-${process.pid}-${instanceId}`;
        try {
          await rename(claimPath(root), recoveryPath);
          const moved = await readFile(recoveryPath, 'utf8').then((value) => JSON.parse(value) as WriterIdentity);
          if (sameClaim(moved, existing)) {
            owned = await createExclusive(root, identity);
          } else if (!await readClaim(root)) {
            await rename(recoveryPath, claimPath(root));
          }
        } catch { /* another reclaimer won the atomic rename */ }
        finally { await rm(recoveryPath, { force: true }); }
        if (!owned) {
          reason = 'writer ownership changed during stale recovery';
          reasonCode = 'session_writer_lost';
        }
      }
    }
  }

  const assertOwnership = async (): Promise<void> => {
    let current = owned ? await readClaim(root) : undefined;
    // A stale reclaimer can briefly move the canonical file before discovering
    // that it moved a newer owner's claim and restoring it. Treat only absence
    // as transient; a different readable identity is definitive ownership loss.
    for (let attempt = 0; owned && !current && attempt < 4; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      current = await readClaim(root);
    }
    if (!owned) {
      const code = reasonCode ?? 'session_writer_unavailable';
      throw new SessionWriterError(code, reason ?? 'session writer is unavailable');
    }
    if (!sameClaim(current, identity)) {
      owned = false;
      reason = 'session writer ownership was lost; restart or use the active server';
      reasonCode = 'session_writer_lost';
      throw new SessionWriterError('session_writer_lost', reason);
    }
  };
  const release = async (): Promise<void> => {
    if (owned && sameClaim(await readClaim(root), identity)) await rm(claimPath(root), { force: true });
    owned = false;
  };
  return {
    get owned() { return owned; },
    get reason() { return reason; },
    get reasonCode() { return reasonCode; },
    assertOwnership,
    release,
  };
}
