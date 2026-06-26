import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadPreferences, normalizePreferences, savePreferences } from '../../src/core/preferences.js';

describe('preferences', () => {
  it('returns defaults when preferences file is missing', async () => {
    const repo = await mkdtemp(path.join(os.tmpdir(), 'mergelearn-tutor-prefs-'));
    const prefs = await loadPreferences(repo);
    expect(prefs.review.mode).toBe('snippet_first');
    expect(prefs.review.enabledPlanes).toContain('local_behavior');
  });

  it('normalizes invalid values and persists valid settings', async () => {
    const repo = await mkdtemp(path.join(os.tmpdir(), 'mergelearn-tutor-prefs-'));
    const prefs = normalizePreferences({ review: { enabledPlanes: ['risk_and_tests'], snippetLineCount: 200, showExplanationsByDefault: true } });
    await savePreferences(repo, prefs);
    const raw = await readFile(path.join(repo, '.skilltrace', 'preferences.json'), 'utf8');
    expect(raw).toContain('risk_and_tests');
    const loaded = await loadPreferences(repo);
    expect(loaded.review.snippetLineCount).toBe(40);
    expect(loaded.review.showExplanationsByDefault).toBe(true);
  });
});
