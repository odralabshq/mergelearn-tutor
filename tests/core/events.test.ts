import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { addCorrection, recordReviewEvent } from '../../src/core/events.js';
import { loadState, stateDir } from '../../src/core/store.js';
import type { TutorState } from '../../src/core/types.js';

function state(): TutorState {
  return {
    version: 1,
    repoPath: '/tmp/repo',
    goals: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    artifacts: [],
    concepts: [{ id: 'repo.auth', label: 'auth', kind: 'repo_domain', description: 'Auth term', difficulty: 'beginner', parentIds: [], prerequisiteIds: [], relatedIds: [], evidence: [{ path: 'src/auth.ts', label: 'evidence' }] }],
    conceptStates: [{ conceptId: 'repo.auth', exposureCount: 1, activeRecallCount: 0, correctCount: 0, failedCount: 0, hintCount: 0, masteryEstimate: 0.2, confidence: 0.2, importance: 0.6, repoRelevance: 0.5 }],
    learningItems: [{ id: 'item_auth', conceptId: 'repo.auth', type: 'explain_back', title: 'auth in your recent work', bodyMarkdown: 'body', prompt: 'Explain auth clearly from evidence.', expectedFocus: ['auth'], evidence: [{ path: 'src/auth.ts', label: 'evidence' }], difficulty: 'beginner', createdAt: '2026-01-01T00:00:00.000Z' }],
    learningEvents: [],
    corrections: [],
    manualRatings: [],
  };
}

describe('review events and corrections', () => {
  it('records feedback events and updates concept state', () => {
    const next = recordReviewEvent(state(), { itemId: 'item_auth', eventType: 'marked_wrong', note: 'bad card' });
    expect(next.learningEvents).toHaveLength(1);
    expect(next.learningEvents[0]?.eventType).toBe('marked_wrong');
    expect(next.conceptStates[0]?.failedCount).toBe(1);
    expect(next.conceptStates[0]?.masteryEstimate).toBeLessThan(0.2);
  });

  it('suppresses not useful concepts from future cards', () => {
    const next = addCorrection(state(), { targetId: 'repo.auth', correctionType: 'not_useful', note: 'too generic' });
    expect(next.corrections).toHaveLength(1);
    expect(next.learningItems.find((item) => item.conceptId === 'repo.auth')).toBeUndefined();
    expect(next.conceptStates.find((item) => item.conceptId === 'repo.auth')?.importance).toBe(0);
  });

  it('moves suppressed concepts below active concepts', () => {
    const base = state();
    base.concepts.push({ id: 'repo.cli', label: 'cli', kind: 'repo_domain', description: 'CLI term', difficulty: 'beginner', parentIds: [], prerequisiteIds: [], relatedIds: [], evidence: [{ path: 'src/cli.ts', label: 'evidence' }] });
    base.conceptStates.push({ conceptId: 'repo.cli', exposureCount: 1, activeRecallCount: 0, correctCount: 0, failedCount: 0, hintCount: 0, masteryEstimate: 0.2, confidence: 0.2, importance: 0.6, repoRelevance: 0.5 });
    const next = addCorrection(base, { targetId: 'repo.auth', correctionType: 'not_useful' });
    expect(next.conceptStates.at(-1)?.conceptId).toBe('repo.auth');
  });

  it('renames concepts with better_label corrections', () => {
    const next = addCorrection(state(), { targetId: 'repo.auth', correctionType: 'better_label', replacementLabel: 'session authorization' });
    expect(next.concepts[0]?.label).toBe('session authorization');
    expect(next.learningItems[0]?.title).toBe('session authorization in your recent work');
  });

  it('normalizes older state files without corrections', async () => {
    const repo = await mkdtemp(path.join(os.tmpdir(), 'mergelearn-tutor-old-state-'));
    const oldState = state();
    const { corrections, manualRatings, ...withoutNewFields } = oldState;
    await writeFile(path.join(repo, '.gitkeep'), '');
    await writeFile(path.join(repo, '.skilltrace-do-not-use'), '');
    await writeFile(path.join(repo, 'state.json'), JSON.stringify(withoutNewFields));
    await writeFile(path.join(repo, '.placeholder'), '');
    await import('node:fs/promises').then(async ({ mkdir, rename }) => {
      await mkdir(stateDir(repo), { recursive: true });
      await rename(path.join(repo, 'state.json'), path.join(stateDir(repo), 'state.json'));
    });
    expect((await loadState(repo)).corrections).toEqual([]);
    expect((await loadState(repo)).manualRatings).toEqual([]);
  });
});
