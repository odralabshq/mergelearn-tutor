/**
 * Global library root + path layout (docs/design/redesign-2026-07/02).
 *
 *   ~/.mergelearn/
 *     config.json
 *     repos/registry.json
 *     library/tags.json
 *     library/folders.json
 *     library/sets/<setId>/{set.json,order.json,cards/<cardId>.json,assets/}
 *     profile/user.json
 *     profile/stats.json
 *     profile/sessions/<date>/session_<ts>.json
 *
 * Root resolution order: explicit arg > MERGELEARN_HOME env > ~/.mergelearn.
 * The injectable root keeps every store testable against a temp dir.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';

export function resolveLibraryRoot(explicit?: string): string {
  if (explicit) return explicit;
  const env = process.env.MERGELEARN_HOME;
  if (env && env.trim()) return env;
  return join(homedir(), '.mergelearn');
}

export type LibraryPaths = ReturnType<typeof libraryPaths>;

export function libraryPaths(root: string) {
  const library = join(root, 'library');
  const sets = join(library, 'sets');
  const profile = join(root, 'profile');
  return {
    root,
    config: join(root, 'config.json'),
    reposRegistry: join(root, 'repos', 'registry.json'),
    library,
    tags: join(library, 'tags.json'),
    folders: join(library, 'folders.json'),
    sets,
    setDir: (setId: string) => join(sets, setId),
    setFile: (setId: string) => join(sets, setId, 'set.json'),
    orderFile: (setId: string) => join(sets, setId, 'order.json'),
    cardsDir: (setId: string) => join(sets, setId, 'cards'),
    cardFile: (setId: string, cardId: string) => join(sets, setId, 'cards', `${cardId}.json`),
    assetsDir: (setId: string) => join(sets, setId, 'assets'),
    profile,
    userFile: join(profile, 'user.json'),
    statsFile: join(profile, 'stats.json'),
    sessionsDir: join(profile, 'sessions'),
    sessionDayDir: (day: string) => join(profile, 'sessions', day),
  };
}
