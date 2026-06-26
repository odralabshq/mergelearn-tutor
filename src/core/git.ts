import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { CommitArtifact } from './types.js';
import { stableId } from './util.js';

const execFileAsync = promisify(execFile);

async function git(repoPath: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd: repoPath, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  return stdout.trimEnd();
}

export async function assertGitRepo(repoPath: string): Promise<void> {
  await git(repoPath, ['rev-parse', '--show-toplevel']);
}

export async function getLastCommitSha(repoPath: string): Promise<string> {
  return git(repoPath, ['rev-parse', 'HEAD']);
}

function sinceToGitArg(since: string): string {
  if (/^[0-9]+d$/.test(since)) return `${since.slice(0, -1)} days ago`;
  return since;
}

export async function collectCommits(repoPath: string, since = '30d', limit = 80): Promise<CommitArtifact[]> {
  await assertGitRepo(repoPath);
  const log = await git(repoPath, ['log', `--since=${sinceToGitArg(since)}`, `--max-count=${limit}`, '--pretty=format:%H%x1f%ad%x1f%s', '--date=iso-strict']);
  if (!log.trim()) return [];
  const commits: CommitArtifact[] = [];
  for (const line of log.split('\n')) {
    const [sha, date, subject] = line.split('\x1f');
    if (!sha) continue;
    const changedFilesRaw = await git(repoPath, ['diff-tree', '--root', '--no-commit-id', '--name-only', '-r', sha]);
    const changedFiles = changedFilesRaw.split('\n').filter(Boolean);
    const diff = await git(repoPath, ['show', '--format=', '--unified=40', '--no-ext-diff', sha]);
    commits.push({
      id: stableId('artifact', sha),
      type: 'commit',
      externalId: sha,
      title: subject ?? sha.slice(0, 8),
      body: subject ?? '',
      changedFiles,
      diff,
      committedAt: date,
    });
  }
  return commits;
}

export async function collectLastCommit(repoPath: string): Promise<CommitArtifact | undefined> {
  const sha = await getLastCommitSha(repoPath);
  const [commit] = await collectCommits(repoPath, '100 years ago', 1);
  return commit?.externalId === sha ? commit : undefined;
}
