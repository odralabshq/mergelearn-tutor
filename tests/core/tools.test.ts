import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { grepRepo, readRange, gitContext } from '../../src/core/tools.js';

let dir = '';

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mlt-tools-'));
  await mkdir(join(dir, 'src'), { recursive: true });
  await writeFile(join(dir, 'src', 'a.ts'), 'line1\nexport function foo() {}\nfoo();\nline4\n', 'utf8');
  await writeFile(join(dir, 'src', 'b.ts'), 'const x = 1;\n', 'utf8');
});

describe('context tools', () => {
  it('grepRepo returns path:line:text hits for a symbol', async () => {
    const hits = await grepRepo(dir, 'foo');
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits[0]).toHaveProperty('line');
    expect(hits.every((h) => h.path.includes('a.ts'))).toBe(true);
  });

  it('grepRepo returns [] on no match, not a throw', async () => {
    expect(await grepRepo(dir, 'zzz_nomatch_zzz')).toEqual([]);
  });

  it('readRange fetches an exact 1-based inclusive slice', async () => {
    const r = await readRange(dir, 'src/a.ts', 2, 3);
    expect(r.text).toBe('export function foo() {}\nfoo();');
    expect(r.startLine).toBe(2);
    expect(r.endLine).toBe(3);
  });

  it('readRange clamps out-of-bounds ends to the file', async () => {
    const r = await readRange(dir, 'src/b.ts', 1, 999);
    expect(r.endLine).toBe(1);
  });

  it('readRange rejects paths that escape the repo', async () => {
    await expect(readRange(dir, '../../etc/passwd', 1, 1)).rejects.toThrow(/escapes/);
  });

  it('gitContext returns an array for a real repo path', async () => {
    const commits = await gitContext(process.cwd(), 'package.json', { since: '3650d', limit: 3 });
    expect(Array.isArray(commits)).toBe(true);
  });
});

afterAll(() => {
  void dir;
});
