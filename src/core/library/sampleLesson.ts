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
import { loadCardsForSet } from './cardStore.js';
import { loadOrder } from './setStore.js';
import { loadTags, tagIdFromLabel } from './tagStore.js';
import { readJson } from './io.js';
import { libraryPaths } from './libraryStore.js';

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

export type InstallSampleOptions = {
  dryRun?: boolean;
  patchPath?: string;
  now?: Date;
  assertOwnership?: () => Promise<void>;
};

/** Install the sample lesson if absent. Returns 'current' (no write) when the
 * sample set already exists, so reruns are safe. */
export async function installSampleLesson(root: string, opts: InstallSampleOptions = {}): Promise<SampleResult> {
  let patch = await loadSamplePatch(opts.patchPath);
  const setId = patch.set.id ?? SAMPLE_SET_ID;
  const title = patch.set.title;
  const cardCount = patch.cards.length;

  const existing = await loadSet(root, setId);
  const [existingCards, existingOrder] = existing
    ? await Promise.all([loadCardsForSet(root, setId), loadOrder(root, setId)])
    : [[], undefined];
  const imports = existing
    ? await readJson<unknown[]>(join(libraryPaths(root).setDir(setId), 'imports.json'))
    : undefined;
  const interruptedInstall = !!existing && existingCards.length === 0
    && !existingOrder && !imports;
  if (existing && !interruptedInstall) {
    return { ok: true, status: 'current', setId, title, cardCount };
  }

  if (interruptedInstall) {
    const existingTagIds = new Set((await loadTags(root)).map((tag) => tag.id));
    const recoveredTags = new Map<string, string>();
    for (const tag of patch.tagPatch?.add ?? []) {
      const id = tagIdFromLabel(tag.label);
      if (existingTagIds.has(id)) recoveredTags.set(tag.localId, id);
    }
    if (recoveredTags.size > 0) {
      const mapRef = (ref: string) => recoveredTags.get(ref) ?? ref;
      patch = {
        ...patch,
        tagPatch: {
          reuse: [...new Set([...(patch.tagPatch?.reuse ?? []), ...recoveredTags.values()])],
          add: (patch.tagPatch?.add ?? [])
            .filter((tag) => !recoveredTags.has(tag.localId))
            .map((tag) => ({
              ...tag,
              parentIds: tag.parentIds?.map(mapRef),
              relatedIds: tag.relatedIds?.map(mapRef),
            })),
        },
        cards: patch.cards.map((card) => ({ ...card, tagRefs: card.tagRefs?.map(mapRef) })),
      };
    }
  }

  const res = await importAgentSet(root, patch, {
    agentName: 'mergelearn-sample', dryRun: opts.dryRun, now: opts.now,
    assertOwnership: opts.assertOwnership,
  });
  if (!res.ok) {
    return { ok: false, status: 'installed', setId, title, cardCount, errors: res.errors };
  }
  return { ok: true, status: 'installed', setId: res.setId ?? setId, title, cardCount: res.cards.length };
}
