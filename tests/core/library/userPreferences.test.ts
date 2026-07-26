import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadUserPreferences, saveUserPreferences } from '../../../src/core/library/userPreferences.js';

describe('user preferences', () => {
  it('defaults safely and persists reviewed settings', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mlt-prefs-'));
    expect(await loadUserPreferences(root)).toEqual({ dailyReviewCap: 60, queueStrategy: 'interleaved' });
    await saveUserPreferences(root, { dailyReviewCap: 12, queueStrategy: 'overdue' });
    expect(await loadUserPreferences(root)).toEqual({ dailyReviewCap: 12, queueStrategy: 'overdue' });
  });
});
