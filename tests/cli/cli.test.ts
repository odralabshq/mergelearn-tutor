import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

async function git(repo: string, args: string[]): Promise<void> {
  await execFileAsync('git', args, { cwd: repo, encoding: 'utf8' });
}

async function createRepo(): Promise<string> {
  const repo = await mkdtemp(path.join(os.tmpdir(), 'mergelearn-tutor-cli-'));
  await git(repo, ['init', '-b', 'main']);
  await git(repo, ['config', 'user.email', 'test@example.com']);
  await git(repo, ['config', 'user.name', 'Tutor Test']);
  await mkdir(path.join(repo, 'src/auth'), { recursive: true });
  await writeFile(path.join(repo, 'src/auth/session.ts'), 'export type SessionEvent = { type: "login"; token: string } | { type: "logout" };\nexport async function validateSession(token: string): Promise<boolean> { return token.length > 0; }\n');
  await git(repo, ['add', '.']);
  await git(repo, ['commit', '-m', 'add typed auth session']);
  return repo;
}

async function cli(args: string[], cwd = process.cwd()) {
  return execFileAsync(path.join(process.cwd(), 'node_modules/.bin/tsx'), ['src/cli.ts', ...args], { cwd, encoding: 'utf8' });
}

describe('mergelearn-tutor CLI', () => {
  it('initializes, ingests, renders today, and writes dashboard', async () => {
    const repo = await createRepo();
    const init = await cli(['init', '--repo', repo]);
    expect(init.stdout).toContain('Initialized MergeLearn Tutor');
    const ingest = await cli(['ingest', '--repo', repo, '--since', '365d']);
    expect(ingest.stdout).toContain('learning cards');
    const today = await cli(['today', '--repo', repo]);
    expect(today.stdout).toContain("Today's 5-minute review");
    const dashboard = await cli(['dashboard', '--repo', repo]);
    expect(dashboard.stdout).toContain('dashboard.html');
    const html = await readFile(path.join(repo, '.skilltrace', 'dashboard.html'), 'utf8');
    expect(html).toContain('MergeLearn Tutor');
  });
});
