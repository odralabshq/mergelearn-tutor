import type { AgentSetPatch } from './core/library/types.js';
import { importAgentSet, type ImportCardResult, type ImportResult } from './core/library/importAgentSet.js';
import { summarizeLesson, type LessonSummary } from './core/library/lessonSummary.js';
import { ensureServer, type EnsuredServer } from './session/managedServer.js';

export type CreateAndOpenResult = {
  ok: boolean;
  imported: boolean;
  setId?: string;
  url: string | null;
  openRequested: boolean;
  reused: boolean;
  cards: ImportCardResult[];
  errors: ImportResult['errors'];
  summary?: LessonSummary;
};

export type CreateAndOpenOptions = {
  agentName?: string;
  dryRun?: boolean;
  noOpen?: boolean;
  ensure?: (root: string) => Promise<EnsuredServer>;
  openUrl?: (url: string) => boolean;
};

export async function createAndOpen(
  root: string,
  patch: AgentSetPatch,
  options: CreateAndOpenOptions = {},
): Promise<CreateAndOpenResult> {
  const imported = await importAgentSet(root, patch, {
    agentName: options.agentName,
    dryRun: options.dryRun,
  });
  if (!imported.ok) {
    return { ok: false, imported: false, url: null, openRequested: false, reused: false,
      cards: imported.cards, errors: imported.errors };
  }
  const summary = summarizeLesson(patch, imported.cards);
  if (options.dryRun) {
    return { ok: true, imported: false, setId: imported.setId, url: null, openRequested: false,
      reused: false, cards: imported.cards, errors: [], summary };
  }

  try {
    const server = await (options.ensure ?? ensureServer)(root);
    const url = `${server.url}/set/${encodeURIComponent(imported.setId!)}?source=create-and-open`;
    const openRequested = options.noOpen ? false : (options.openUrl?.(url) ?? false);
    return { ok: true, imported: true, setId: imported.setId, url, openRequested,
      reused: server.reused, cards: imported.cards, errors: [], summary };
  } catch (error) {
    return { ok: false, imported: true, setId: imported.setId, url: null, openRequested: false,
      reused: false, cards: imported.cards, errors: [{ code: 'server:start', message: error instanceof Error ? error.message : String(error) }], summary };
  }
}
