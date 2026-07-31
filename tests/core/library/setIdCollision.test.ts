import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { importAgentSet } from '../../../src/core/library/importAgentSet.js';
import { libraryPaths } from '../../../src/core/library/libraryStore.js';
import { readJson } from '../../../src/core/library/io.js';
import { listSetIds } from '../../../src/core/library/setStore.js';
import type { AgentSetPatch, CardSet } from '../../../src/core/library/types.js';

const freshRoot = () => mkdtemp(join(tmpdir(), 'ml-collision-'));

/** A lesson with NO explicit set.id, so the id is derived from the title. */
function derived(title: string, extra: Partial<AgentSetPatch['set']> = {}): AgentSetPatch {
  return {
    version: 1,
    set: { title, tagIds: [], ...extra },
    tagPatch: { reuse: [], add: [] },
    order: ['c1'],
    cards: [{
      localId: 'c1', tagRefs: [],
      front: { prompt: `Question for ${title}?` },
      back: { shortAnswer: 'An answer.', explanationMarkdown: 'An explanation.' },
    }],
  } as AgentSetPatch;
}

const SLUG = 'the-validator-bug';

describe('derived set ids cannot silently swallow an unrelated lesson', () => {
  it('rejects a second lesson whose title slugifies onto an existing id', async () => {
    const root = await freshRoot();
    const first = await importAgentSet(root, derived('The validator bug'));
    expect(first.ok).toBe(true);
    expect(first.setId).toBe(SLUG);

    // Differs only by punctuation and case, so it slugifies onto the same id.
    const second = await importAgentSet(root, derived('The Validator Bug!!'));
    expect(second.ok).toBe(false);
    const err = second.errors.find((e) => e.code === 'set:id_collision');
    expect(err).toBeDefined();
    // The message must name the occupant and the way forward, or an autonomous
    // agent cannot recover without guessing.
    expect(err!.message).toContain('The validator bug');
    expect(err!.message).toContain(SLUG);
  });

  it('leaves the existing lesson completely untouched when it rejects', async () => {
    const root = await freshRoot();
    await importAgentSet(root, derived('The validator bug', {
      folderPath: 'mergelearn/validation',
      objective: 'Understand the validator defect',
      lessonKind: 'repository',
      estimatedMinutes: 6,
    }));
    const before = await readJson<CardSet>(libraryPaths(root).setFile(SLUG));

    await importAgentSet(root, derived('the VALIDATOR bug...', {
      folderPath: 'mergelearn/unrelated',
      objective: 'Something else entirely',
      lessonKind: 'general',
      estimatedMinutes: 1,
    }));

    const after = await readJson<CardSet>(libraryPaths(root).setFile(SLUG));
    expect(after).toEqual(before);
    expect(await listSetIds(root)).toEqual([SLUG]);
  });

  it('rejects an identical title too, because titles are not identity', async () => {
    const root = await freshRoot();
    await importAgentSet(root, derived('The validator bug'));
    // Two agents independently authoring "Error Handling" produce the SAME
    // title, so a titles-differ check would wave that merge through and lose the
    // first lesson. An omitted id therefore always means "create".
    const again = await importAgentSet(root, derived('The validator bug'));
    expect(again.ok).toBe(false);
    expect(again.errors.some((e) => e.code === 'set:id_collision')).toBe(true);
    expect(again.errors[0]!.message).toContain(SLUG);
  });

  it('still allows an intentional update via an explicit set.id', async () => {
    const root = await freshRoot();
    await importAgentSet(root, derived('The validator bug'));

    const intentional = await importAgentSet(root, {
      ...derived('A completely different title'),
      set: { id: SLUG, title: 'A completely different title', tagIds: [] },
    } as AgentSetPatch);

    expect(intentional.ok).toBe(true);
    expect(intentional.setId).toBe(SLUG);
    const stored = await readJson<CardSet>(libraryPaths(root).setFile(SLUG));
    expect(stored?.title).toBe('A completely different title');
  });

  it('lets genuinely distinct titles create separate lessons', async () => {
    const root = await freshRoot();
    expect((await importAgentSet(root, derived('Lesson one'))).ok).toBe(true);
    expect((await importAgentSet(root, derived('Lesson two'))).ok).toBe(true);
    expect((await listSetIds(root)).sort()).toEqual(['lesson-one', 'lesson-two']);
  });
});
