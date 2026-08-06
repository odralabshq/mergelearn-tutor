import { describe, expect, it } from 'vitest';

import { answerOverlapRatio, summarizeLesson } from '../../../src/core/library/lessonSummary.js';
import type { AgentSetPatch } from '../../../src/core/library/types.js';

const GOOD_EXPLANATION =
  'The reader clamps the end of the range but never checks the start, so a citation past '
  + 'end-of-file freezes nothing while still reporting success.';

function lessonWith(card: Record<string, unknown>): AgentSetPatch {
  return {
    version: 1,
    set: { id: 'advisory', title: 'Advisory', tagIds: [], objective: 'Test advisory warnings', estimatedMinutes: 5 },
    tagPatch: { reuse: [], add: [] },
    order: ['c1'],
    cards: [{ localId: 'c1', tagRefs: [], ...card }],
  } as unknown as AgentSetPatch;
}

const codes = (patch: AgentSetPatch): string[] => summarizeLesson(patch).warnings.map((w) => w.code);

describe('advisory warnings catch what structural gates cannot', () => {
  it('flags an explanation too short to explain why', () => {
    const warnings = summarizeLesson(lessonWith({
      front: { prompt: 'Why does the reader clamp an out-of-bounds range?' },
      back: { shortAnswer: 'It avoids throwing.', explanationMarkdown: 'It just works that way.' },
    })).warnings;
    const thin = warnings.find((w) => w.code === 'card:thin_explanation');
    expect(thin).toBeDefined();
    expect(thin!.cardLocalId).toBe('c1');
  });

  it('does not flag a substantive explanation', () => {
    expect(codes(lessonWith({
      front: { prompt: 'Why does the reader clamp an out-of-bounds range?' },
      back: { shortAnswer: 'It avoids throwing.', explanationMarkdown: GOOD_EXPLANATION },
    }))).not.toContain('card:thin_explanation');
  });

  it('flags a paraphrased answer leak the verbatim gate cannot see', () => {
    // Every content word of the answer already appears in the prompt, so the
    // card measures reading rather than recall - but no substring matches.
    const warnings = summarizeLesson(lessonWith({
      front: { prompt: 'When the reader clamps the range, what does it report?' },
      back: { shortAnswer: 'The reader clamps range reporting.', explanationMarkdown: GOOD_EXPLANATION },
    })).warnings;
    expect(warnings.map((w) => w.code)).toContain('card:answer_overlap');
  });

  it('does not flag an answer that shares no vocabulary with the prompt', () => {
    expect(codes(lessonWith({
      front: { prompt: 'What happens to a citation beyond end-of-file?' },
      back: { shortAnswer: 'Provenance silently becomes empty.', explanationMarkdown: GOOD_EXPLANATION },
    }))).not.toContain('card:answer_overlap');
  });

  it('ignores an answer too short to judge for overlap', () => {
    expect(answerOverlapRatio('Is it fresh?', 'Yes.')).toBe(0);
    expect(answerOverlapRatio('Is the status fresh?', 'Fresh.')).toBe(0);
  });

  it('flags adjacent parsons blocks that share no identifier', () => {
    const warnings = summarizeLesson(lessonWith({
      front: { prompt: 'Order these statements.' },
      back: { shortAnswer: 'Declarations first.', explanationMarkdown: GOOD_EXPLANATION },
      interaction: {
        type: 'parsons',
        blocks: [
          { id: 'b1', code: 'const alpha = readConfig();' },
          { id: 'b2', code: 'const beta = openSocket();' },
          { id: 'b3', code: 'const gamma = startTimer();' },
        ],
        correctOrder: ['b1', 'b2', 'b3'],
      },
    })).warnings;
    // Independent statements: a learner who reorders them is marked wrong for
    // an order that is actually arbitrary.
    const ambiguous = warnings.filter((w) => w.code === 'parsons:ambiguous_order');
    expect(ambiguous.length).toBeGreaterThan(0);
    expect(ambiguous[0]!.message).toContain('share no identifier');
  });

  it('does not flag parsons blocks with a genuine data dependency', () => {
    expect(codes(lessonWith({
      front: { prompt: 'Order these statements.' },
      back: { shortAnswer: 'Create, then use.', explanationMarkdown: GOOD_EXPLANATION },
      interaction: {
        type: 'parsons',
        blocks: [
          { id: 'b1', code: 'const items = loadItems();' },
          { id: 'b2', code: 'items.push(extra);' },
          { id: 'b3', code: 'return items.length;' },
        ],
        correctOrder: ['b1', 'b2', 'b3'],
      },
    }))).not.toContain('parsons:ambiguous_order');
  });

  it('stays advisory: warnings never make the summary reject anything', () => {
    const summary = summarizeLesson(lessonWith({
      front: { prompt: 'Why does the reader clamp?' },
      back: { shortAnswer: 'It avoids throwing.', explanationMarkdown: 'Short.' },
    }));
    // A false positive that blocked an import would teach authors to route
    // around the gate, so these are hints and nothing more.
    expect(summary.warnings.length).toBeGreaterThan(0);
    expect(summary.cardCount).toBe(1);
  });
});
