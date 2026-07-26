import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadUserPreferences, saveUserPreferences } from '../../../src/core/library/userPreferences.js';
import { libraryPaths } from '../../../src/core/library/libraryStore.js';
import { writeJson } from '../../../src/core/library/io.js';

describe('user preferences', () => {
  it('defaults safely and persists reviewed settings', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mlt-prefs-'));
    expect(await loadUserPreferences(root)).toEqual({ reviewSessionCap: 60, queueStrategy: 'interleaved' });
    await saveUserPreferences(root, { reviewSessionCap: 12, queueStrategy: 'overdue' });
    expect(await loadUserPreferences(root)).toEqual({ reviewSessionCap: 12, queueStrategy: 'overdue' });
  });

  it('migrates the early daily cap key as a per-sitting cap', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mlt-prefs-legacy-'));
    await writeJson(libraryPaths(root).userFile, { dailyReviewCap: 9, queueStrategy: 'overdue' });
    expect(await loadUserPreferences(root)).toEqual({ reviewSessionCap: 9, queueStrategy: 'overdue' });
  });
});
