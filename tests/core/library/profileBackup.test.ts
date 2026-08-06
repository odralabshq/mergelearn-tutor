import { mkdir, mkdtemp, readFile, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { exportProfileBackup, inspectProfileBackup, restoreProfileBackup } from '../../../src/core/library/bundle.js';
import { installSampleLesson } from '../../../src/core/library/sampleLesson.js';
import { loadCardsForSet, saveCard } from '../../../src/core/library/cardStore.js';
import { loadSet, saveSet } from '../../../src/core/library/setStore.js';
import { endSession, gradeCard, startSession } from '../../../src/core/library/review/session.js';
import { getDueCards } from '../../../src/core/library/review/dueQueue.js';
import { listSessions } from '../../../src/core/library/review/sessionHistory.js';

async function fresh(prefix: string): Promise<string> { return mkdtemp(join(tmpdir(), prefix)); }

describe('private profile backup', () => {
  it('round-trips private state and replaces only with force', async () => {
    const source = await fresh('mlt-backup-source-');
    const now = new Date('2026-07-16T12:00:00Z');
    await installSampleLesson(source, { now });
    const ref = { sourceName: 'Example', sourceId: 'backup-ref', canonicalUrl: 'https://example.org/backup' };
    const sourceSet = (await loadSet(source, 'mergelearn-sample'))!;
    await saveSet(source, { ...sourceSet, problemRefs: [ref] });
    const authoredCard = (await loadCardsForSet(source, sourceSet.id))[0]!;
    await saveCard(source, { ...authoredCard, problemRefs: [ref] });
    const card = (await getDueCards(source, now))[0];
    const session = startSession('recommended', undefined, now);
    await gradeCard(source, session, card, 2, new Date('2026-07-16T12:01:00Z'));
    await endSession(source, session, new Date('2026-07-16T12:02:00Z'));
    await writeFile(join(source, 'config.json'), '{"theme":"dark"}\n');
    await mkdir(join(source, 'repos'), { recursive: true });
    await writeFile(join(source, 'repos', 'registry.json'), '{"repos":[{"root":"/private/local/path"}]}\n');

    const backup = join(await fresh('mlt-backup-output-'), 'profile.mergelearn-backup.zip');
    const manifest = await exportProfileBackup(source, backup, { now });
    expect(manifest.entryCount).toBeGreaterThan(4);
    expect((await stat(backup)).mode & 0o777).toBe(0o600);
    expect((await inspectProfileBackup(backup)).entryNames.some((name) => name.startsWith('profile/sessions/2026-07-16/session_'))).toBe(true);

    const expectedCard = (await loadCardsForSet(source, 'mergelearn-sample'))[0];
    const target = await fresh('mlt-backup-target-');
    await writeFile(join(target, 'stale.txt'), 'remove me');
    await expect(restoreProfileBackup(target, backup)).rejects.toThrow(/not empty/);
    await restoreProfileBackup(target, backup, { force: true });
    const restoredCard = (await loadCardsForSet(target, 'mergelearn-sample'))[0];
    expect(restoredCard.fsrs).toEqual(expectedCard.fsrs);
    expect(restoredCard.problemRefs).toEqual([ref]);
    expect((await loadSet(target, 'mergelearn-sample'))?.problemRefs).toEqual([ref]);
    expect(await listSessions(target)).toHaveLength(1);
    expect(await readFile(join(target, 'config.json'), 'utf8')).toBe('{"theme":"dark"}\n');
    expect(await readFile(join(target, 'repos', 'registry.json'), 'utf8')).toContain('/private/local/path');
    await expect(readFile(join(target, 'stale.txt'))).rejects.toThrow();
  });

  it('refuses to write a backup inside the profile root', async () => {
    const source = await fresh('mlt-backup-inside-');
    await installSampleLesson(source);
    await expect(exportProfileBackup(source, join(source, 'backup.zip'))).rejects.toThrow(/outside/);
  });

  it('refuses symlinks anywhere in the private backup allowlist', async () => {
    if (process.platform === 'win32') return;
    const source = await fresh('mlt-backup-symlink-');
    await installSampleLesson(source);
    const target = join(source, 'outside.txt');
    await writeFile(target, 'private');
    await mkdir(join(source, 'profile'), { recursive: true });
    await symlink(target, join(source, 'profile', 'linked.txt'));
    await expect(exportProfileBackup(source, join(await fresh('mlt-backup-symlink-out-'), 'backup.zip')))
      .rejects.toThrow(/refuses symlink/);
  });
});
