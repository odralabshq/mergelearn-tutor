/**
 * `setId/cardId` — one canonical way to name a card.
 *
 * A card belongs to exactly one set (types.ts pins `setId: string`, and storage
 * puts the card at sets/<setId>/cards/<cardId>.json), so a set-qualified pair
 * is both unambiguous and a direct path lookup. This is already the form the
 * Manage tab prints and the "Copy reference" button copies, so the CLI should
 * accept the same string the learner has on their clipboard.
 *
 * Storage ids are ASCII letters/digits/underscore/hyphen (storageId.ts), so `/`
 * can never occur inside an id and a single slash is an unambiguous separator.
 *
 * The older `--set X --card Y` spelling still resolves, so an agent skill or
 * script written against the previous surface keeps working.
 */

import { storageIdError } from './storageId.js';

export class CardRefError extends Error {}

export type CardRef = { setId: string; cardId: string };
/** A card, or a whole set when `cardId` is absent (what `delete` accepts). */
export type TargetRef = { setId: string; cardId?: string };

export function formatCardRef(setId: string, cardId: string): string {
  return `${setId}/${cardId}`;
}

function validate(kind: 'set' | 'card', value: string): string {
  const error = storageIdError(value);
  if (error) throw new CardRefError(`${kind} id ${error}`);
  return value;
}

/** Parse `setId` or `setId/cardId`. Rejects empty segments and extra slashes. */
export function parseTargetRef(value: string): TargetRef {
  const parts = value.split('/');
  if (parts.length > 2) {
    throw new CardRefError(`"${value}" is not a valid reference; expected setId or setId/cardId`);
  }
  const [setId, cardId] = parts;
  validate('set', setId ?? '');
  if (parts.length === 1) return { setId: setId! };
  validate('card', cardId ?? '');
  return { setId: setId!, cardId: cardId! };
}

/** Parse a reference that must name a card. */
export function parseCardRef(value: string): CardRef {
  const target = parseTargetRef(value);
  if (!target.cardId) {
    throw new CardRefError(`"${value}" names a set; this command needs a card, as setId/cardId`);
  }
  return { setId: target.setId, cardId: target.cardId };
}

export type RefFlags = { set?: string; card?: string };

/**
 * Resolve a card from either spelling. The positional wins when both are given
 * rather than silently merging two disagreeing sources.
 */
export function resolveCardRef(positional: string | undefined, flags: RefFlags = {}): CardRef {
  if (positional) return parseCardRef(positional);
  if (flags.set && flags.card) {
    return { setId: validate('set', flags.set), cardId: validate('card', flags.card) };
  }
  throw new CardRefError('missing card reference; pass setId/cardId (or --set <id> --card <id>)');
}

/** Same, for commands that also accept a whole set (`delete`). */
export function resolveTargetRef(positional: string | undefined, flags: RefFlags = {}): TargetRef {
  if (positional) return parseTargetRef(positional);
  if (flags.set) {
    const setId = validate('set', flags.set);
    return flags.card ? { setId, cardId: validate('card', flags.card) } : { setId };
  }
  throw new CardRefError('missing reference; pass setId or setId/cardId (or --set <id> [--card <id>])');
}
