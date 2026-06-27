import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { writeDashboard } from '../../src/dashboard/html.js';
import { mergeLearningState } from '../../src/core/planner.js';
import { createEmptyState, initState, loadState, saveState, statePath } from '../../src/core/store.js';
import type { CommitArtifact, Concept } from '../../src/core/types.js';

const artifact: CommitArtifact = { id: 'a1', type: 'commit', externalId: 'abc123', title: 'commit', body: '', changedFiles: ['src/auth.ts'], diff: '+auth' };
const concept: Concept = { id: 'security.auth_boundary', label: 'Auth boundary', kind: 'security', description: 'Auth decisions', difficulty: 'advanced', parentIds: ['security'], prerequisiteIds: [], relatedIds: [], evidence: [{ commit: 'abc123', path: 'src/auth.ts', label: 'auth', snippet: '+if (!session) return forbidden();' }] };

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
    expect(html).toContain('Progress map');
    expect(html).toContain('if (!session)');
  });

  it('loads legacy review events without persisted evidence metadata', async () => {
    const repo = await mkdtemp(path.join(os.tmpdir(), 'mergelearn-tutor-legacy-state-'));
    const state = mergeLearningState(createEmptyState(repo), [artifact], [concept]);
    await saveState(repo, {
      ...state,
      learningEvents: [{
        id: 'event_legacy',
        itemId: state.learningItems[0]!.id,
        conceptId: 'security.auth_boundary',
        eventType: 'marked_wrong_evidence',
        createdAt: state.createdAt,
      }],
    });
    const raw = JSON.parse(await readFile(statePath(repo), 'utf8'));
    delete raw.learningEvents[0].evidenceKey;
    delete raw.learningEvents[0].evidencePath;
    delete raw.learningEvents[0].questionPlane;
    await writeFile(statePath(repo), `${JSON.stringify(raw, null, 2)}\n`);

    const loaded = await loadState(repo);

    expect(loaded.version).toBe(1);
    expect(loaded.learningEvents[0]?.eventType).toBe('marked_wrong_evidence');
    expect(loaded.learningEvents[0]?.evidenceKey).toBeUndefined();
  });
});
