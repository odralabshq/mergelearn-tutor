import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { verifyFormat, checkSnippetDrift } from '../../src/core/verify.js';
import type { AuthoredCard } from '../../src/core/author.js';

let dir = '';

function card(over: Partial<AuthoredCard> = {}): AuthoredCard {
  return {
    conceptId: 'c1', plane: 'local_behavior',
    prompt: 'What does foo() do when called at line 3?',
    expectedAnswer: 'It defines foo and then invokes it once.',
    expectedFocus: ['foo'], explanationMarkdown: 'x', planeConfidence: 0.8,
    snippet: { path: 'src/a.ts', startLine: 2, endLine: 3, text: 'export function foo() {}\nfoo();', commit: 'sha1' },
    ...over,
  };
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mlt-verify-'));
  await mkdir(join(dir, 'src'), { recursive: true });
  await writeFile(join(dir, 'src', 'a.ts'), 'line1\nexport function foo() {}\nfoo();\nline4\n', 'utf8');
});

describe('verifyFormat', () => {
  it('passes a well-formed card', () => {
    expect(verifyFormat(card()).ok).toBe(true);
  });

  it('flags an empty prompt and empty answer', () => {
    const r = verifyFormat(card({ prompt: '', expectedAnswer: '' }));
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.code)).toEqual(expect.arrayContaining(['empty_prompt', 'empty_answer']));
  });

  it('flags a prompt not phrased as a question', () => {
    const r = verifyFormat(card({ prompt: 'Explain foo.' }));
    expect(r.issues.some((i) => i.code === 'not_a_question')).toBe(true);
  });

  it('flags trivia when the prompt leaks its own answer', () => {
    const leak = 'What is true? It defines foo and then invokes it once.';
    const r = verifyFormat(card({ prompt: leak }));
    expect(r.issues.some((i) => i.code === 'trivia')).toBe(true);
  });
});

describe('checkSnippetDrift', () => {
  it('reports fresh when the pinned range still matches', async () => {
    const r = await checkSnippetDrift(dir, card());
    expect(r.status).toBe('fresh');
  });

  it('reports drifted when the pinned range now yields different text', async () => {
    const drifted = card({ snippet: { path: 'src/a.ts', startLine: 1, endLine: 2, text: 'STALE\nTEXT', commit: 'sha1' } });
    const r = await checkSnippetDrift(dir, drifted);
    expect(r.status).toBe('drifted');
    expect(r.currentText).toContain('line1');
  });

  it('reports missing when the file does not resolve', async () => {
    const gone = card({ snippet: { path: 'src/gone.ts', startLine: 1, endLine: 2, text: 'x', commit: 'sha1' } });
    const r = await checkSnippetDrift(dir, gone);
    expect(r.status).toBe('missing');
  });
});
