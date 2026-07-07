/**
 * Set store: folder-per-set (docs/design/redesign-2026-07/02 sec 2).
 * A set is the directory sets/<setId>/ holding set.json + order.json + cards/.
 */

import type { CardSet, SetOrder, SetSummary } from './types.js';
import { readJson, writeJson, listDir } from './io.js';
import { libraryPaths } from './libraryStore.js';
import { countCards } from './cardStore.js';

/** setIds are the directory names under library/sets/. */
export async function listSetIds(root: string): Promise<string[]> {
  const entries = await listDir(libraryPaths(root).sets);
  // Directories only; ignore stray files and temp artifacts.
  return entries.filter((e) => !e.startsWith('.'));
}

export async function loadSet(root: string, setId: string): Promise<CardSet | undefined> {
  return readJson<CardSet>(libraryPaths(root).setFile(setId));
}

export async function saveSet(root: string, set: CardSet): Promise<void> {
  await writeJson(libraryPaths(root).setFile(set.id), set);
}

export async function loadOrder(root: string, setId: string): Promise<SetOrder | undefined> {
  return readJson<SetOrder>(libraryPaths(root).orderFile(setId));
}

export async function saveOrder(root: string, setId: string, order: SetOrder): Promise<void> {
  await writeJson(libraryPaths(root).orderFile(setId), order);
}

/** Lightweight summaries for the AuthoringContext handed to the agent. */
export async function listSetSummaries(root: string): Promise<SetSummary[]> {
  const ids = await listSetIds(root);
  const out: SetSummary[] = [];
  for (const id of ids) {
    const set = await loadSet(root, id);
    if (!set) continue;
    out.push({ id: set.id, title: set.title, folderPath: set.folderPath, cardCount: await countCards(root, id) });
  }
  return out;
}

/** Distinct folder paths across all sets (for the AuthoringContext folder tree). */
export async function listFolderPaths(root: string): Promise<string[]> {
  const summaries = await listSetSummaries(root);
  return [...new Set(summaries.map((s) => s.folderPath).filter((p): p is string => !!p))].sort();
}
