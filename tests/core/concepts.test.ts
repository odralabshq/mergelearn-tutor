import { describe, expect, it } from 'vitest';

import { extractConceptFindings, extractConcepts } from '../../src/core/concepts.js';
import type { CommitArtifact } from '../../src/core/types.js';

function artifact(diff: string, changedFiles = ['src/auth/session.ts']): CommitArtifact {
  return { id: 'a1', type: 'commit', externalId: 'abc123', title: 'change auth', body: '', changedFiles, diff };
}

describe('concept extraction', () => {
  it('detects TypeScript, security, and repo-domain concepts from grounded diff evidence', () => {
    const concepts = extractConcepts([artifact('diff --git a/src/auth/session.ts b/src/auth/session.ts\n+export type SessionEvent = { type: "login"; token: string } | { type: "logout" };\n+export async function validateSession(token: string): Promise<boolean> { return token.length > 0; }')]);
    expect(concepts.map((item) => item.id)).toContain('typescript.union_types');
    expect(concepts.map((item) => item.id)).toContain('typescript.async_await');
    expect(concepts.map((item) => item.id)).toContain('security.auth_boundary');
    expect(concepts.every((concept) => concept.evidence.length > 0)).toBe(true);
  });

  it('detects behavior test concepts from test paths', () => {
    const concepts = extractConcepts([artifact('diff --git a/tests/session.test.ts b/tests/session.test.ts\n+it("works", () => expect(true).toBe(true));', ['tests/session.test.ts'])]);
    expect(concepts.map((item) => item.id)).toContain('testing.behavior_tests');
  });

  it('does not infer language concepts from TypeScript file paths alone', () => {
    const concepts = extractConcepts([artifact('diff --git a/src/plain.ts b/src/plain.ts\n+const value = 1;\n', ['src/plain.ts'])]);
    expect(concepts.map((item) => item.id)).not.toContain('typescript.generics');
    expect(concepts.map((item) => item.id)).not.toContain('typescript.type_aliases');
  });

  it('labels repo-domain concepts with the inferred term, not the first evidence filename', () => {
    const concepts = extractConcepts([artifact('diff --git a/docs/agent/AGENT_STATE.md b/docs/agent/AGENT_STATE.md\n@@ -0,0 +1,2 @@\n+state\n+agent docs\n', ['docs/agent/AGENT_STATE.md'])]);
    expect(concepts.find((item) => item.id === 'repo.docs')?.label).toBe('docs');
    expect(concepts.find((item) => item.id === 'repo.agent')?.label).toBe('agent');
    expect(concepts.find((item) => item.id === 'repo.agent')?.evidence[0]?.snippet).toContain('@@');
  });

  it('preserves compact unified diff context for matched evidence snippets', () => {
    const diff = [
      'diff --git a/src/auth/session.ts b/src/auth/session.ts',
      '@@ -1,5 +1,6 @@',
      ' export type SessionEvent = { type: "login"; token: string } | { type: "logout" };',
      '-export function validateSession(token: string): boolean { return true; }',
      '+export async function validateSession(token: string): Promise<boolean> { return token.length > 0; }',
    ].join('\n');
    const concepts = extractConcepts([artifact(diff)]);
    const snippet = concepts.find((item) => item.id === 'security.auth_boundary')?.evidence[0]?.snippet ?? '';
    expect(snippet).toContain('@@ -1,5 +1,6 @@');
    expect(snippet).toContain('-export function validateSession');
    expect(snippet).toContain('+export async function validateSession');
    expect(snippet).not.toContain('diff --git');
  });

  it('normalizes concept findings with source, reason, path, and evidence identity', () => {
    const diff = 'diff --git a/src/auth/session.ts b/src/auth/session.ts\n+export type SessionEvent = { type: "login"; token: string } | { type: "logout" };';
    const findings = extractConceptFindings([artifact(diff)]);
    const unionFinding = findings.find((finding) => finding.conceptId === 'typescript.union_types');
    const repoFinding = findings.find((finding) => finding.conceptId === 'repo.auth');

    expect(unionFinding).toMatchObject({ source: 'ast', path: 'src/auth/session.ts' });
    expect(unionFinding?.reason).toContain('union');
    expect(unionFinding?.evidenceKey).toMatch(/^evidence_[a-f0-9]{16}$/);
    expect(unionFinding?.confidence).toBeGreaterThan(0.8);
    expect(repoFinding).toMatchObject({ source: 'repo_domain', path: 'src/auth/session.ts' });
  });
});
