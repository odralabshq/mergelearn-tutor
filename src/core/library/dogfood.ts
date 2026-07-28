import { appendFile, mkdir, readFile } from 'node:fs/promises';

import { libraryPaths } from './libraryStore.js';

export type DogfoodEvent =
  | { ts: string; kind: 'opened'; setId: string; source?: string }
  | { ts: string; kind: 'feedback'; setId: string; worthAnswering: boolean; note?: string }
  | { ts: string; kind: 'deferred'; setId: string }
  | { ts: string; kind: 'skipped'; task: string; reason: string };

export type NewDogfoodEvent =
  | { kind: 'opened'; setId: string; source?: string }
  | { kind: 'feedback'; setId: string; worthAnswering: boolean; note?: string }
  | { kind: 'deferred'; setId: string }
  | { kind: 'skipped'; task: string; reason: string };

function requiredText(value: string, field: string): string {
  const text = value.trim();
  if (!text) throw new Error(`${field} must not be empty`);
  return text;
}

function normalizeEvent(event: NewDogfoodEvent): NewDogfoodEvent {
  if (event.kind === 'opened') return { ...event, setId: requiredText(event.setId, 'setId') };
  if (event.kind === 'deferred') return { ...event, setId: requiredText(event.setId, 'setId') };
  if (event.kind === 'feedback') {
    return { ...event, setId: requiredText(event.setId, 'setId'), ...(event.note?.trim() ? { note: event.note.trim().slice(0, 1000) } : {}) };
  }
  return { ...event, task: requiredText(event.task, 'task'), reason: requiredText(event.reason, 'reason') };
}

export async function appendDogfoodEvent(root: string, event: NewDogfoodEvent): Promise<DogfoodEvent> {
  const record = { ...normalizeEvent(event), ts: new Date().toISOString() } as DogfoodEvent;
  const path = libraryPaths(root).dogfoodFile;
  await mkdir(root, { recursive: true });
  await appendFile(path, `${JSON.stringify(record)}\n`, 'utf8');
  return record;
}

export async function listDogfoodEvents(root: string): Promise<DogfoodEvent[]> {
  try {
    const lines = (await readFile(libraryPaths(root).dogfoodFile, 'utf8')).trim().split('\n');
    return lines.filter(Boolean).flatMap((line) => {
      try { return [JSON.parse(line) as DogfoodEvent]; } catch { return []; }
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

export async function dogfoodEventCounts(root: string): Promise<Record<DogfoodEvent['kind'], number>> {
  const counts = { opened: 0, feedback: 0, deferred: 0, skipped: 0 };
  for (const event of await listDogfoodEvents(root)) counts[event.kind] += 1;
  return counts;
}
