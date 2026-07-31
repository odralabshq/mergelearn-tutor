import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { freezeSourceRef } from '../../../src/core/library/freezeSources.js';
import { readRange } from '../../../src/core/library/repoRead.js';
import { registerRepo } from '../../../src/core/library/repoRegistry.js';

const FIVE_LINES = 'one\ntwo\nthree\nfour\nfive\n';

async function repoWith(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ml-provenance-repo-'));
  for (const [name, text] of Object.entries(files)) {
    await writeFile(join(dir, name), text, 'utf8');
  }
  return dir;
}

const freshHome = () => mkdtemp(join(tmpdir(), 'ml-provenance-home-'));

describe('readRange line-range guards', () => {
  it('returns exactly the requested lines for a valid range', async () => {
    const repo = await repoWith({ 'a.ts': FIVE_LINES });
    const range = await readRange(repo, 'a.ts', 2, 4);
    expect(range.startLine).toBe(2);
    expect(range.endLine).toBe(4);
    expect(range.text).toBe('two\nthree\nfour');
  });

  it('throws when startLine is past end of file instead of returning an empty snippet', async () => {
    const repo = await repoWith({ 'a.ts': FIVE_LINES });
    await expect(readRange(repo, 'a.ts', 200, 210))
      .rejects.toThrow(/startLine 200 is past end of file \(5 lines\)/);
  });

  it('draws the boundary at exactly one line past the end', async () => {
    const repo = await repoWith({ 'a.ts': FIVE_LINES });
    const last = await readRange(repo, 'a.ts', 5, 5);
    expect(last.text).toBe('five');
    await expect(readRange(repo, 'a.ts', 6, 6)).rejects.toThrow(/past end of file/);
  });

  it('still clamps an over-long endLine, which yields real content', async () => {
    const repo = await repoWith({ 'a.ts': FIVE_LINES });
    const range = await readRange(repo, 'a.ts', 4, 999);
    expect(range.endLine).toBe(5);
    expect(range.text).toBe('four\nfive');
  });
});

describe("freezeSourceRef invariant: status 'fresh' implies non-empty frozenText", () => {
  it('freezes real cited content as fresh', async () => {
    const root = await freshHome();
    const repo = await repoWith({ 'a.ts': FIVE_LINES });
    const ref = await registerRepo(root, repo);
    const frozen = await freezeSourceRef(root, { repoId: ref.id, path: 'a.ts', startLine: 1, endLine: 2 });
    expect(frozen.status).toBe('fresh');
    expect(frozen.frozenText).toBe('one\ntwo');
  });

  it('reports a past-EOF citation as missing, never fresh-and-empty', async () => {
    const root = await freshHome();
    const repo = await repoWith({ 'a.ts': FIVE_LINES });
    const ref = await registerRepo(root, repo);
    const frozen = await freezeSourceRef(root, { repoId: ref.id, path: 'a.ts', startLine: 200, endLine: 210 });
    expect(frozen.status).toBe('missing');
    expect(frozen.frozenText ?? '').toBe('');
    // The stored range must stay as AUTHORED, never inverted (was 200-50).
    expect(frozen.startLine).toBe(200);
    expect(frozen.endLine).toBe(210);
    expect(frozen.endLine).toBeGreaterThanOrEqual(frozen.startLine);
  });

  it('reports a citation into an empty file as missing (readRange cannot throw here)', async () => {
    const root = await freshHome();
    const repo = await repoWith({ 'empty.ts': '' });
    const ref = await registerRepo(root, repo);
    const frozen = await freezeSourceRef(root, { repoId: ref.id, path: 'empty.ts', startLine: 1, endLine: 1 });
    expect(frozen.status).toBe('missing');
    expect(frozen.frozenText ?? '').toBe('');
  });

  it('reports a blank-line-only citation as missing', async () => {
    const root = await freshHome();
    const repo = await repoWith({ 'blank.ts': 'code\n\n\nmore\n' });
    const ref = await registerRepo(root, repo);
    const frozen = await freezeSourceRef(root, { repoId: ref.id, path: 'blank.ts', startLine: 2, endLine: 2 });
    expect(frozen.status).toBe('missing');
  });
});
