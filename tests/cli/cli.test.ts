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
    const conceptAdd = await cli(['concept', 'add', '--repo', repo, '--id', 'repo.session_flow', '--label', 'Session flow', '--term', 'validateSession', '--path', 'src/auth/*']);
    expect(conceptAdd.stdout).toContain('Saved local concept repo.session_flow');
    const ingest = await cli(['ingest', '--repo', repo, '--since', '365d']);
    expect(ingest.stdout).toContain('learning cards');
    const courseCreate = await cli(['course', 'create', '--repo', repo, '--id', 'learn-auth', '--title', 'Learn auth', '--goal', 'Understand auth sessions', '--materials', 'src/auth/**', '--docs', 'docs/**']);
    expect(courseCreate.stdout).toContain('Saved course learn-auth');
    const courseList = await cli(['course', 'list', '--repo', repo]);
    expect(courseList.stdout).toContain('Understand auth sessions');
    const questionDraft = await cli(['questions', 'draft', '--repo', repo, '--course', 'learn-auth', '--provider', 'fake', '--count', '1']);
    expect(questionDraft.stdout).toContain('Network used: no');
    const draftedState = JSON.parse(await readFile(path.join(repo, '.skilltrace', 'state.json'), 'utf8')) as { questionBank: Array<{ id: string }> };
    const questionId = draftedState.questionBank[0]!.id;
    const questionAccept = await cli(['questions', 'accept', '--repo', repo, '--id', questionId]);
    expect(questionAccept.stdout).toContain('Accepted question');
    const questionList = await cli(['questions', 'list', '--repo', repo]);
    expect(questionList.stdout).toContain('Accepted: 1');
    const courseCards = await cli(['cards', 'generate', '--repo', repo, '--course', 'learn-auth', '--count', '1']);
    expect(courseCards.stdout).toContain('Generated');
    const studyAssign = await cli(['study', 'assign', '--repo', repo, '--seed', 'cli-pilot', '--count', '2']);
    expect(studyAssign.stdout).toContain('Active-control study assignments');
    expect(studyAssign.stdout).toContain('Active-control passive review: 1');
    const studyList = await cli(['study', 'list', '--repo', repo]);
    expect(studyList.stdout).toContain('cli-pilot');
    const studyState = JSON.parse(await readFile(path.join(repo, '.skilltrace', 'state.json'), 'utf8')) as { studyAssignments: Array<{ id: string; condition: string }> };
    const passiveAssignment = studyState.studyAssignments.find((assignment) => assignment.condition === 'active_control')!;
    const passiveComplete = await cli(['study', 'passive-complete', '--repo', repo, '--assignment', passiveAssignment.id, '--duration-ms', '45000', '--note', 'read diff packet']);
    expect(passiveComplete.stdout).toContain('Completed passive-review assignment');
    const timeline = await cli(['timeline', '--repo', repo]);
    expect(timeline.stdout).toContain('"course"');
    expect(timeline.stdout).toContain('"question"');
    const privacyInit = await cli(['privacy', 'init', '--repo', repo, '--ignore-path', 'src/auth/*', '--redact', 'Session']);
    expect(privacyInit.stdout).toContain('offline privacy config');
    const privacyPreview = await cli(['privacy', 'preview', '--repo', repo, '--include-snippets', '--provider', 'fake']);
    expect(privacyPreview.stdout).toContain('Would send: no');
    expect(privacyPreview.stdout).toContain('ignoredEvidenceCount');
    const enrich = await cli(['enrich', '--repo', repo, '--provider', 'fake', '--limit', '1']);
    expect(enrich.stdout).toContain('enrichment experiment');
    expect(enrich.stdout).toContain('Network used: no');
    const today = await cli(['today', '--repo', repo]);
    expect(today.stdout).toContain("Today's 5-minute review");
    const dashboard = await cli(['dashboard', '--repo', repo]);
    expect(dashboard.stdout).toContain('dashboard.html');
    const html = await readFile(path.join(repo, '.skilltrace', 'dashboard.html'), 'utf8');
    expect(html).toContain('MergeLearn Tutor');

    const state = JSON.parse(await readFile(path.join(repo, '.skilltrace', 'state.json'), 'utf8')) as { learningItems: Array<{ id: string; conceptId: string }>; concepts: Array<{ id: string }> };
    expect(state.concepts.map((candidate) => candidate.id)).toContain('repo.session_flow');
    const lexiconList = await cli(['concept', 'list', '--repo', repo]);
    expect(lexiconList.stdout).toContain('Session flow');
    const item = state.learningItems[0]!;
    const feedback = await cli(['feedback', '--repo', repo, '--item', item.id, '--event', 'marked_wrong', '--note', 'not useful yet']);
    expect(feedback.stdout).toContain('Recorded marked_wrong');
    const rating = await cli(['rate', '--repo', repo, '--item', item.id, '--answerability', '5', '--usefulness', '4', '--note', 'answerable dogfood card']);
    expect(rating.stdout).toContain('Recorded manual rating');
    const ratings = await cli(['ratings', '--repo', repo]);
    expect(ratings.stdout).toContain('Manual rating summary');
    expect(ratings.stdout).toContain('Average usefulness: 4.0/5');
    const correction = await cli(['correct', '--repo', repo, '--concept', item.conceptId, '--type', 'not_useful', '--note', 'hide generic card']);
    expect(correction.stdout).toContain('Recorded not_useful correction');
    const profile = await cli(['profile', '--repo', repo]);
    expect(profile.stdout).toContain('Corrections: 1');
    const updated = JSON.parse(await readFile(path.join(repo, '.skilltrace', 'state.json'), 'utf8')) as { corrections: unknown[]; learningEvents: unknown[]; manualRatings: unknown[]; learningItems: Array<{ conceptId: string }> };
    expect(updated.corrections).toHaveLength(1);
    expect(updated.manualRatings).toHaveLength(1);
    expect(updated.learningEvents.length).toBeGreaterThanOrEqual(2);
    expect(updated.learningItems.some((candidate) => candidate.conceptId === item.conceptId)).toBe(false);
  }, 60_000);
});
