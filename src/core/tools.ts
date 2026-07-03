import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, isAbsolute, relative } from 'node:path';
import { promisify } from 'node:util';

import { collectCommits } from './git.js';
import { normalizeRepoPath } from './util.js';

const execFileAsync = promisify(execFile);

/** A single ripgrep hit: file path (repo-relative), 1-based line, and the matched line text. */
export interface GrepHit {
  path: string;
  line: number;
  text: string;
}

export interface GrepOptions {
  /** Max hits to return (default 40). Keeps the context bundle token-bounded. */
  maxHits?: number;
  /** Restrict to a glob (e.g. '*.ts'). Optional. */
  glob?: string;
}

/** An exact, 1-based-inclusive slice of a file, with the resolved text. */
export interface RangeResult {
  path: string;
  startLine: number;
  endLine: number;
  text: string;
}

function assertInsideRepo(repoPath: string, target: string): string {
  const abs = isAbsolute(target) ? target : join(repoPath, target);
  const rel = relative(repoPath, abs);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`path escapes repo: ${target}`);
  }
  return abs;
}

/**
 * grepRepo - ripgrep over the repo. Returns path:line:match hits for finding
 * usages/neighbors of a symbol. Read-only; the LLM decides what is teachable.
 */
export async function grepRepo(
  repoPath: string,
  pattern: string,
  opts: GrepOptions = {},
): Promise<GrepHit[]> {
  const repo = normalizeRepoPath(repoPath);
  const maxHits = opts.maxHits ?? 40;
  const args = ['--line-number', '--no-heading', '--color', 'never', '--max-count', String(maxHits)];
  if (opts.glob) args.push('--glob', opts.glob);
  // Pass an explicit search path ('.') so rg scans the repo dir; without a path
  // arg rg reads from stdin, which never closes under execFile and hangs.
  args.push('--', pattern, '.');
  let stdout = '';
  try {
    ({ stdout } = await execFileAsync('rg', args, { cwd: repo, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }));
  } catch (err) {
    // rg exits 1 when there are no matches - that is not an error for us.
    const e = err as { code?: number; stdout?: string };
    if (e.code === 1) return [];
    if (typeof e.stdout === 'string') stdout = e.stdout;
    else throw err;
  }
  const hits: GrepHit[] = [];
  for (const line of stdout.split('\n')) {
    if (!line) continue;
    const m = /^(.*?):(\d+):(.*)$/.exec(line);
    if (!m) continue;
    hits.push({ path: m[1], line: Number(m[2]), text: m[3] });
    if (hits.length >= maxHits) break;
  }
  return hits;
}

/**
 * readRange - exact, 1-based-inclusive line slice of a file. This is the ONLY
 * source of snippet text the author trusts; the model cites a range, this fetches
 * the real bytes. Clamps to file bounds; throws if the path escapes the repo.
 */
export async function readRange(
  repoPath: string,
  path: string,
  startLine: number,
  endLine: number,
): Promise<RangeResult> {
  const repo = normalizeRepoPath(repoPath);
  const abs = assertInsideRepo(repo, path);
  const raw = await readFile(abs, 'utf8');
  const lines = raw.split('\n');
  // A trailing newline yields a spurious final '' element; it is not a real line.
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  const start = Math.max(1, Math.floor(startLine));
  const end = Math.min(lines.length, Math.max(start, Math.floor(endLine)));
  const text = lines.slice(start - 1, end).join('\n');
  return { path, startLine: start, endLine: end, text };
}

/**
 * gitContext - the commits that touched a path, most recent first, with diffs.
 * Wraps the existing collectCommits; bug-fix commits are the highest-signal
 * teachable moments, so the author is handed the raw evidence to judge.
 */
export async function gitContext(
  repoPath: string,
  path: string,
  opts: { since?: string; limit?: number } = {},
): Promise<import('./types.js').CommitArtifact[]> {
  const repo = normalizeRepoPath(repoPath);
  const commits = await collectCommits(repo, opts.since ?? '365d', opts.limit ?? 200);
  const touched = commits.filter((c) => c.changedFiles.includes(path));
  return touched.slice(0, opts.limit ?? 10);
}
