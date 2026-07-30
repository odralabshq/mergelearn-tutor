import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { importAgentSet } from '../../../src/core/library/importAgentSet.js';
import { registerRepo } from '../../../src/core/library/repoRegistry.js';
import { loadCardsForSet, saveCard } from '../../../src/core/library/cardStore.js';
import { archiveCard } from '../../../src/core/library/cardLifecycle.js';
import { checkDrift } from '../../../src/core/library/drift.js';
import type { AgentSetPatch } from '../../../src/core/library/types.js';

const execFileAsync = promisify(execFile);

const FILE = 'line1\nexport function foo() {}\nfoo();\nline4\n';
/** Well-formed but absent. An amended commit stays reachable until gc, so it
 *  cannot stand in for a genuinely orphaned SHA. */
const GONE_SHA = 'a'.repeat(40);

let root = '';
let repoDir = '';
let repoId = '';
let setId = '';

/** One grounded card citing lines 2-3, plus one conceptual card. */
function patch(): AgentSetPatch {
  return {
    version: 1,
    set: { id: 'drift-deck', title: 'Drift Deck', tagIds: [] },
    tagPatch: { reuse: [], add: [] },
    order: ['grounded', 'conceptual'],
    cards: [
      {
        localId: 'grounded', tagRefs: [],
        front: { prompt: 'What does foo do?' },
        back: { shortAnswer: 'It is invoked.', explanationMarkdown: 'defined then called' },
        sourceRefs: [{ repoId, path: 'src/a.ts', startLine: 2, endLine: 3 }],
      },
      {
        localId: 'conceptual', tagRefs: [],
        front: { prompt: 'What is a union type?' },
        back: { shortAnswer: 'One of several.', explanationMarkdown: 'A | B' },
      },
    ],
  };
}

async function groundedCardId(): Promise<string> {
  const cards = await loadCardsForSet(root, setId);
  return cards.find((card) => (card.sourceRefs ?? []).length > 0)!.id;
}

/** Rewrite the grounded card's citation, to stage a case git cannot produce. */
async function patchCitation(changes: { repoId?: string; commit?: string }): Promise<void> {
  const cards = await loadCardsForSet(root, setId);
  const card = cards.find((c) => (c.sourceRefs ?? []).length > 0)!;
  await saveCard(root, {
    ...card,
    sourceRefs: card.sourceRefs!.map((ref) => ({ ...ref, ...changes })),
  });
}

beforeEach(async () => {
  repoDir = await mkdtemp(join(tmpdir(), 'mlt-drift-repo-'));
  await mkdir(join(repoDir, 'src'), { recursive: true });
  await writeFile(join(repoDir, 'src', 'a.ts'), FILE, 'utf8');
  await execFileAsync('git', ['init', '-q'], { cwd: repoDir });
  await execFileAsync('git', ['config', 'user.email', 't@t.t'], { cwd: repoDir });
  await execFileAsync('git', ['config', 'user.name', 't'], { cwd: repoDir });
  await execFileAsync('git', ['add', '.'], { cwd: repoDir });
  await execFileAsync('git', ['commit', '-qm', 'init'], { cwd: repoDir });

  root = await mkdtemp(join(tmpdir(), 'mlt-drift-'));
  repoId = (await registerRepo(root, repoDir, 'drift-repo')).id;
  const result = await importAgentSet(root, patch());
  if (!result.ok) throw new Error('drift seed import failed');
  setId = result.setId!;
});

describe('drift (frozen citations vs the repo as it stands now)', () => {
  it('reports nothing stale while the cited lines are unchanged', async () => {
    const report = await checkDrift(root);
    expect(report).toMatchObject({ cardsChecked: 2, groundedCards: 1, stale: [] });
  });

  it('flags a card whose cited lines changed on disk', async () => {
    await writeFile(join(repoDir, 'src', 'a.ts'), FILE.replace('foo();', 'foo(42);'), 'utf8');

    const report = await checkDrift(root);
    expect(report.stale).toHaveLength(1);
    expect(report.stale[0]).toMatchObject({
      setId, cardId: await groundedCardId(), status: 'drifted', archived: false,
    });
    expect(report.stale[0]!.refs[0]!.detail).toContain('no longer matches');
  });

  it('flags a card whose cited file is gone as missing, not merely drifted', async () => {
    await rm(join(repoDir, 'src', 'a.ts'));

    const report = await checkDrift(root);
    expect(report.stale.map((card) => card.status)).toEqual(['missing']);
    expect(report.stale[0]!.refs[0]!.detail).toContain('cannot be read');
  });

  it('flags an unregistered repo as missing', async () => {
    await patchCitation({ repoId: 'repo_ghost' });

    const report = await checkDrift(root);
    expect(report.stale.map((card) => card.status)).toEqual(['missing']);
    expect(report.stale[0]!.refs[0]!.detail).toContain('not registered');
  });

  it('flags a citation whose commit no longer exists, even when the file still matches', async () => {
    await patchCitation({ commit: GONE_SHA });

    const report = await checkDrift(root);
    expect(report.stale.map((card) => card.status)).toEqual(['orphaned_commit']);
    expect(report.stale[0]!.refs[0]!.detail).toContain('no longer exists');
  });

  it('never counts conceptual cards as grounded, so they cannot drift', async () => {
    await rm(join(repoDir, 'src', 'a.ts'));

    const report = await checkDrift(root);
    expect(report.cardsChecked).toBe(2);
    expect(report.groundedCards).toBe(1);
    expect(report.stale).toHaveLength(1);
  });

  it('skips archived cards by default and includes them on request', async () => {
    await writeFile(join(repoDir, 'src', 'a.ts'), 'replaced\n', 'utf8');
    await archiveCard(root, setId, await groundedCardId());

    expect((await checkDrift(root)).stale).toEqual([]);
    const withArchived = await checkDrift(root, { includeArchived: true });
    expect(withArchived.stale).toHaveLength(1);
    expect(withArchived.stale[0]!.archived).toBe(true);
  });

  it('can restrict the check to one set', async () => {
    expect((await checkDrift(root, { setId })).groundedCards).toBe(1);
    expect((await checkDrift(root, { setId: 'no-such-set' })).groundedCards).toBe(0);
  });
});
