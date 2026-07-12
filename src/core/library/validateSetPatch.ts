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

import type { AgentSetPatch, Interaction, LessonKind } from './types.js';

export type PatchValidationError = { code: string; message: string; cardLocalId?: string };

const nonEmpty = (s: unknown): boolean => typeof s === 'string' && s.trim().length > 0;

const LESSON_KINDS: ReadonlySet<LessonKind> = new Set(['general', 'repository', 'bridge']);
const INTERACTION_TYPES: ReadonlySet<Interaction['type']> = new Set(['flashcard', 'self_response', 'choice']);

/**
 * HARD-reject only interaction shapes that make a card structurally
 * unsatisfiable (a choice with no correct answer, unresolved correct id, an
 * option missing feedback). Lesson size and self_response/choice mixing are
 * advisory authoring guidance, NOT gated here — consistent with the project's
 * settled soft-guidance stance on card content depth.
 */
function validateInteraction(localId: string, interaction: Interaction): PatchValidationError[] {
  const errors: PatchValidationError[] = [];
  if (!INTERACTION_TYPES.has(interaction.type)) {
    errors.push({ code: 'interaction:bad_type', message: `unknown interaction type: ${String((interaction as { type: unknown }).type)}`, cardLocalId: localId });
    return errors; // can't reason about an unknown shape
  }
  if (interaction.type !== 'choice') return errors; // flashcard/self_response have no extra structure
  const options = interaction.options ?? [];
  if (options.length < 2) {
    errors.push({ code: 'interaction:no_options', message: 'choice needs at least 2 options', cardLocalId: localId });
  }
  const ids = new Set<string>();
  for (const o of options) {
    if (ids.has(o.id)) errors.push({ code: 'interaction:dup_option_id', message: `duplicate option id: ${o.id}`, cardLocalId: localId });
    ids.add(o.id);
    if (!nonEmpty(o.feedback)) errors.push({ code: 'interaction:no_feedback', message: `option ${o.id} has empty feedback`, cardLocalId: localId });
  }
  const correct = interaction.correctOptionIds ?? [];
  if (correct.length === 0) {
    errors.push({ code: 'interaction:no_correct', message: 'choice has no correctOptionIds', cardLocalId: localId });
  }
  for (const cid of correct) {
    if (!ids.has(cid)) errors.push({ code: 'interaction:bad_correct', message: `correctOptionId matches no option: ${cid}`, cardLocalId: localId });
  }
  return errors;
}

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
  if (patch.set?.lessonKind !== undefined && !LESSON_KINDS.has(patch.set.lessonKind)) {
    errors.push({ code: 'set:bad_lesson_kind', message: `set.lessonKind must be general|repository|bridge, got: ${String(patch.set.lessonKind)}` });
  }
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
    if (c.interaction !== undefined) {
      errors.push(...validateInteraction(c.localId, c.interaction));
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
