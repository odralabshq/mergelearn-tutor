import { describe, expect, it } from 'vitest';

import { applyTagPatch, findParentCycle } from '../../../src/core/library/tagStore.js';
import type { CardTag, ProposedTag } from '../../../src/core/library/types.js';

const existing: CardTag[] = [
  { id: 'tag_typescript', label: 'TypeScript', createdBy: 'user' },
  { id: 'tag_types', label: 'types', parentIds: ['tag_typescript'], createdBy: 'agent' },
];

describe('applyTagPatch — the taxonomy guard', () => {
  it('assigns ids to proposed tags and resolves in-patch localId parents', () => {
    const add: ProposedTag[] = [
      { localId: 'unions', label: 'unions', parentIds: ['tag_types'] },
      { localId: 'narrowing', label: 'narrowing', parentIds: ['unions'] }, // localId parent
    ];
    const res = applyTagPatch(existing, { reuse: ['tag_types'], add });
    expect(res.ok).toBe(true);
    const unionsId = res.localIdToTagId.get('unions')!;
    const narrowing = res.mergedTags.find((t) => t.label === 'narrowing')!;
    // the localId parent ref resolved to the real assigned id
    expect(narrowing.parentIds).toEqual([unionsId]);
    expect(res.addedTagIds).toHaveLength(2);
  });

  it('rejects reuse of an unknown tag id', () => {
    const res = applyTagPatch(existing, { reuse: ['tag_missing'], add: [] });
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.code === 'reuse_unknown')).toBe(true);
  });

  it('rejects a duplicate label (agent must reuse, not re-add)', () => {
    const add: ProposedTag[] = [{ localId: 'x', label: 'Types' }]; // case-insensitive dup of "types"
    const res = applyTagPatch(existing, { reuse: [], add });
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.code === 'dup_label')).toBe(true);
  });

  it('rejects a dangling parent reference', () => {
    const add: ProposedTag[] = [{ localId: 'x', label: 'generics', parentIds: ['nope'] }];
    const res = applyTagPatch(existing, { reuse: [], add });
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.code === 'dangling_parent')).toBe(true);
  });

  it('rejects a patch that would create a parent cycle', () => {
    // a -> b and b -> a within the same patch
    const add: ProposedTag[] = [
      { localId: 'a', label: 'alpha', parentIds: ['b'] },
      { localId: 'b', label: 'beta', parentIds: ['a'] },
    ];
    const res = applyTagPatch(existing, { reuse: [], add });
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.code === 'cycle')).toBe(true);
  });
});

describe('findParentCycle', () => {
  it('returns undefined for an acyclic hierarchy', () => {
    const m = new Map([['a', ['b']], ['b', ['c']], ['c', []]]);
    expect(findParentCycle(m)).toBeUndefined();
  });
  it('detects a direct cycle', () => {
    const m = new Map([['a', ['b']], ['b', ['a']]]);
    expect(findParentCycle(m)).toBeDefined();
  });
});
