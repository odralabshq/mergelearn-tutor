import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { freezeDraft, importAgentCards, type AgentCardDraft } from '../../src/core/importCards.js';
import type { AuthorLlm } from '../../src/core/author.js';
import type { EndpointConfig } from '../../src/core/endpoint.js';
import type { TutorState } from '../../src/core/types.js';

let dir = '';
const usable: EndpointConfig = { baseUrl: 'http://127.0.0.1:11434/v1', model: 'm', isCloud: false, usable: true };

function fakeLlm(...responses: string[]): AuthorLlm {
  let i = 0;
  return { complete: async () => responses[Math.min(i++, responses.length - 1)] };
}

/** Minimal empty state with the collections importAgentCards touches. */
function emptyState(): TutorState {
  return {
    goals: [], createdAt: 'x', updatedAt: 'x',
    artifacts: [], concepts: [], conceptStates: [], learningItems: [], cardBatches: [],
    courses: [], questionBank: [], learningEvents: [],
  } as unknown as TutorState;
}

const goodDraft: AgentCardDraft = {
  conceptLabel: 'foo defines then invokes',
  plane: 'local_behavior',
  path: 'src/a.ts',
  startLine: 2,
  endLine: 3,
  prompt: 'What does foo() do when called at line 3?',
  expectedAnswer: 'It defines foo then invokes it.',
  expectedFocus: ['foo'],
  explanationMarkdown: 'defines and calls',
  planeConfidence: 0.8,
};

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mlt-import-'));
  await mkdir(join(dir, 'src'), { recursive: true });
  await writeFile(join(dir, 'src', 'a.ts'), 'line1\nexport function foo() {}\nfoo();\nline4\n', 'utf8');
  // A file whose lines 1-4 are pure comment noise (low teachability signal).
  await writeFile(join(dir, 'src', 'comments.ts'), '// header\n// more header\n/* block */\n// trailing\nexport const x = 1;\n', 'utf8');
});

describe('agent card import (S11)', () => {
  it('freezes the snippet from DISK, ignoring any agent-supplied text', async () => {
    const card = await freezeDraft(dir, goodDraft, 'sha123');
    expect(card.snippet.text).toBe('export function foo() {}\nfoo();');
    expect(card.snippet.commit).toBe('sha123');
    expect(card.snippet.path).toBe('src/a.ts');
  });

  it('attaches a good card and creates a schedulable concept + item (oracle agrees)', async () => {
    const llm = fakeLlm('derived', JSON.stringify({ agree: true, reason: 'same' }));
    const { state, results } = await importAgentCards(dir, emptyState(), [goodDraft], 'sha1', { llm, endpoint: usable });
    expect(results[0].attached).toBe(true);
    expect(results[0].status).toBe('active');
    expect(results[0].answerKey).toBe('agree');
    expect(state.learningItems).toHaveLength(1);
    expect(state.concepts).toHaveLength(1);
    expect(state.conceptStates).toHaveLength(1);
    // the item is wired to the created concept so the scheduler can serve it
    expect(state.learningItems[0].conceptId).toBe(state.concepts[0].id);
    expect(state.learningItems[0].source).toBe('agent_import');
  });

  it('sends a card to needs_review (NOT scheduled) when the oracle disagrees', async () => {
    const llm = fakeLlm('derived', JSON.stringify({ agree: false, reason: 'answer is wrong' }));
    const { state, results } = await importAgentCards(dir, emptyState(), [goodDraft], 'sha1', { llm, endpoint: usable });
    expect(results[0].attached).toBe(false);
    expect(results[0].status).toBe('needs_review');
    expect(results[0].reasons).toContain('answer_key:disagree');
    expect(state.learningItems).toHaveLength(0);
    expect(state.concepts).toHaveLength(0);
  });

  it('attaches but flags honestly when NO oracle is available (skipped, not faked)', async () => {
    const { state, results } = await importAgentCards(dir, emptyState(), [goodDraft], 'sha1', { endpoint: usable });
    expect(results[0].attached).toBe(true);
    expect(results[0].answerKey).toBe('skipped');
    expect(results[0].reasons).toContain('answer_key:skipped_no_oracle');
    expect(state.learningItems).toHaveLength(1);
  });

  it('rejects a malformed draft on deterministic format gate (no oracle call needed)', async () => {
    const bad: AgentCardDraft = { ...goodDraft, prompt: 'foo defines then invokes it' }; // no '?', leaks answer
    const { state, results } = await importAgentCards(dir, emptyState(), [bad], 'sha1', { endpoint: usable });
    expect(results[0].attached).toBe(false);
    expect(results[0].status).toBe('needs_review');
    expect(results[0].reasons.some((r) => r.startsWith('format:'))).toBe(true);
    expect(state.learningItems).toHaveLength(0);
  });

  it('routes a low-signal (comment-only) range to needs_review, even when it passes format', async () => {
    // Cite lines 1-4 of comments.ts: all comments. A well-formed Q/A can still
    // be written about it, but the range has no teachable content -> not scheduled.
    const commentDraft: AgentCardDraft = {
      conceptLabel: 'header comments',
      plane: 'file_role',
      path: 'src/comments.ts',
      startLine: 1,
      endLine: 4,
      prompt: 'What does the header of this file describe?',
      expectedAnswer: 'It is a block of descriptive comments with no executable logic.',
      expectedFocus: ['header', 'comments'],
      planeConfidence: 0.5,
    };
    const llm = fakeLlm('derived', JSON.stringify({ agree: true, reason: 'ok' }));
    const { state, results } = await importAgentCards(dir, emptyState(), [commentDraft], 'sha1', { llm, endpoint: usable });
    expect(results[0].attached).toBe(false);
    expect(results[0].status).toBe('needs_review');
    expect(results[0].reasons).toContain('teachability:low_signal');
    expect(state.learningItems).toHaveLength(0);
  });

  it('is idempotent on concept creation for the same range (no duplicate concepts)', async () => {
    const llm = fakeLlm('d', JSON.stringify({ agree: true, reason: 'ok' }), 'd', JSON.stringify({ agree: true, reason: 'ok' }));
    const { state } = await importAgentCards(dir, emptyState(), [goodDraft, goodDraft], 'sha1', { llm, endpoint: usable });
    // two cards, same range -> one concept, but both items attach
    expect(state.concepts).toHaveLength(1);
    expect(state.learningItems).toHaveLength(2);
  });
});
