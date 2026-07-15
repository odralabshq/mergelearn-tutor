/**
 * Opt-in sample lesson installer. Reads the canonical patch shipped at
 * examples/sample-lesson.json and imports it through the normal validation +
 * persistence path (importAgentSet). Nothing here special-cases storage.
 *
 * Idempotent: if the sample set already exists it is left untouched so a
 * learner's progress is never clobbered. Nothing installs automatically; a
 * user opts in via `mergelearn sample` or the empty-state button.
 */

import { readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AgentSetPatch } from './types.js';
import { importAgentSet } from './importAgentSet.js';
import { loadSet } from './setStore.js';

/** The stable id the sample patch pins (examples/sample-lesson.json set.id). */
export const SAMPLE_SET_ID = 'mergelearn-sample';

export type SampleStatus = 'installed' | 'current';
export type SampleResult = {
  ok: boolean;
  status: SampleStatus;
  setId: string;
  title: string;
  cardCount: number;
  errors?: { code: string; message: string }[];
};

/** Locate examples/sample-lesson.json across dev (src/core/library), built
 * (dist/core/library), and packaged (node_modules/<pkg>/dist/...) layouts by
 * walking up until an examples/ dir is found. Overridable for tests. */
export async function resolveSamplePatchPath(explicit?: string): Promise<string> {
  if (explicit) return explicit;
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, 'examples', 'sample-lesson.json');
    try {
      if ((await stat(candidate)).isFile()) return candidate;
    } catch { /* keep walking up */ }
    dir = dirname(dir);
  }
  throw new Error('could not locate examples/sample-lesson.json');
}

export async function loadSamplePatch(explicitPath?: string): Promise<AgentSetPatch> {
  const path = await resolveSamplePatchPath(explicitPath);
  return JSON.parse(await readFile(path, 'utf8')) as AgentSetPatch;
}

export type InstallSampleOptions = { dryRun?: boolean; patchPath?: string; now?: Date };

/** Install the sample lesson if absent. Returns 'current' (no write) when the
 * sample set already exists, so reruns are safe. */
export async function installSampleLesson(root: string, opts: InstallSampleOptions = {}): Promise<SampleResult> {
  const patch = await loadSamplePatch(opts.patchPath);
  const setId = patch.set.id ?? SAMPLE_SET_ID;
  const title = patch.set.title;
  const cardCount = patch.cards.length;

  const existing = await loadSet(root, setId);
  if (existing) {
    return { ok: true, status: 'current', setId, title, cardCount };
  }

  const res = await importAgentSet(root, patch, { agentName: 'mergelearn-sample', dryRun: opts.dryRun, now: opts.now });
  if (!res.ok) {
    return { ok: false, status: 'installed', setId, title, cardCount, errors: res.errors };
  }
  return { ok: true, status: 'installed', setId: res.setId ?? setId, title, cardCount: res.cards.length };
}
