import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { importAgentSet } from '../../../src/core/library/importAgentSet.js';
import { listSetIds } from '../../../src/core/library/setStore.js';
import type { AgentSetPatch } from '../../../src/core/library/types.js';

const freshRoot = () => mkdtemp(join(tmpdir(), 'ml-leak-'));
const ANSWER = 'it receives status fresh';

function patchWith(front: { prompt: string; contextMarkdown?: string }): AgentSetPatch {
  return {
    version: 1,
    set: { id: 'leak-fixture', title: 'Leak fixture', tagIds: [], objective: 'Gate coverage' },
    tagPatch: { reuse: [], add: [] },
    order: ['c1'],
    cards: [{
      localId: 'c1',
      tagRefs: [],
      front,
      back: { shortAnswer: ANSWER, explanationMarkdown: 'Because the range is clamped.' },
    }],
  } as AgentSetPatch;
}

describe('answer-leak gate covers every field rendered before the attempt', () => {
  it('rejects the answer verbatim in the prompt', async () => {
    const res = await importAgentSet(await freshRoot(), patchWith({
      prompt: `What status does a clamped range get? ${ANSWER}.`,
    }));
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.code === 'answer_leak')).toBe(true);
  });

  it('rejects the answer moved sideways into contextMarkdown', async () => {
    const res = await importAgentSet(await freshRoot(), patchWith({
      prompt: 'What status does a clamped range get?',
      contextMarkdown: `Remember: ${ANSWER}. Keep that in mind.`,
    }));
    expect(res.ok).toBe(false);
    const leak = res.errors.find((e) => e.code === 'answer_leak');
    expect(leak).toBeDefined();
    // The message must name the field, or the author cannot act on it.
    expect(leak!.message).toContain('contextMarkdown');
    expect(leak!.message).toContain('before the attempt');
  });

  it('writes nothing when a contextMarkdown leak is rejected', async () => {
    const root = await freshRoot();
    const res = await importAgentSet(root, patchWith({
      prompt: 'What status does a clamped range get?',
      contextMarkdown: `Hint: ${ANSWER}.`,
    }));
    expect(res.ok).toBe(false);
    expect(await listSetIds(root)).toHaveLength(0);
  });

  it('accepts genuine setup context that does not contain the answer', async () => {
    const res = await importAgentSet(await freshRoot(), patchWith({
      prompt: 'What status does a clamped range get?',
      contextMarkdown: 'A reader clamps an out-of-bounds range instead of failing.',
    }));
    expect(res.ok).toBe(true);
    expect(res.cards[0].status).toBe('active');
  });
});
