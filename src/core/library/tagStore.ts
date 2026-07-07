/**
 * Tag taxonomy store (docs/design/redesign-2026-07/01 sec 4, 03 sec 2).
 *
 * The taxonomy IS the learning graph: tags carry parentIds/relatedIds. This
 * module loads/saves `library/tags.json` and validates + applies a tagPatch
 * from an AgentSetPatch. The tutor never invents tags; it only stores what the
 * agent proposes and guards structural invariants (no cycles, no dangling
 * parents, no duplicate labels/aliases).
 */

import type { CardTag, ProposedTag } from './types.js';
import { readJson, writeJson } from './io.js';
import { libraryPaths } from './libraryStore.js';
import { nowIso } from '../util.js';

type TagsFile = { version: 1; tags: CardTag[] };

export async function loadTags(root: string): Promise<CardTag[]> {
  const file = await readJson<TagsFile>(libraryPaths(root).tags);
  return file?.tags ?? [];
}

export async function saveTags(root: string, tags: CardTag[]): Promise<void> {
  await writeJson(libraryPaths(root).tags, { version: 1, tags } satisfies TagsFile);
}

/** Deterministic slug id for a new tag, derived from its label. */
export function tagIdFromLabel(label: string): string {
  // Linear split/filter/join (no anchored-quantifier regex — avoids ReDoS,
  // CodeQL js/polynomial-redos). Splitting on non-alnum runs and dropping the
  // empties yields the same slug as collapse-then-trim, without backtracking.
  const slug = label.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).join('-');
  return `tag_${slug || 'unnamed'}`;
}

/** Normalize a label for duplicate detection (case/space-insensitive). */
export function normalizeLabel(label: string): string {
  return label.toLowerCase().trim().replace(/\s+/g, ' ');
}

export type TagValidationError = { code: string; message: string };

/**
 * Detect a cycle in a parent-hierarchy adjacency map (id -> parent ids).
 * relatedIds are NOT part of this — only parentIds must stay acyclic.
 * Returns the id at which a back-edge was found, or undefined if acyclic.
 */
export function findParentCycle(parentsOf: Map<string, string[]>): string | undefined {
  const WHITE = 0, GREY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const visit = (id: string): string | undefined => {
    color.set(id, GREY);
    for (const p of parentsOf.get(id) ?? []) {
      const c = color.get(p) ?? WHITE;
      if (c === GREY) return p; // back-edge -> cycle
      if (c === WHITE) {
        const hit = visit(p);
        if (hit) return hit;
      }
    }
    color.set(id, BLACK);
    return undefined;
  };
  for (const id of parentsOf.keys()) {
    if ((color.get(id) ?? WHITE) === WHITE) {
      const hit = visit(id);
      if (hit) return hit;
    }
  }
  return undefined;
}

export type TagPatchResult = {
  ok: boolean;
  errors: TagValidationError[];
  mergedTags: CardTag[]; // existing + added (valid only when ok)
  localIdToTagId: Map<string, string>; // ProposedTag.localId -> real tag id
  addedTagIds: string[];
};

/**
 * Validate + apply a tagPatch against the existing taxonomy. Pure: returns the
 * merged tags without touching disk. Rejects: reuse of an unknown id, duplicate
 * label/alias, dangling parent/related ref, and any resulting parent cycle.
 */
export function applyTagPatch(
  existing: CardTag[],
  patch: { reuse: string[]; add: ProposedTag[] },
): TagPatchResult {
  const errors: TagValidationError[] = [];
  const byId = new Map(existing.map((t) => [t.id, t]));
  const labelIndex = new Map<string, string>(); // normLabel/alias -> owning id
  for (const t of existing) {
    labelIndex.set(normalizeLabel(t.label), t.id);
    for (const a of t.aliases ?? []) labelIndex.set(normalizeLabel(a), t.id);
  }

  for (const id of patch.reuse) {
    if (!byId.has(id)) errors.push({ code: 'reuse_unknown', message: `reuse tag not found: ${id}` });
  }

  // Assign ids to proposed tags; detect label collisions (existing + in-patch).
  const localIdToTagId = new Map<string, string>();
  for (const p of patch.add) {
    const newId = tagIdFromLabel(p.label);
    const norm = normalizeLabel(p.label);
    if (labelIndex.has(norm)) {
      errors.push({ code: 'dup_label', message: `tag label already exists: "${p.label}" (use reuse)` });
    }
    labelIndex.set(norm, newId);
    if (localIdToTagId.has(p.localId)) {
      errors.push({ code: 'dup_localId', message: `duplicate localId in patch: ${p.localId}` });
    }
    localIdToTagId.set(p.localId, newId);
  }

  // Resolve a parent/related ref: an existing tag id OR an in-patch localId.
  const resolveRef = (ref: string): string | undefined =>
    byId.has(ref) ? ref : localIdToTagId.get(ref);

  const addedTags: CardTag[] = [];
  const addedTagIds: string[] = [];
  for (const p of patch.add) {
    const id = localIdToTagId.get(p.localId)!;
    const parentIds: string[] = [];
    for (const ref of p.parentIds ?? []) {
      const r = resolveRef(ref);
      if (!r) errors.push({ code: 'dangling_parent', message: `unknown parent ref "${ref}" on tag "${p.label}"` });
      else parentIds.push(r);
    }
    const relatedIds: string[] = [];
    for (const ref of p.relatedIds ?? []) {
      const r = resolveRef(ref);
      if (!r) errors.push({ code: 'dangling_related', message: `unknown related ref "${ref}" on tag "${p.label}"` });
      else relatedIds.push(r);
    }
    addedTags.push({
      id, label: p.label, kind: p.kind, description: p.description,
      aliases: p.aliases, parentIds, relatedIds, createdBy: 'agent',
    });
    addedTagIds.push(id);
  }

  const mergedTags = [...existing, ...addedTags];
  const parentsOf = new Map(mergedTags.map((t) => [t.id, t.parentIds ?? []]));
  const cycleAt = findParentCycle(parentsOf);
  if (cycleAt) errors.push({ code: 'cycle', message: `parent cycle involving tag ${cycleAt}` });

  return { ok: errors.length === 0, errors, mergedTags, localIdToTagId, addedTagIds };
}
