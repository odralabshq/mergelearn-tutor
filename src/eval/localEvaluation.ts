import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { extractConcepts } from '../core/concepts.js';
import { collectCommits } from '../core/git.js';
import { mergeLearningState } from '../core/planner.js';
import { createEmptyState } from '../core/store.js';

const execFileAsync = promisify(execFile);

async function git(repo: string, args: string[]): Promise<void> {
  await execFileAsync('git', args, { cwd: repo, encoding: 'utf8' });
}

async function createFixture(): Promise<string> {
  const repo = await mkdtemp(path.join(os.tmpdir(), 'mergelearn-tutor-eval-'));
  await git(repo, ['init', '-b', 'main']);
  await git(repo, ['config', 'user.email', 'eval@example.com']);
  await git(repo, ['config', 'user.name', 'Eval User']);
  await mkdir(path.join(repo, 'src/auth'), { recursive: true });
  await writeFile(path.join(repo, 'src/auth/session.ts'), 'export type SessionEvent = { type: "login"; token: string } | { type: "logout" };\nexport async function validateSession(token: string): Promise<boolean> { return token.length > 0; }\n');
  await git(repo, ['add', '.']);
  await git(repo, ['commit', '-m', 'add typed auth session']);
  await writeFile(path.join(repo, 'src/auth/session.test.ts'), 'import { describe, expect, it } from "vitest";\nimport { validateSession } from "./session";\ndescribe("validateSession", () => { it("rejects empty token", async () => expect(await validateSession("")).toBe(false)); });\n');
  await git(repo, ['add', '.']);
  await git(repo, ['commit', '-m', 'add session behavior test']);
  return repo;
}

async function main(): Promise<void> {
  const repo = await createFixture();
  try {
    const artifacts = await collectCommits(repo, '365d', 10);
    const concepts = extractConcepts(artifacts);
    const state = mergeLearningState(createEmptyState(repo), artifacts, concepts);
    const useful = concepts.filter((concept) => concept.evidence.length > 0);
    const hasAuth = concepts.some((concept) => concept.id === 'security.auth_boundary');
    const hasUnion = concepts.some((concept) => concept.id === 'typescript.union_types');
    const hasTesting = concepts.some((concept) => concept.id === 'testing.behavior_tests');
    const passed = useful.length >= 4 && state.learningItems.length >= 3 && hasAuth && hasUnion && hasTesting;
    process.stdout.write(`# MergeLearn Tutor Local Evaluation\n\nResult: ${passed ? 'PASS' : 'FAIL'}\n\nConcepts: ${concepts.length}\nLearning cards: ${state.learningItems.length}\nAuth detected: ${hasAuth}\nUnion detected: ${hasUnion}\nTesting detected: ${hasTesting}\n`);
    if (!passed) process.exitCode = 1;
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
