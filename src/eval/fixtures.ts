import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import type { EvaluationRepoSpec } from './types.js';

const execFileAsync = promisify(execFile);

type FixtureKind = 'typed-auth' | 'cli-tool' | 'react-hook';

async function git(repo: string, args: string[]): Promise<void> {
  await execFileAsync('git', args, { cwd: repo, encoding: 'utf8' });
}

async function initRepo(prefix: string): Promise<string> {
  const repo = await mkdtemp(path.join(os.tmpdir(), prefix));
  await git(repo, ['init', '-b', 'main']);
  await git(repo, ['config', 'user.email', 'eval@example.com']);
  await git(repo, ['config', 'user.name', 'Eval User']);
  return repo;
}

export async function createEvalFixture(kind: FixtureKind): Promise<EvaluationRepoSpec> {
  if (kind === 'typed-auth') return createTypedAuthFixture();
  if (kind === 'cli-tool') return createCliToolFixture();
  return createReactHookFixture();
}

export async function createAllEvalFixtures(): Promise<EvaluationRepoSpec[]> {
  return Promise.all([createTypedAuthFixture(), createCliToolFixture(), createReactHookFixture()]);
}

async function createTypedAuthFixture(): Promise<EvaluationRepoSpec> {
  const repo = await initRepo('mergelearn-tutor-auth-');
  await mkdir(path.join(repo, 'src/auth'), { recursive: true });
  await writeFile(path.join(repo, 'src/auth/session.ts'), 'export type SessionEvent = { type: "login"; token: string } | { type: "logout" };\nexport async function validateSession(token: string): Promise<boolean> { return token.length > 0; }\n');
  await git(repo, ['add', '.']);
  await git(repo, ['commit', '-m', 'add typed auth session']);
  await writeFile(path.join(repo, 'src/auth/session.test.ts'), 'import { describe, expect, it } from "vitest";\nimport { validateSession } from "./session";\ndescribe("validateSession", () => { it("rejects empty token", async () => expect(await validateSession("")).toBe(false)); });\n');
  await git(repo, ['add', '.']);
  await git(repo, ['commit', '-m', 'add session behavior test']);
  return { id: 'fixture-typed-auth', name: 'Typed auth fixture', repoPath: repo, since: '365d', limit: 20, expectedConceptIds: ['security.auth_boundary', 'typescript.union_types', 'typescript.async_await', 'testing.behavior_tests'] };
}

async function createCliToolFixture(): Promise<EvaluationRepoSpec> {
  const repo = await initRepo('mergelearn-tutor-cli-');
  await mkdir(path.join(repo, 'src'), { recursive: true });
  await writeFile(path.join(repo, 'src/cli.ts'), 'import { Command } from "commander";\nconst program = new Command();\nprogram.command("scan").action(() => { process.stdout.write("ok\\n"); });\nprogram.parse(process.argv);\n');
  await writeFile(path.join(repo, 'package.json'), '{"scripts":{"scan":"node dist/cli.js"},"dependencies":{"commander":"^12.0.0"}}\n');
  await git(repo, ['add', '.']);
  await git(repo, ['commit', '-m', 'add cli command']);
  return { id: 'fixture-cli-tool', name: 'CLI tool fixture', repoPath: repo, since: '365d', limit: 20, expectedConceptIds: ['dev_workflow.cli_tools', 'dev_workflow.dependency_management'] };
}

async function createReactHookFixture(): Promise<EvaluationRepoSpec> {
  const repo = await initRepo('mergelearn-tutor-react-');
  await mkdir(path.join(repo, 'src'), { recursive: true });
  await writeFile(path.join(repo, 'src/Counter.tsx'), 'import { useEffect, useState } from "react";\nexport function Counter() { const [count, setCount] = useState(0); useEffect(() => { document.title = String(count); }, [count]); return <button onClick={() => setCount(count + 1)}>{count}</button>; }\n');
  await git(repo, ['add', '.']);
  await git(repo, ['commit', '-m', 'add counter hook component']);
  return { id: 'fixture-react-hook', name: 'React hook fixture', repoPath: repo, since: '365d', limit: 20, expectedConceptIds: ['react.hooks'] };
}
