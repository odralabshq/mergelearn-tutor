/**
 * Card store: one JSON file per card under sets/<setId>/cards/<cardId>.json
 * (docs/design/redesign-2026-07/02 sec 2). Card-per-file so the agent can edit
 * one card without rewriting the set, corruption is isolated, and moving a card
 * is a metadata change rather than a monolith rewrite.
 */

import type { Card } from './types.js';
import { readJson, writeJson, listDir } from './io.js';
import { libraryPaths } from './libraryStore.js';

/** cardId for each card file in a set (filenames minus the .json suffix). */
export async function listCardIds(root: string, setId: string): Promise<string[]> {
  const entries = await listDir(libraryPaths(root).cardsDir(setId));
  return entries.filter((e) => e.endsWith('.json')).map((e) => e.slice(0, -'.json'.length));
}

export async function loadCard(root: string, setId: string, cardId: string): Promise<Card | undefined> {
  return readJson<Card>(libraryPaths(root).cardFile(setId, cardId));
}

export async function saveCard(root: string, card: Card): Promise<void> {
  await writeJson(libraryPaths(root).cardFile(card.setId, card.id), card);
}

/** All cards in a set. Reads each file; fine at this scale (see doc 02). */
export async function loadCardsForSet(root: string, setId: string): Promise<Card[]> {
  const ids = await listCardIds(root, setId);
  const cards = await Promise.all(ids.map((id) => loadCard(root, setId, id)));
  return cards.filter((c): c is Card => c !== undefined);
}

export async function countCards(root: string, setId: string): Promise<number> {
  return (await listCardIds(root, setId)).length;
}
