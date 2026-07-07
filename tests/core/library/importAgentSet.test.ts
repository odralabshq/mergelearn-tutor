import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { importAgentSet } from '../../../src/core/library/importAgentSet.js';
import { registerRepo } from '../../../src/core/library/repoRegistry.js';
import { loadSet, loadOrder } from '../../../src/core/library/setStore.js';
import { loadCardsForSet } from '../../../src/core/library/cardStore.js';
import { loadTags } from '../../../src/core/library/tagStore.js';
import type { AgentSetPatch } from '../../../src/core/library/types.js';

const execFileAsync = promisify(execFile);

let root = '';
let repoDir = '';
let repoId = '';

async function freshRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'mlt-lib-'));
}

beforeAll(async () => {
  repoDir = await mkdtemp(join(tmpdir(), 'mlt-repo-'));
  await mkdir(join(repoDir, 'src'), { recursive: true });
  await writeFile(join(repoDir, 'src', 'a.ts'), 'line1\nexport function foo() {}\nfoo();\nline4\n', 'utf8');
  await execFileAsync('git', ['init', '-q'], { cwd: repoDir });
  await execFileAsync('git', ['config', 'user.email', 't@t.t'], { cwd: repoDir });
  await execFileAsync('git', ['config', 'user.name', 't'], { cwd: repoDir });
  await execFileAsync('git', ['add', '.'], { cwd: repoDir });
  await execFileAsync('git', ['commit', '-qm', 'init'], { cwd: repoDir });

  root = await freshRoot();
  const ref = await registerRepo(root, repoDir, 'a-repo');
  repoId = ref.id;
});

function conceptualPatch(): AgentSetPatch {
  return {
    version: 1,
    set: { title: 'TypeScript Basics', folderPath: 'typescript/basics', tagIds: [] },
    tagPatch: { reuse: [], add: [{ localId: 'unions', label: 'unions', kind: 'topic' }] },
    order: ['c1', 'c2'],
    cards: [
      {
        localId: 'c1', tagRefs: ['unions'],
        front: { prompt: 'What is a union type?' },
        back: { shortAnswer: 'A type that is one of several.', explanationMarkdown: 'A union `A | B` is either A or B...' },
      },
      {
        localId: 'c2', tagRefs: ['unions'],
        front: { prompt: 'How do you narrow a union?' },
        back: { shortAnswer: 'With a type guard.', explanationMarkdown: 'Use typeof/in/instanceof to narrow...' },
      },
    ],
  };
}

describe('importAgentSet — the only card-creation path', () => {
  it('imports a conceptual set: writes set/order/cards + grows the taxonomy', async () => {
    const r = await freshRoot();
    const res = await importAgentSet(r, conceptualPatch(), { agentName: 'test-agent' });
    expect(res.ok).toBe(true);
    expect(res.cards.every((c) => c.status === 'active')).toBe(true);

    const set = await loadSet(r, res.setId!);
    expect(set?.title).toBe('TypeScript Basics');
    const cards = await loadCardsForSet(r, res.setId!);
    expect(cards).toHaveLength(2);
    // conceptual cards carry NO source refs
    expect(cards.every((c) => c.sourceRefs === undefined)).toBe(true);
    // the proposed tag was added and cards point at its real id
    const tags = await loadTags(r);
    expect(tags.some((t) => t.label === 'unions')).toBe(true);
    const unionsId = tags.find((t) => t.label === 'unions')!.id;
    expect(cards.every((c) => c.tagIds.includes(unionsId))).toBe(true);
    // order.json lists both cards in agent order
    const order = await loadOrder(r, res.setId!);
    expect(order?.cardIds).toEqual(cards.map((c) => c.id).sort((a, b) =>
      order!.cardIds.indexOf(a) - order!.cardIds.indexOf(b)));
    expect(order?.cardIds).toHaveLength(2);
  });

  it('freezes cited code from DISK for a repo-grounded card (trust boundary)', async () => {
    const r = await freshRoot();
    await registerRepo(r, repoDir, 'a-repo');
    const patch: AgentSetPatch = {
      version: 1,
      set: { title: 'Repo Tour', tagIds: [] },
      tagPatch: { reuse: [], add: [{ localId: 'arch', label: 'architecture' }] },
      order: ['rc1'],
      cards: [{
        localId: 'rc1', tagRefs: ['arch'],
        front: { prompt: 'What does foo do at line 3 of a.ts?' },
        back: { shortAnswer: 'It is invoked.', explanationMarkdown: 'foo is defined then called.' },
        sourceRefs: [{ repoId, path: 'src/a.ts', startLine: 2, endLine: 3 }],
      }],
    };
    const res = await importAgentSet(r, patch);
    expect(res.ok).toBe(true);
    const cards = await loadCardsForSet(r, res.setId!);
    const ref = cards[0].sourceRefs![0];
    // the FROZEN text is the real disk content, not anything the agent sent
    expect(ref.frozenText).toBe('export function foo() {}\nfoo();');
    expect(ref.status).toBe('fresh');
    expect(ref.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(cards[0].status).toBe('active');
  });

  it('routes a card citing an unknown repo to needs_review (unresolved source)', async () => {
    const r = await freshRoot();
    const patch: AgentSetPatch = {
      version: 1,
      set: { title: 'Broken Ref', tagIds: [] },
      tagPatch: { reuse: [], add: [] },
      order: ['b1'],
      cards: [{
        localId: 'b1', tagRefs: [],
        front: { prompt: 'What is at that line?' },
        back: { shortAnswer: 'Unknown.', explanationMarkdown: 'n/a' },
        sourceRefs: [{ repoId: 'repo_ghost', path: 'x.ts', startLine: 1, endLine: 2 }],
      }],
    };
    const res = await importAgentSet(r, patch);
    expect(res.ok).toBe(true);
    expect(res.cards[0].status).toBe('needs_review');
    expect(res.cards[0].reasons).toContain('source:unresolved');
  });

  it('rejects the whole patch (writes nothing) on an answer-leak', async () => {
    const r = await freshRoot();
    const patch = conceptualPatch();
    patch.cards[0].back.shortAnswer = 'union type';
    patch.cards[0].front.prompt = 'Define a union type'; // leaks + no '?'
    const res = await importAgentSet(r, patch);
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.code === 'answer_leak')).toBe(true);
    // nothing persisted
    const tags = await loadTags(r);
    expect(tags).toHaveLength(0);
  });

  it('rejects when order does not cover the cards', async () => {
    const r = await freshRoot();
    const patch = conceptualPatch();
    patch.order = ['c1']; // c2 missing
    const res = await importAgentSet(r, patch);
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.code === 'order_missing')).toBe(true);
  });
});
