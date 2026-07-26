import { rm } from 'node:fs/promises';

import type { Altitude, Card, CardBack, CardFront, Difficulty } from './types.js';
import { listCardIds, loadCard, saveCard } from './cardStore.js';
import { loadOrder, loadSet, saveOrder } from './setStore.js';
import { listSessions } from './review/sessionHistory.js';
import { libraryPaths } from './libraryStore.js';

export class CardLifecycleError extends Error {
  constructor(message: string) { super(message); this.name = 'CardLifecycleError'; }
}

async function requireCard(root: string, setId: string, cardId: string): Promise<Card> {
  const card = await loadCard(root, setId, cardId);
  if (!card) throw new CardLifecycleError(`card not found: ${setId}/${cardId}`);
  return card;
}

export async function archiveCard(root: string, setId: string, cardId: string, now = new Date()): Promise<Card> {
  const card = await requireCard(root, setId, cardId);
  const updated: Card = { ...card, status: 'archived', archivedAt: now.toISOString(), updatedAt: now.toISOString() };
  await saveCard(root, updated);
  return updated;
}

export async function unarchiveCard(root: string, setId: string, cardId: string, now = new Date()): Promise<Card> {
  const card = await requireCard(root, setId, cardId);
  const { archivedAt: _archivedAt, ...withoutArchived } = card;
  const updated: Card = { ...withoutArchived, status: 'active', updatedAt: now.toISOString() };
  await saveCard(root, updated);
  return updated;
}

export type CardEdit = {
  front?: Partial<CardFront>;
  back?: Partial<CardBack>;
  tagIds?: string[];
  difficulty?: Difficulty;
  altitude?: Altitude;
};

const EDIT_KEYS = new Set(['front', 'back', 'tagIds', 'difficulty', 'altitude']);
const FRONT_KEYS = new Set(['prompt', 'contextMarkdown']);
const BACK_KEYS = new Set(['shortAnswer', 'explanationMarkdown', 'examples', 'commonMistakes', 'sourceNotes']);

export async function editCard(
  root: string, setId: string, cardId: string, edit: CardEdit, now = new Date(),
): Promise<Card> {
  for (const key of Object.keys(edit)) if (!EDIT_KEYS.has(key)) throw new CardLifecycleError(`cannot edit ${key}`);
  for (const key of Object.keys(edit.front ?? {})) if (!FRONT_KEYS.has(key)) throw new CardLifecycleError(`cannot edit front.${key}`);
  for (const key of Object.keys(edit.back ?? {})) if (!BACK_KEYS.has(key)) throw new CardLifecycleError(`cannot edit back.${key}`);
  const card = await requireCard(root, setId, cardId);
  const updated: Card = {
    ...card,
    ...(edit.tagIds ? { tagIds: [...edit.tagIds] } : {}),
    ...(edit.difficulty ? { difficulty: edit.difficulty } : {}),
    ...(edit.altitude ? { altitude: edit.altitude } : {}),
    front: { ...card.front, ...edit.front },
    back: { ...card.back, ...edit.back },
    updatedAt: now.toISOString(),
  };
  if (!updated.front.prompt?.trim() || !updated.back.shortAnswer?.trim() || !updated.back.explanationMarkdown?.trim()) {
    throw new CardLifecycleError('prompt, short answer, and explanation cannot be empty');
  }
  await saveCard(root, updated);
  return updated;
}

export type DeleteResult = { deleted: boolean; setId: string; cardId: string };

export async function deleteCard(root: string, setId: string, cardId: string): Promise<DeleteResult> {
  await requireCard(root, setId, cardId);
  await rm(libraryPaths(root).cardFile(setId, cardId), { force: true });
  const order = await loadOrder(root, setId);
  if (order?.cardIds.includes(cardId)) {
    await saveOrder(root, setId, { ...order, cardIds: order.cardIds.filter((id) => id !== cardId) });
  }
  return { deleted: true, setId, cardId };
}

export async function deleteSet(
  root: string, setId: string, opts: { force?: boolean } = {},
): Promise<{ deleted: boolean; setId: string }> {
  if (!await loadSet(root, setId)) throw new CardLifecycleError(`set not found: ${setId}`);
  const cardIds = new Set(await listCardIds(root, setId));
  const hasHistory = (await listSessions(root)).some((session) =>
    session.filter?.setIds?.includes(setId)
    || session.events.some((event) => event.setId === setId || cardIds.has(event.cardId)));
  if (hasHistory && !opts.force) throw new CardLifecycleError('set has review history; pass force to delete it');
  await rm(libraryPaths(root).setDir(setId), { recursive: true, force: true });
  return { deleted: true, setId };
}
