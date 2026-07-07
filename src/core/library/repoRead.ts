/**
 * Minimal repo-read primitives for the freeze trust boundary. Inlined from the
 * legacy tools.ts/git.ts so the library subsystem has no dependency on legacy
 * core (Phase B cutover). Read-only: an exact line slice and the HEAD SHA.
 */

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, isAbsolute, relative } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type RangeResult = { path: string; startLine: number; endLine: number; text: string };

function normalizeRepoPath(repoPath: string): string {
  return repoPath.replace(/\\/g, '/').replace(/\/$/, '');
}

function assertInsideRepo(repoPath: string, target: string): string {
  const abs = isAbsolute(target) ? target : join(repoPath, target);
  const rel = relative(repoPath, abs);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error(`path escapes repo: ${target}`);
  return abs;
}

/** Exact, 1-based-inclusive line slice. Clamps to bounds; throws on escape. */
export async function readRange(repoPath: string, path: string, startLine: number, endLine: number): Promise<RangeResult> {
  const repo = normalizeRepoPath(repoPath);
  const abs = assertInsideRepo(repo, path);
  const raw = await readFile(abs, 'utf8');
  const lines = raw.split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  const start = Math.max(1, Math.floor(startLine));
  const end = Math.min(lines.length, Math.max(start, Math.floor(endLine)));
  return { path, startLine: start, endLine: end, text: lines.slice(start - 1, end).join('\n') };
}

/** Current HEAD SHA of a git repo. */
export async function getLastCommitSha(repoPath: string): Promise<string> {
  const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
    cwd: normalizeRepoPath(repoPath), encoding: 'utf8', maxBuffer: 1024 * 1024,
  });
  return stdout.trimEnd();
}
