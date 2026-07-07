/**
 * Low-level JSON IO for the v2 library (self-contained; no legacy store dep).
 *
 * Atomic writes: temp file in the same dir, then rename over the target.
 * rename(2) is atomic on POSIX, so a reader never sees a partial file and a
 * crash leaves the previous file intact. This is the same guarantee the legacy
 * safeStore gives, reimplemented here so the library subsystem stands alone.
 */

import { mkdir, writeFile, rename, readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

/** Atomically write a value as pretty JSON. Creates parent dirs. */
export async function writeJson(targetPath: string, value: unknown): Promise<void> {
  const dir = dirname(targetPath);
  await mkdir(dir, { recursive: true });
  const tmp = join(dir, `.tmp-${process.pid}-${Math.random().toString(36).slice(2)}.json`);
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(tmp, targetPath);
}

/** Read + parse JSON. Returns undefined when the file does not exist. */
export async function readJson<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

/** List directory entries; [] when the directory is absent. */
export async function listDir(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}
