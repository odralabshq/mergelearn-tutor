import { describe, expect, it } from 'vitest';

import { validateAnswerKey, deriveAnswer } from '../../src/core/answerKey.js';
import type { AuthorLlm } from '../../src/core/author.js';
import type { EndpointConfig } from '../../src/core/endpoint.js';

const usable: EndpointConfig = { baseUrl: 'http://127.0.0.1:11434/v1', model: 'm', isCloud: false, usable: true };

/** Fake LLM that records every prompt it sees and replies from a script. */
function recordingLlm(responses: string[]): { llm: AuthorLlm; seen: string[] } {
  const seen: string[] = [];
  let i = 0;
  return {
    seen,
    llm: {
      complete: async (messages) => {
        seen.push(messages.map((m) => m.content).join('\n'));
        return responses[Math.min(i++, responses.length - 1)];
      },
    },
  };
}

const base = {
  prompt: 'What does foo() do?',
  snippet: 'export function foo() {}\nfoo();',
  path: 'src/a.ts',
  authorAnswer: 'It defines foo then invokes it.',
};

describe('answer-key validation (independent oracle)', () => {
  it('skips (never throws) with no LLM', async () => {
    const r = await validateAnswerKey(base, { endpoint: usable });
    expect(r.verdict).toBe('skipped');
  });

  it('skips when the endpoint is not usable', async () => {
    const { llm } = recordingLlm(['x']);
    const r = await validateAnswerKey(base, { llm, endpoint: { ...usable, usable: false } });
    expect(r.verdict).toBe('skipped');
  });

  it('derivation is BLIND: the author answer never reaches the derive prompt', async () => {
    const { llm, seen } = recordingLlm([
      'It defines and calls foo.',
      JSON.stringify({ agree: true, reason: 'same substance' }),
    ]);
    await validateAnswerKey(base, { llm, endpoint: usable });
    // First call is the blind derivation - it must NOT contain the author answer.
    expect(seen[0]).not.toContain(base.authorAnswer);
    // Second call is the judge - it legitimately sees both answers.
    expect(seen[1]).toContain(base.authorAnswer);
  });

  it('returns agree when the judge agrees', async () => {
    const { llm } = recordingLlm(['derived', JSON.stringify({ agree: true, reason: 'ok' })]);
    const r = await validateAnswerKey(base, { llm, endpoint: usable });
    expect(r.verdict).toBe('agree');
  });

  it('returns disagree when the judge disagrees', async () => {
    const { llm } = recordingLlm(['derived', JSON.stringify({ agree: false, reason: 'author is wrong' })]);
    const r = await validateAnswerKey(base, { llm, endpoint: usable });
    expect(r.verdict).toBe('disagree');
    expect(r.reason).toMatch(/wrong/);
  });

  it('disagrees safely when the judge returns unparseable output', async () => {
    const { llm } = recordingLlm(['derived', 'not json at all']);
    const r = await validateAnswerKey(base, { llm, endpoint: usable });
    expect(r.verdict).toBe('disagree');
  });

  it('skips (never throws) when the oracle endpoint is unreachable', async () => {
    // A dead endpoint throws on fetch. The oracle must degrade to 'skipped',
    // not crash the import run. Regression guard for the Ollama-removal case.
    const throwing: AuthorLlm = { complete: async () => { throw new Error('fetch failed'); } };
    const r = await validateAnswerKey(base, { llm: throwing, endpoint: usable });
    expect(r.verdict).toBe('skipped');
    expect(r.reason).toMatch(/unreachable/);
  });

  it('deriveAnswer sends snippet + question but not an answer field', async () => {
    const { llm, seen } = recordingLlm(['derived answer']);
    const out = await deriveAnswer(llm, { prompt: base.prompt, snippet: base.snippet, path: base.path });
    expect(out).toBe('derived answer');
    expect(seen[0]).toContain(base.snippet);
    expect(seen[0]).toContain(base.prompt);
  });
});
