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

    const state = JSON.parse(await readFile(path.join(repo, '.skilltrace', 'state.json'), 'utf8')) as { learningItems: Array<{ id: string; conceptId: string }>; concepts: Array<{ id: string }> };
    const item = state.learningItems[0]!;
    const feedback = await cli(['feedback', '--repo', repo, '--item', item.id, '--event', 'marked_wrong', '--note', 'not useful yet']);
    expect(feedback.stdout).toContain('Recorded marked_wrong');
    const correction = await cli(['correct', '--repo', repo, '--concept', item.conceptId, '--type', 'not_useful', '--note', 'hide generic card']);
    expect(correction.stdout).toContain('Recorded not_useful correction');
    const profile = await cli(['profile', '--repo', repo]);
    expect(profile.stdout).toContain('Corrections: 1');
    const updated = JSON.parse(await readFile(path.join(repo, '.skilltrace', 'state.json'), 'utf8')) as { corrections: unknown[]; learningEvents: unknown[]; learningItems: Array<{ conceptId: string }> };
    expect(updated.corrections).toHaveLength(1);
    expect(updated.learningEvents.length).toBeGreaterThanOrEqual(2);
    expect(updated.learningItems.some((candidate) => candidate.conceptId === item.conceptId)).toBe(false);
  });
});
