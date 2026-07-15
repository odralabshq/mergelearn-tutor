import { describe, expect, it } from 'vitest';

import { summarizeLesson } from '../../../src/core/library/lessonSummary.js';
import type { AgentSetPatch } from '../../../src/core/library/types.js';

function patch(): AgentSetPatch {
  return {
    version: 1,
    set: { title: 'Repo lesson', lessonKind: 'repository', tagIds: [] },
    tagPatch: { reuse: [], add: [] },
    order: ['a', 'b'],
    cards: [
      { localId: 'a', tagRefs: [], front: { prompt: 'A?' }, back: { shortAnswer: 'A', explanationMarkdown: 'A.' }, interaction: { type: 'parsons', blocks: [{ id: 'x', code: 'x' }, { id: 'y', code: 'y' }], correctOrder: ['x', 'y'] } },
      { localId: 'b', tagRefs: [], front: { prompt: 'B?' }, back: { shortAnswer: 'B', explanationMarkdown: 'B.' }, interaction: { type: 'parsons', blocks: [{ id: 'x', code: 'x' }, { id: 'y', code: 'y' }], correctOrder: ['x', 'y'] } },
    ],
  };
}

describe('summarizeLesson', () => {
  it('counts interactions and emits soft, mechanically-defensible warnings', () => {
    const s = summarizeLesson(patch());
    expect(s.interactionCounts).toEqual({ parsons: 2 });
    expect(s.cardCount).toBe(2);
    expect(s.citedCardCount).toBe(0);
    expect(s.warnings.map((w) => w.code)).toEqual(expect.arrayContaining([
      'lesson:no_objective', 'lesson:no_estimate', 'lesson:single_interaction',
      'lesson:no_citations', 'parsons:block_count',
    ]));
  });

  it('adds unresolved-source warning from import results', () => {
    const s = summarizeLesson(patch(), [{ localId: 'a', cardId: 'c', status: 'needs_review', reasons: ['source:unresolved'] }]);
    expect(s.unresolvedSourceCount).toBe(1);
    expect(s.warnings.some((w) => w.code === 'source:unresolved')).toBe(true);
  });
});
