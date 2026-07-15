import { mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runDoctor } from '../../../src/core/library/doctor.js';

describe('doctor', () => {
  it('is read-only and reports the core setup checks', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'mlt-doctor-'));
    const root = join(parent, 'not-created-yet');
    const result = await runDoctor(root);
    const ids = result.checks.map((c) => c.id);
    expect(ids).toEqual(['node', 'library', 'skill-source', 'agents', 'git', 'lessons']);
    expect(result.checks.find((c) => c.id === 'node')?.status).toBe('PASS');
    expect(result.checks.find((c) => c.id === 'library')?.status).toBe('WARN');
    await expect(stat(root)).rejects.toThrow(); // doctor did not create it
  });
});
