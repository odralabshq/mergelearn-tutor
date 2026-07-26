import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strToU8, unzipSync, zipSync } from 'fflate';

import { describe, expect, it } from 'vitest';

import { installSampleLesson } from '../../../src/core/library/sampleLesson.js';
import { exportLessonBundle, importLessonBundle, inspectLessonBundle } from '../../../src/core/library/bundle.js';
import { loadCardsForSet, saveCard } from '../../../src/core/library/cardStore.js';
import { loadOrder, loadSet } from '../../../src/core/library/setStore.js';

async function fresh(prefix: string): Promise<string> { return mkdtemp(join(tmpdir(), prefix)); }

describe('lesson bundle', () => {
  it('round-trips content through a privacy-clean ZIP with fresh schedules', async () => {
    const source = await fresh('mlt-bundle-source-');
    await installSampleLesson(source, { now: new Date('2026-07-16T00:00:00Z') });
    const out = join(await fresh('mlt-bundle-out-'), 'sample.mergelearn.zip');
    await exportLessonBundle(source, 'mergelearn-sample', out, { now: new Date('2026-07-17T00:00:00Z') });

    const inspected = await inspectLessonBundle(out);
    expect(inspected.manifest).toMatchObject({ formatVersion: 1, kind: 'lesson', setId: 'mergelearn-sample', cardCount: 4 });
    expect(inspected.entryNames.filter((name) => name.startsWith('cards/'))).toHaveLength(4);
    expect(inspected.serializedContent).not.toMatch(/"fsrs"|"repoId"|profile\//);

    const target = await fresh('mlt-bundle-target-');
    const imported = await importLessonBundle(target, out, { now: new Date('2026-07-18T00:00:00Z') });
    expect(imported.ok).toBe(true);
    expect((await loadSet(target, imported.setId!))?.title).toBe('Sample: Safe async data loading');
    expect((await loadOrder(target, imported.setId!))?.cardIds).toHaveLength(4);
    const cards = await loadCardsForSet(target, imported.setId!);
    expect(cards.map((c) => c.interaction?.type).sort()).toEqual(['choice', 'flashcard', 'parsons', 'self_response']);
    expect(cards.every((c) => c.fsrs.state === 0 && c.fsrs.reps === 0)).toBe(true);
  });

  it('preserves frozen provenance without local repository identifiers or paths', async () => {
    const source = await fresh('mlt-bundle-source-ref-');
    await installSampleLesson(source, { now: new Date('2026-07-16T00:00:00Z') });
    const [card] = await loadCardsForSet(source, 'mergelearn-sample');
    await saveCard(source, { ...card, sourceRefs: [{
      repoId: 'private-local-repo', repoLabel: 'example/repo', originUrl: 'https://example.com/repo.git',
      path: '/Users/alice/private/src/load.ts', startLine: 2, endLine: 4, commit: 'abc123',
      frozenText: 'const safe = true;', status: 'fresh',
    }] });
    const out = join(await fresh('mlt-bundle-ref-out-'), 'lesson.mergelearn.zip');
    await exportLessonBundle(source, 'mergelearn-sample', out);
    const inspected = await inspectLessonBundle(out);
    expect(inspected.serializedContent).toContain('const safe = true;');
    expect(inspected.serializedContent).toContain('https://example.com/repo.git');
    expect(inspected.serializedContent).not.toContain('private-local-repo');
    expect(inspected.serializedContent).not.toContain('/Users/alice');

    const target = await fresh('mlt-bundle-ref-target-');
    const imported = await importLessonBundle(target, out);
    const importedCards = await loadCardsForSet(target, imported.setId!);
    expect(importedCards.find((c) => c.sourceRefs?.length)?.sourceRefs?.[0]).toMatchObject({
      frozenText: 'const safe = true;', originUrl: 'https://example.com/repo.git', path: 'load.ts',
    });
  });

  it('refuses collisions by default and remaps card ids for an explicit copy', async () => {
    const source = await fresh('mlt-bundle-collision-source-');
    await installSampleLesson(source);
    const out = join(await fresh('mlt-bundle-collision-out-'), 'lesson.mergelearn.zip');
    await exportLessonBundle(source, 'mergelearn-sample', out);
    const target = await fresh('mlt-bundle-collision-target-');
    const first = await importLessonBundle(target, out);
    await expect(importLessonBundle(target, out)).rejects.toThrow(/already exists/);
    const copy = await importLessonBundle(target, out, { asCopy: true });
    expect(copy.setId).toBe('mergelearn-sample-copy');
    const firstIds = new Set((await loadCardsForSet(target, first.setId!)).map((c) => c.id));
    expect((await loadCardsForSet(target, copy.setId!)).every((c) => !firstIds.has(c.id))).toBe(true);
  });

  it('rejects traversal entries before parsing content', async () => {
    const path = join(await fresh('mlt-bundle-unsafe-'), 'unsafe.zip');
    await writeFile(path, zipSync({ '../escape.json': strToU8('{}'), 'manifest.json': strToU8('{}') }));
    await expect(inspectLessonBundle(path)).rejects.toThrow(/unsafe bundle entry/);
  });

  it('rejects content whose manifest checksum no longer matches', async () => {
    const source = await fresh('mlt-bundle-tamper-source-');
    await installSampleLesson(source);
    const path = join(await fresh('mlt-bundle-tamper-out-'), 'tampered.zip');
    await exportLessonBundle(source, 'mergelearn-sample', path);
    const files = unzipSync(new Uint8Array(await readFile(path)));
    files['set.json'] = strToU8('{"id":"mergelearn-sample","title":"Tampered"}');
    await writeFile(path, zipSync(files));
    await expect(inspectLessonBundle(path)).rejects.toThrow(/checksum mismatch/);
  });

  it('refuses symlinks in lesson assets', async () => {
    if (process.platform === 'win32') return;
    const source = await fresh('mlt-bundle-symlink-source-');
    await installSampleLesson(source);
    const target = join(source, 'outside.txt');
    await writeFile(target, 'private');
    const assets = join(source, 'library', 'sets', 'mergelearn-sample', 'assets');
    await mkdir(assets, { recursive: true });
    await symlink(target, join(assets, 'linked.txt'));
    await expect(exportLessonBundle(source, 'mergelearn-sample', join(await fresh('mlt-bundle-symlink-out-'), 'lesson.zip')))
      .rejects.toThrow(/asset symlink/);
  });
});
