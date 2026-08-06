import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildAuthoringContext } from '../../../src/core/library/authoringContext.js';
import { importAgentSet } from '../../../src/core/library/importAgentSet.js';
import { registerRepo } from '../../../src/core/library/repoRegistry.js';
import type { AgentSetPatch } from '../../../src/core/library/types.js';

const freshRoot = () => mkdtemp(join(tmpdir(), 'ml-ctx-'));
const TWENTY_LINES = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n');

async function repo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ml-ctx-repo-'));
  await writeFile(join(dir, 'drift.ts'), TWENTY_LINES, 'utf8');
  return dir;
}

/** A prompt whose real ask sits at the very END, which is what the authoring
 * skill instructs (context first, question last). */
const LONG_PROMPT = `${'Setup context that goes on for a while. '.repeat(9)}So which status does the reader report?`;

describe('context carries enough detail to deepen, not just avoid repeats', () => {
  it('reports cited line RANGES, not only file paths', async () => {
    const root = await freshRoot();
    const ref = await registerRepo(root, await repo());
    const res = await importAgentSet(root, {
      version: 1,
      set: { id: 'ranges', title: 'Ranges', tagIds: [] },
      tagPatch: { reuse: [], add: [] },
      order: ['c1'],
      cards: [{
        localId: 'c1', tagRefs: [],
        front: { prompt: 'Which lines does this cite?' },
        back: { shortAnswer: 'Lines 4 to 8.', explanationMarkdown: 'See the frozen range.' },
        sourceRefs: [{ repoId: ref.id, path: 'drift.ts', startLine: 4, endLine: 8 }],
      }],
    } as AgentSetPatch);
    expect(res.ok).toBe(true);
    expect(res.cards[0].status).toBe('active');

    const ctx = await buildAuthoringContext(root, { recent: 5 });
    const lesson = ctx.recentLessons[0];
    expect(lesson.citedPaths).toEqual(['drift.ts']);
    expect(lesson.citedRanges).toEqual(['drift.ts:4-8']);
  });

  it('reports the altitudes already covered', async () => {
    const root = await freshRoot();
    await importAgentSet(root, {
      version: 1,
      set: { id: 'alts', title: 'Altitudes', tagIds: [] },
      tagPatch: { reuse: [], add: [] },
      order: ['a', 'b', 'c'],
      cards: [
        { localId: 'a', tagRefs: [], altitude: 'line', front: { prompt: 'Syntax question?' }, back: { shortAnswer: 'A.', explanationMarkdown: 'x' } },
        { localId: 'b', tagRefs: [], altitude: 'module', front: { prompt: 'Module question?' }, back: { shortAnswer: 'B.', explanationMarkdown: 'y' } },
        { localId: 'c', tagRefs: [], altitude: 'module', front: { prompt: 'Another module question?' }, back: { shortAnswer: 'C.', explanationMarkdown: 'z' } },
      ],
    } as unknown as AgentSetPatch);

    const ctx = await buildAuthoringContext(root, { recent: 5 });
    // Deduped, so the author sees WHICH altitudes exist, not how many cards.
    expect(ctx.recentLessons[0].altitudes).toEqual(['line', 'module']);
  });

  it('keeps the trailing ask when a long question is truncated', async () => {
    const root = await freshRoot();
    await importAgentSet(root, {
      version: 1,
      set: { id: 'longq', title: 'Long question', tagIds: [] },
      tagPatch: { reuse: [], add: [] },
      order: ['c1'],
      cards: [{
        localId: 'c1', tagRefs: [],
        front: { prompt: LONG_PROMPT },
        back: { shortAnswer: 'It reports fresh.', explanationMarkdown: 'Because it clamps.' },
      }],
    } as AgentSetPatch);

    const ctx = await buildAuthoringContext(root, { recent: 5 });
    const summary = ctx.recentLessons[0].questionSummaries[0];
    expect(LONG_PROMPT.length).toBeGreaterThan(240);
    expect(summary.length).toBeLessThanOrEqual(240);
    // The interrogative must survive: a tail slice() would have removed it.
    expect(summary).toContain('which status does the reader report?');
    expect(summary).toContain('...');
    expect(summary.startsWith('Setup context')).toBe(true);
  });

  it('leaves a short question completely intact', async () => {
    const root = await freshRoot();
    await importAgentSet(root, {
      version: 1,
      set: { id: 'shortq', title: 'Short question', tagIds: [] },
      tagPatch: { reuse: [], add: [] },
      order: ['c1'],
      cards: [{
        localId: 'c1', tagRefs: [],
        front: { prompt: 'Why does the reader clamp?' },
        back: { shortAnswer: 'To avoid failing.', explanationMarkdown: 'Kindness.' },
      }],
    } as AgentSetPatch);

    const ctx = await buildAuthoringContext(root, { recent: 5 });
    expect(ctx.recentLessons[0].questionSummaries[0]).toBe('Why does the reader clamp?');
  });

  it('projects only deduplicated problem identifiers into recent lessons', async () => {
    const root = await freshRoot();
    await importAgentSet(root, {
      version: 1,
      set: {
        id: 'problem-context', title: 'Private problem context', tagIds: [],
        problemRefs: [{
          sourceName: 'Cafe\u0301', sourceId: 'Pair-Sum', canonicalUrl: 'https://example.org/private/set',
          attributions: [{ kind: 'list', label: 'Private List', observedOn: '2026-08-01' }],
        }],
      },
      tagPatch: { reuse: [], add: [] },
      order: ['c1'],
      cards: [{
        localId: 'c1', tagRefs: [],
        problemRefs: [{
          sourceName: 'Café', sourceId: 'pair-sum', canonicalUrl: 'https://example.org/private/card',
        }],
        front: { prompt: 'How should a pair sum be found?' },
        back: { shortAnswer: 'Use a complement map.', explanationMarkdown: 'Track prior values and test each complement once.' },
      }],
    } as AgentSetPatch, { now: new Date('2026-08-05T12:00:00Z') });

    const lesson = (await buildAuthoringContext(root, { recent: 5 })).recentLessons[0];
    const projected = lesson as typeof lesson & {
      problemRefs: { sourceName: string; sourceId: string }[];
    };
    expect(projected.problemRefs).toEqual([{ sourceName: 'Café', sourceId: 'Pair-Sum' }]);
    const serialized = JSON.stringify(lesson);
    expect(serialized).not.toContain('example.org');
    expect(serialized).not.toContain('observedOn');
    expect(serialized).not.toContain('license');
  });

  it('leaves conceptual lessons with empty provenance fields', async () => {
    const root = await freshRoot();
    await importAgentSet(root, {
      version: 1,
      set: { id: 'concept', title: 'Conceptual', tagIds: [] },
      tagPatch: { reuse: [], add: [] },
      order: ['c1'],
      cards: [{
        localId: 'c1', tagRefs: [],
        front: { prompt: 'What is a closure?' },
        back: { shortAnswer: 'A function plus its captured scope.', explanationMarkdown: 'Scope capture.' },
      }],
    } as AgentSetPatch);

    const lesson = (await buildAuthoringContext(root, { recent: 5 })).recentLessons[0];
    expect(lesson.citedRanges).toEqual([]);
    expect(lesson.altitudes).toEqual([]);
  });
});
