import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildAuthoringContext } from '../../../src/core/library/authoringContext.js';
import { appendDogfoodEvent } from '../../../src/core/library/dogfood.js';
import { exportProfileBackup, restoreProfileBackup } from '../../../src/core/library/bundle.js';
import { importAgentSet } from '../../../src/core/library/importAgentSet.js';
import type { AgentSetPatch } from '../../../src/core/library/types.js';

const freshRoot = () => mkdtemp(join(tmpdir(), 'ml-skips-'));

const lesson = (id: string, title: string): AgentSetPatch => ({
  version: 1,
  set: { id, title, tagIds: [] },
  tagPatch: { reuse: [], add: [] },
  order: ['c1'],
  cards: [{
    localId: 'c1', tagRefs: [],
    front: { prompt: `Why does ${title} work this way?` },
    back: { shortAnswer: 'A mechanism.', explanationMarkdown: 'The cause is X.' },
  }],
} as AgentSetPatch);

describe('skip decisions are read back into authoring context', () => {
  it('reports recent skips newest first', async () => {
    const root = await freshRoot();
    await appendDogfoodEvent(root, { kind: 'skipped', task: 'bump deps', reason: 'routine' });
    await appendDogfoodEvent(root, { kind: 'skipped', task: 'fix typo', reason: 'no concept' });

    const ctx = await buildAuthoringContext(root, { recent: 5 });
    expect(ctx.recentSkips).toHaveLength(2);
    expect(ctx.recentSkips[0]!.task).toBe('fix typo');
    expect(ctx.recentSkips[0]!.reason).toBe('no concept');
  });

  it('is an empty list when nothing was skipped', async () => {
    expect((await buildAuthoringContext(await freshRoot(), { recent: 5 })).recentSkips).toEqual([]);
  });

  it('ignores non-skip trial events', async () => {
    const root = await freshRoot();
    await appendDogfoodEvent(root, { kind: 'opened', setId: 'some-set' });
    await appendDogfoodEvent(root, { kind: 'skipped', task: 'rename var', reason: 'mechanical' });

    const ctx = await buildAuthoringContext(root, { recent: 5 });
    expect(ctx.recentSkips).toHaveLength(1);
    expect(ctx.recentSkips[0]!.task).toBe('rename var');
  });

  it('honours the recent limit', async () => {
    const root = await freshRoot();
    for (let i = 0; i < 5; i += 1) {
      await appendDogfoodEvent(root, { kind: 'skipped', task: `task ${i}`, reason: 'r' });
    }
    expect((await buildAuthoringContext(root, { recent: 2 })).recentSkips).toHaveLength(2);
  });
});

describe('apply reports whether it created or merged', () => {
  it('marks a brand-new lesson as not merged', async () => {
    const res = await importAgentSet(await freshRoot(), lesson('fresh-set', 'Fresh set'));
    expect(res.ok).toBe(true);
    expect(res.mergedIntoExisting).toBe(false);
  });

  it('marks a second apply to the same id as merged', async () => {
    const root = await freshRoot();
    await importAgentSet(root, lesson('same-set', 'Same set'));
    const again = await importAgentSet(root, lesson('same-set', 'Same set'));
    expect(again.mergedIntoExisting).toBe(true);
  });

  it('reports the same verdict on a dry run, without writing', async () => {
    const root = await freshRoot();
    await importAgentSet(root, lesson('dry-set', 'Dry set'));
    const preview = await importAgentSet(root, lesson('dry-set', 'Dry set'), { dryRun: true });
    expect(preview.ok).toBe(true);
    // A dry run that cannot distinguish create from merge is how an unintended
    // merge stays invisible until the original content is gone.
    expect(preview.mergedIntoExisting).toBe(true);
  });
});

describe('restore --dry-run validates without demanding --force', () => {
  it('validates a backup against a NON-EMPTY profile', async () => {
    const source = await freshRoot();
    await importAgentSet(source, lesson('backup-me', 'Backup me'));
    const backup = join(await mkdtemp(join(tmpdir(), 'ml-backup-')), 'profile.mergelearn-backup.zip');
    await exportProfileBackup(source, backup);

    // Same root: definitely non-empty. Previously this threw, so the safe
    // rehearsal was impossible exactly where rehearsing matters.
    const manifest = await restoreProfileBackup(source, backup, { dryRun: true });
    expect(manifest.kind).toBe('profile_backup');
    expect(manifest.entryCount).toBeGreaterThan(0);
  });

  it('still refuses a REAL restore into a non-empty profile without force', async () => {
    const source = await freshRoot();
    await importAgentSet(source, lesson('guard-me', 'Guard me'));
    const backup = join(await mkdtemp(join(tmpdir(), 'ml-backup2-')), 'profile.mergelearn-backup.zip');
    await exportProfileBackup(source, backup);

    await expect(restoreProfileBackup(source, backup, {})).rejects.toThrow(/not empty/);
  });
});
