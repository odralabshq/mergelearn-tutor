import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { authorCard, buildContextBundle, buildAuthorPrompt, type AuthorLlm, type AuthorTarget } from '../../src/core/author.js';
import type { EndpointConfig } from '../../src/core/endpoint.js';

let dir = '';
const usable: EndpointConfig = { baseUrl: 'http://127.0.0.1:11434/v1', model: 'm', isCloud: false, usable: true };
const target: AuthorTarget = {
  conceptId: 'c1', conceptLabel: 'foo', path: 'src/a.ts', startLine: 2, endLine: 3, plane: 'local_behavior',
};

function fakeLlm(...responses: string[]): AuthorLlm {
  let i = 0;
  return { complete: async () => responses[Math.min(i++, responses.length - 1)] };
}

const goodJson = JSON.stringify({
  prompt: 'What does foo() do when called at line 3?',
  snippetPath: 'src/a.ts', snippetStartLine: 2, snippetEndLine: 3,
  expectedAnswer: 'It defines foo then invokes it.',
  expectedFocus: ['foo'], explanationMarkdown: 'x', planeConfidence: 0.8,
});

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mlt-author-'));
  await mkdir(join(dir, 'src'), { recursive: true });
  await writeFile(join(dir, 'src', 'a.ts'), 'line1\nexport function foo() {}\nfoo();\nline4\n', 'utf8');
});

describe('authorCard (LLM-sole-author)', () => {
  it('skips (never throws) when no LLM is provided', async () => {
    const r = await authorCard(dir, target, { endpoint: usable, commitSha: 'abc' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.skipped).toBe(true);
  });

  it('skips when the endpoint is not usable (cloud without consent)', async () => {
    const blocked: EndpointConfig = { ...usable, isCloud: true, usable: false, reason: 'consent' };
    const r = await authorCard(dir, target, { llm: fakeLlm(goodJson), endpoint: blocked, commitSha: 'abc' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.skipped).toBe(true);
  });

  it('freezes the snippet from disk, not the model, and pins the SHA', async () => {
    const lyingJson = JSON.stringify({
      ...JSON.parse(goodJson), snippetPath: 'src/a.ts', snippetStartLine: 2, snippetEndLine: 3,
    });
    const r = await authorCard(dir, target, { llm: fakeLlm(lyingJson), endpoint: usable, commitSha: 'sha123' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.card.snippet.text).toBe('export function foo() {}\nfoo();');
      expect(r.card.snippet.commit).toBe('sha123');
    }
  });

  it('recovers JSON wrapped in prose (tolerant path)', async () => {
    const r = await authorCard(dir, target, { llm: fakeLlm(`sure!\n\`\`\`json\n${goodJson}\n\`\`\``), endpoint: usable, commitSha: 'abc' });
    expect(r.ok).toBe(true);
  });

  it('regenerates once after an unparseable first response', async () => {
    const r = await authorCard(dir, target, { llm: fakeLlm('garbage', goodJson), endpoint: usable, commitSha: 'abc', attempts: 2 });
    expect(r.ok).toBe(true);
  });

  it('fails (not skipped) when all attempts are invalid', async () => {
    const r = await authorCard(dir, target, { llm: fakeLlm('nope', 'still nope'), endpoint: usable, commitSha: 'abc', attempts: 2 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.skipped).toBe(false);
  });

  it('buildContextBundle gathers real snippet + neighbors', async () => {
    const b = await buildContextBundle(dir, target);
    expect(b.primarySnippet).toContain('foo');
    expect(Array.isArray(b.neighbors)).toBe(true);
  });

  it('the author prompt carries the Bloom target and plane exemplars', async () => {
    const b = await buildContextBundle(dir, target);
    const msgs = buildAuthorPrompt(b);
    const userText = msgs.find((m) => m.role === 'user')?.content ?? '';
    expect(userText).toMatch(/Bloom: Apply/); // local_behavior -> Apply
    expect(userText).toMatch(/EXEMPLARS/);
    expect(userText).toMatch(/Q:/);
  });
});
