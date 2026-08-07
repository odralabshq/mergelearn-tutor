/**
 * The import pipeline (docs/design/redesign-2026-07/03). The ONLY card-creation
 * path. Ties together: tagStore.applyTagPatch (graph protection) ->
 * validateSetPatchStructure (content gate) -> freezeSources (trust boundary) ->
 * decide status -> write set/order/cards + ImportRecord. All deterministic,
 * model-free. Nothing is written unless both validation gates pass.
 */

import { join } from 'node:path';

import type {
  AgentSetPatch, Card, CardSet, CardStatus, ImportRecord, SetOrder, SourceRef,
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
import { storageIdError } from './storageId.js';
import { normalizeProblemRefs } from './problemRefs.js';

export type ImportCardResult = { localId: string; cardId: string; status: CardStatus; reasons: string[] };
export type ImportResult = {
  ok: boolean;
  errors: PatchValidationError[];
  setId?: string;
  cards: ImportCardResult[];
  tagIdsAdded: string[];
  /** True when this applied INTO a lesson that already existed. A dry run that
   * says only "would apply set X" cannot be distinguished from creating a new
   * lesson, which is exactly how an accidental merge stays invisible. */
  mergedIntoExisting?: boolean;
};

export type ImportOptions = {
  agentName?: string;
  agentModel?: string;
  now?: Date;
  dryRun?: boolean;
  /** Internal trust seam for validated portable bundles. */
  frozenSourceRefsByLocalId?: ReadonlyMap<string, SourceRef[]>;
  /** Optional writer fence for server-owned imports. Revalidated before every write. */
  assertOwnership?: () => Promise<void>;
};

async function assertWriteOwnership(opts: ImportOptions): Promise<void> {
  await opts.assertOwnership?.();
}

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

  const idErrors: PatchValidationError[] = [];
  if (patch.set.id && storageIdError(patch.set.id)) idErrors.push({ code: 'set:id', message: `set id ${storageIdError(patch.set.id)}` });
  for (const card of patch.cards) {
    if (card.id && storageIdError(card.id)) idErrors.push({ code: 'card:id', message: `card ${card.localId} id ${storageIdError(card.id)}` });
  }
  if (idErrors.length) return { ok: false, errors: idErrors, cards: [], tagIdsAdded: [] };

  // Gate 1: tag-graph. Pure; no disk write yet.
  const existingTags = await loadTags(root);
  const tagResult = applyTagPatch(existingTags, patch.tagPatch ?? { reuse: [], add: [] });

  // Gate 2: structure. Resolvable tagRefs = existing ids + proposed localIds.
  const existingTagIds = new Set(existingTags.map((t) => t.id));
  const proposedLocalIds = new Set((patch.tagPatch?.add ?? []).map((p) => p.localId));
  const structure = validateSetPatchStructure(patch, existingTagIds, proposedLocalIds, now);

  const errors = [
    ...tagResult.errors.map((e) => ({ code: `tag:${e.code}`, message: e.message })),
    ...structure.errors,
  ];
  if (!tagResult.ok || !structure.ok) {
    return { ok: false, errors, cards: [], tagIdsAdded: [] };
  }

  // Gate 3: identity. An omitted set.id is DERIVED by slugifying the title,
  // which drops case and every punctuation run, so unrelated lessons collapse
  // onto one id and the first lesson's title, folderPath, objective, lessonKind
  // and estimatedMinutes get overwritten with no warning.
  //
  // The rule is deliberately absolute: an omitted id means CREATE, an explicit
  // id means UPDATE. Comparing titles (or objectives, or folders) to guess at
  // intent looked cheaper but has a false negative that matters - two agents
  // independently authoring "Error Handling" produce identical titles, so a
  // title check would wave the merge through and lose the first lesson exactly
  // as before. Titles are evidence, not identity.
  //
  // Cost: an agent re-applying an unchanged lesson without its id is now
  // rejected rather than quietly merging. That is the intended trade - the
  // `context` handshake already hands an updating agent the set id, and a
  // recoverable error beats silent data loss.
  if (!patch.set.id) {
    const derivedId = setIdFromTitle(patch.set.title);
    const occupant = await readJson<CardSet>(libraryPaths(root).setFile(derivedId));
    if (occupant) {
      return {
        ok: false,
        errors: [{
          code: 'set:id_collision',
          message: `set id "${derivedId}" derived from this title already holds the lesson `
            + `"${occupant.title}". To update or append to it, pass set.id "${derivedId}" `
            + 'explicitly (the `context` handshake lists it). To create a separate lesson, '
            + 'retitle this one so it derives a distinct id.',
        }],
        cards: [],
        tagIdsAdded: [],
      };
    }
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
  if (!opts.dryRun) {
    await assertWriteOwnership(opts);
    await saveTags(root, tagResult.mergedTags);
  }

  const setId = patch.set.id ?? setIdFromTitle(patch.set.title);
  // Read BEFORE any write so a dry run and a real apply agree on whether this
  // lands in an existing lesson.
  const mergedIntoExisting = (await readJson<CardSet>(libraryPaths(root).setFile(setId))) !== undefined;
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
    const suppliedSources = opts.frozenSourceRefsByLocalId?.get(c.localId);
    const sourceRefs = suppliedSources ?? await freezeSourceRefs(root, c.sourceRefs);
    const reasons: string[] = [];
    // Status: a cited-but-unresolvable source can't be verified -> needs_review.
    // Conceptual cards (no refs) and fully-frozen cards are active.
    const hadRefs = (c.sourceRefs?.length ?? 0) > 0;
    const anyMissing = sourceRefs.some((r) => r.status !== 'fresh');
    let status: CardStatus = 'active';
    if (!suppliedSources && hadRefs && anyMissing) {
      status = 'needs_review';
      reasons.push('source:unresolved');
    }
    // A re-import refreshes AGENT-AUTHORED teaching content; it must never
    // reset LEARNER-OWNED state. Load whatever is already stored at this card
    // id so buildCard can carry the schedule forward. Same principle the set
    // already applies to `spacedRepetition`: a learner preference is not
    // agent-authored lesson metadata.
    const existing = await readJson<Card>(libraryPaths(root).cardFile(setId, cardId));
    // Archiving is a learner decision too, so a refresh must not silently
    // resurrect a card into the review queue. Report the EFFECTIVE status so
    // the import summary matches what is actually on disk.
    const effectiveStatus: CardStatus = existing?.status === 'archived' ? 'archived' : status;
    if (effectiveStatus !== status) reasons.push('kept:archived');
    cards.push(buildCard(setId, cardId, c, sourceRefs, effectiveStatus, iso, opts, resolveTagRef, existing));
    results.push({ localId: c.localId, cardId, status: effectiveStatus, reasons });
  }

  // Dry run: everything above is read-only (gates + freezeSourceRefs + status
  // computation). Return the preview without any set/card/order/record write.
  if (opts.dryRun) {
    return { ok: true, errors: [], setId, cards: results, tagIdsAdded: tagResult.addedTagIds, mergedIntoExisting };
  }

  const result = await finalize(root, patch, setId, cards, cardIdOf, results, tagResult.addedTagIds, iso, opts, resolveTagRef);
  return { ...result, mergedIntoExisting };
}

function validatedProblemRefs(value: unknown, iso: string) {
  const result = normalizeProblemRefs(value, new Date(iso));
  if (!result.ok) throw new Error('problem references changed after validation');
  return result.refs;
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
  existing?: Card,
): Card {
  return {
    id: cardId,
    setId,
    siblingGroupId: draft.siblingGroupId?.trim(),
    problemRefs: validatedProblemRefs(draft.problemRefs, iso),
    folderPath: draft.folderPath,
    tagIds: (draft.tagRefs ?? []).map(resolveTagRef),
    // Everything above and below this line is agent-authored and IS replaced:
    // refreshing teaching content is the whole point of a re-import.
    front: draft.front,
    back: draft.back,
    difficulty: draft.difficulty,
    altitude: draft.altitude,
    interaction: draft.interaction,
    sourceRefs: sourceRefs && sourceRefs.length > 0 ? sourceRefs : undefined,
    status,
    // Learner-owned and creation facts: preserved across a re-import. Losing
    // `fsrs` silently discards weeks of review history and makes learned
    // material due immediately, while the session records that produced it
    // survive on disk and become orphaned.
    fsrs: existing?.fsrs ?? newFsrsState(new Date(iso)),
    createdBy: existing?.createdBy
      ?? { agentName: opts.agentName, agentModel: opts.agentModel, importedAt: iso },
    createdAt: existing?.createdAt ?? iso,
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
  resolveTagRef: (ref: string) => string,
): Promise<ImportResult> {
  // Merge with any existing set (adding cards to an existing set is allowed).
  const existing = await readJson<CardSet>(libraryPaths(root).setFile(setId));
  const set: CardSet = {
    id: setId,
    title: patch.set.title,
    description: patch.set.description ?? existing?.description,
    folderPath: patch.set.folderPath ?? existing?.folderPath,
    repoId: existing?.repoId,
    tagIds: (patch.set.tagIds ?? existing?.tagIds ?? []).map(resolveTagRef),
    // Problem references are author-owned: absence removes them on re-import.
    problemRefs: validatedProblemRefs(patch.set.problemRefs, iso),
    // Other lesson metadata keeps the established merge behavior.
    objective: patch.set.objective ?? existing?.objective,
    lessonKind: patch.set.lessonKind ?? existing?.lessonKind,
    prerequisiteTagIds: (patch.set.prerequisiteTagIds ?? existing?.prerequisiteTagIds)?.map(resolveTagRef),
    estimatedMinutes: patch.set.estimatedMinutes ?? existing?.estimatedMinutes,
    defaultAltitude: patch.set.defaultAltitude ?? existing?.defaultAltitude,
    // Scheduling is a learner preference, not agent-authored lesson metadata.
    spacedRepetition: existing?.spacedRepetition,
    createdVia: existing?.createdVia ?? 'agent_import',
    createdAt: existing?.createdAt ?? iso,
    updatedAt: iso,
  };
  await assertWriteOwnership(opts);
  await saveSet(root, set);
  for (const card of cards) {
    await assertWriteOwnership(opts);
    await saveCard(root, card);
  }

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
  await assertWriteOwnership(opts);
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
  await assertWriteOwnership(opts);
  await writeJson(importsPath, [...priorImports, record]);

  return { ok: true, errors: [], setId, cards: results, tagIdsAdded: addedTagIds };
}
