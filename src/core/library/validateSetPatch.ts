/**
 * Deterministic structure validation for an AgentSetPatch
 * (docs/design/redesign-2026-07/03 sec 5). Model-free. Tag-graph invariants
 * (cycles/dangling/dupes) are enforced separately by tagStore.applyTagPatch;
 * this module checks card structure and cross-references.
 *
 * Content gate (doc 01 sec 3): prompt / shortAnswer / explanationMarkdown must
 * be non-empty, and the prompt must not contain the shortAnswer verbatim
 * (anti-trivia). Plus: unique card localIds, resolvable tagRefs, and an order
 * that covers exactly the patch's cards.
 */

import type { AgentSetPatch } from './types.js';

export type PatchValidationError = { code: string; message: string; cardLocalId?: string };

const nonEmpty = (s: unknown): boolean => typeof s === 'string' && s.trim().length > 0;

/** Anti-trivia: the prompt must not embed the answer verbatim. */
export function leaksAnswer(prompt: string, shortAnswer: string): boolean {
  const a = shortAnswer.trim().toLowerCase();
  if (a.length < 4) return false; // too short to be a meaningful leak
  return prompt.trim().toLowerCase().includes(a);
}

export function validateSetPatchStructure(
  patch: AgentSetPatch,
  existingTagIds: Set<string>,
  proposedLocalIds: Set<string>,
): { ok: boolean; errors: PatchValidationError[] } {
  const errors: PatchValidationError[] = [];
  if (patch.version !== 1) errors.push({ code: 'bad_version', message: `unsupported patch version: ${patch.version}` });
  if (!nonEmpty(patch.set?.title)) errors.push({ code: 'set_title_empty', message: 'set.title is required' });
  if (!Array.isArray(patch.cards) || patch.cards.length === 0) {
    errors.push({ code: 'no_cards', message: 'patch has no cards' });
    return { ok: false, errors };
  }
  // Combine top-level + card-level errors, THEN derive ok. (Deriving ok from
  // the top-level array alone would ignore every card error — the bug the
  // reject-case tests caught.)
  const all = [...errors, ...validateCards(patch, existingTagIds, proposedLocalIds)];
  return { ok: all.length === 0, errors: all };
}

function validateCards(
  patch: AgentSetPatch,
  existingTagIds: Set<string>,
  proposedLocalIds: Set<string>,
): PatchValidationError[] {
  const errors: PatchValidationError[] = [];
  const seen = new Set<string>();
  const cardKeys = new Set<string>();

  for (const c of patch.cards) {
    if (!nonEmpty(c.localId)) {
      errors.push({ code: 'card_localId_empty', message: 'card.localId is required' });
      continue;
    }
    if (seen.has(c.localId)) {
      errors.push({ code: 'dup_card_localId', message: `duplicate card localId: ${c.localId}`, cardLocalId: c.localId });
    }
    seen.add(c.localId);
    cardKeys.add(c.localId);
    if (c.id) cardKeys.add(c.id);

    if (!nonEmpty(c.front?.prompt)) errors.push({ code: 'prompt_empty', message: 'front.prompt is empty', cardLocalId: c.localId });
    if (!nonEmpty(c.back?.shortAnswer)) errors.push({ code: 'short_answer_empty', message: 'back.shortAnswer is empty', cardLocalId: c.localId });
    if (!nonEmpty(c.back?.explanationMarkdown)) errors.push({ code: 'explanation_empty', message: 'back.explanationMarkdown is empty', cardLocalId: c.localId });
    if (nonEmpty(c.front?.prompt) && nonEmpty(c.back?.shortAnswer) && leaksAnswer(c.front.prompt, c.back.shortAnswer)) {
      errors.push({ code: 'answer_leak', message: 'prompt contains the shortAnswer verbatim', cardLocalId: c.localId });
    }
    for (const ref of c.tagRefs ?? []) {
      if (!existingTagIds.has(ref) && !proposedLocalIds.has(ref)) {
        errors.push({ code: 'tagref_unresolved', message: `card tagRef does not resolve: ${ref}`, cardLocalId: c.localId });
      }
    }
  }

  // order must cover exactly the patch's cards (no missing, no extras, no dupes).
  const orderSeen = new Set<string>();
  for (const key of patch.order ?? []) {
    if (!cardKeys.has(key)) errors.push({ code: 'order_unknown', message: `order references unknown card: ${key}` });
    if (orderSeen.has(key)) errors.push({ code: 'order_dup', message: `order lists a card twice: ${key}` });
    orderSeen.add(key);
  }
  for (const c of patch.cards) {
    if (!orderSeen.has(c.localId) && !(c.id && orderSeen.has(c.id))) {
      errors.push({ code: 'order_missing', message: `card not in order: ${c.localId}`, cardLocalId: c.localId });
    }
  }
  return errors;
}
