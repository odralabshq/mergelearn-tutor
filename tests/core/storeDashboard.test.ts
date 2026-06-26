import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { writeDashboard } from '../../src/dashboard/html.js';
import { mergeLearningState } from '../../src/core/planner.js';
import { createEmptyState, initState, loadState, saveState, statePath } from '../../src/core/store.js';
import type { CommitArtifact, Concept } from '../../src/core/types.js';

const artifact: CommitArtifact = { id: 'a1', type: 'commit', externalId: 'abc123', title: 'commit', body: '', changedFiles: ['src/auth.ts'], diff: '+auth' };
const concept: Concept = { id: 'security.auth_boundary', label: 'Auth boundary', kind: 'security', description: 'Auth decisions', difficulty: 'advanced', parentIds: ['security'], prerequisiteIds: [], relatedIds: [], evidence: [{ commit: 'abc123', path: 'src/auth.ts', label: 'auth' }] };

describe('local state and dashboard', () => {
  it('persists transparent state and writes dashboard HTML', async () => {
    const repo = await mkdtemp(path.join(os.tmpdir(), 'mergelearn-tutor-state-'));
    await initState(repo, ['learn TypeScript']);
    const loaded = await loadState(repo);
    expect(loaded.goals).toContain('learn TypeScript');
    const next = mergeLearningState(createEmptyState(repo), [artifact], [concept]);
    await saveState(repo, next);
    expect(await readFile(statePath(repo), 'utf8')).toContain('security.auth_boundary');
    const dashboard = await writeDashboard(repo, next);
    const html = await readFile(dashboard, 'utf8');
    expect(html).toContain('MergeLearn Tutor');
    expect(html).toContain('Auth boundary');
  });
});
