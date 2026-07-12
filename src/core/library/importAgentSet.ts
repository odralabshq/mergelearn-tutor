/**
 * The import pipeline (docs/design/redesign-2026-07/03). The ONLY card-creation
 * path. Ties together: tagStore.applyTagPatch (graph protection) ->
 * validateSetPatchStructure (content gate) -> freezeSources (trust boundary) ->
 * decide status -> write set/order/cards + ImportRecord. All deterministic,
 * model-free. Nothing is written unless both validation gates pass.
 */

import { join } from 'node:path';

import type {
  AgentSetPatch, Card, CardSet, CardStatus, ImportRecord, SetOrder,
} from './types.js';
import { loadTags, saveTags, applyTagPatch, tagIdFromLabel } from './tagStore.js';
import { validateSetPatchStructure, type PatchValidationError } from './validateSetPatch.js';
import { freezeSourceRefs } from './freezeSources.js';
import { saveSet, saveOrder } from './setStore.js';
import { saveCard } from './cardStore.js';
import { newFsrsState } from './fsrs.js';
import { readJson, writeJson } from './io.js';
import { libraryPaths } from './libraryStore.js';
import { nowIso, stableId } from '../util.js';

export type ImportCardResult = { localId: string; cardId: string; status: CardStatus; reasons: string[] };
export type ImportResult = {
  ok: boolean;
  errors: PatchValidationError[];
  setId?: string;
  cards: ImportCardResult[];
  tagIdsAdded: string[];
};

export type ImportOptions = { agentName?: string; agentModel?: string; now?: Date; dryRun?: boolean };

function setIdFromTitle(title: string): string {
  // Linear split/filter/join — no anchored-quantifier regex (ReDoS-safe,
  // CodeQL js/polynomial-redos). Same slug as collapse-then-trim.
  return title.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).join('-') || 'set';
}

/**
 * Apply an AgentSetPatch. Both gates (tag-graph + structure) must pass before
 * anything is written; on failure the library is untouched.
 */
export async function importAgentSet(
  root: string,
  patch: AgentSetPatch,
  opts: ImportOptions = {},
): Promise<ImportResult> {
  const now = opts.now ?? new Date();
  const iso = now.toISOString();

  // Gate 1: tag-graph. Pure; no disk write yet.
  const existingTags = await loadTags(root);
  const tagResult = applyTagPatch(existingTags, patch.tagPatch ?? { reuse: [], add: [] });

  // Gate 2: structure. Resolvable tagRefs = existing ids + proposed localIds.
  const existingTagIds = new Set(existingTags.map((t) => t.id));
  const proposedLocalIds = new Set((patch.tagPatch?.add ?? []).map((p) => p.localId));
  const structure = validateSetPatchStructure(patch, existingTagIds, proposedLocalIds);

  const errors = [
    ...tagResult.errors.map((e) => ({ code: `tag:${e.code}`, message: e.message })),
    ...structure.errors,
  ];
  if (!tagResult.ok || !structure.ok) {
    return { ok: false, errors, cards: [], tagIdsAdded: [] };
  }

  return persist(root, patch, tagResult, iso, opts);
}

async function persist(
  root: string,
  patch: AgentSetPatch,
  tagResult: Awaited<ReturnType<typeof applyTagPatch>>,
  iso: string,
  opts: ImportOptions,
): Promise<ImportResult> {
  // Commit the taxonomy first (validated pure result). Skipped on a dry run so
  // a preview never mutates the tag graph.
  if (!opts.dryRun) await saveTags(root, tagResult.mergedTags);

  const setId = patch.set.id ?? setIdFromTitle(patch.set.title);
  const resolveTagRef = (ref: string): string => tagResult.localIdToTagId.get(ref) ?? ref;

  // Map each card's localId (and any pre-set id) to its real, stable cardId.
  const cardIdOf = new Map<string, string>();
  for (const c of patch.cards) {
    const cardId = c.id ?? stableId('card', `${setId}:${c.localId}`);
    cardIdOf.set(c.localId, cardId);
    if (c.id) cardIdOf.set(c.id, cardId);
  }

  const results: ImportCardResult[] = [];
  const cards: Card[] = [];
  for (const c of patch.cards) {
    const cardId = cardIdOf.get(c.localId)!;
    const sourceRefs = await freezeSourceRefs(root, c.sourceRefs);
    const reasons: string[] = [];
    // Status: a cited-but-unresolvable source can't be verified -> needs_review.
    // Conceptual cards (no refs) and fully-frozen cards are active.
    const hadRefs = (c.sourceRefs?.length ?? 0) > 0;
    const anyMissing = sourceRefs.some((r) => r.status !== 'fresh');
    let status: CardStatus = 'active';
    if (hadRefs && anyMissing) {
      status = 'needs_review';
      reasons.push('source:unresolved');
    }
    cards.push(buildCard(setId, cardId, c, sourceRefs, status, iso, opts, resolveTagRef));
    results.push({ localId: c.localId, cardId, status, reasons });
  }

  // Dry run: everything above is read-only (gates + freezeSourceRefs + status
  // computation). Return the preview without any set/card/order/record write.
  if (opts.dryRun) {
    return { ok: true, errors: [], setId, cards: results, tagIdsAdded: tagResult.addedTagIds };
  }

  return finalize(root, patch, setId, cards, cardIdOf, results, tagResult.addedTagIds, iso, opts);
}

function buildCard(
  setId: string,
  cardId: string,
  draft: AgentSetPatch['cards'][number],
  sourceRefs: Card['sourceRefs'],
  status: CardStatus,
  iso: string,
  opts: ImportOptions,
  resolveTagRef: (ref: string) => string,
): Card {
  return {
    id: cardId,
    setId,
    folderPath: draft.folderPath,
    tagIds: (draft.tagRefs ?? []).map(resolveTagRef),
    front: draft.front,
    back: draft.back,
    difficulty: draft.difficulty,
    altitude: draft.altitude,
    interaction: draft.interaction,
    sourceRefs: sourceRefs && sourceRefs.length > 0 ? sourceRefs : undefined,
    status,
    fsrs: newFsrsState(new Date(iso)),
    createdBy: { agentName: opts.agentName, agentModel: opts.agentModel, importedAt: iso },
    createdAt: iso,
    updatedAt: iso,
  };
}

async function finalize(
  root: string,
  patch: AgentSetPatch,
  setId: string,
  cards: Card[],
  cardIdOf: Map<string, string>,
  results: ImportCardResult[],
  addedTagIds: string[],
  iso: string,
  opts: ImportOptions,
): Promise<ImportResult> {
  // Merge with any existing set (adding cards to an existing set is allowed).
  const existing = await readJson<CardSet>(libraryPaths(root).setFile(setId));
  const set: CardSet = {
    id: setId,
    title: patch.set.title,
    description: patch.set.description ?? existing?.description,
    folderPath: patch.set.folderPath ?? existing?.folderPath,
    repoId: existing?.repoId,
    tagIds: patch.set.tagIds ?? existing?.tagIds ?? [],
    // Lesson metadata: a re-import can set it; unset fields keep prior values.
    objective: patch.set.objective ?? existing?.objective,
    lessonKind: patch.set.lessonKind ?? existing?.lessonKind,
    prerequisiteTagIds: patch.set.prerequisiteTagIds ?? existing?.prerequisiteTagIds,
    estimatedMinutes: patch.set.estimatedMinutes ?? existing?.estimatedMinutes,
    defaultAltitude: patch.set.defaultAltitude ?? existing?.defaultAltitude,
    createdVia: existing?.createdVia ?? 'agent_import',
    createdAt: existing?.createdAt ?? iso,
    updatedAt: iso,
  };
  await saveSet(root, set);
  for (const card of cards) await saveCard(root, card);

  // order.json: map the patch's order keys to real cardIds, then append any
  // pre-existing card ids not in this patch (so re-imports don't drop cards).
  const prevOrder = await readJson<SetOrder>(libraryPaths(root).orderFile(setId));
  const orderedIds = (patch.order ?? []).map((k) => cardIdOf.get(k)).filter((x): x is string => !!x);
  const merged = [...(prevOrder?.cardIds ?? [])];
  for (const id of orderedIds) if (!merged.includes(id)) merged.push(id);
  const order: SetOrder = {
    version: 1,
    strategy: 'agent_authored',
    cardIds: merged,
    note: patch.orderNote ?? prevOrder?.note,
  };
  await saveOrder(root, setId, order);

  const record: ImportRecord = {
    id: stableId('import', `${setId}:${iso}`),
    setId,
    agentName: opts.agentName,
    agentModel: opts.agentModel,
    cardIds: cards.map((c) => c.id),
    tagIdsAdded: addedTagIds,
    createdAt: iso,
  };
  const importsPath = join(libraryPaths(root).setDir(setId), 'imports.json');
  const priorImports = (await readJson<ImportRecord[]>(importsPath)) ?? [];
  await writeJson(importsPath, [...priorImports, record]);

  return { ok: true, errors: [], setId, cards: results, tagIdsAdded: addedTagIds };
}
