import { describe, expect, it } from 'vitest';

import { extractConcepts } from '../../src/core/concepts.js';
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
});
