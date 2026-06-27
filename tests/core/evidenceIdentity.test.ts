import { describe, expect, it } from 'vitest';

import { deriveEvidenceKey } from '../../src/core/evidenceIdentity.js';

describe('evidence identity', () => {
  it('derives the same key for the same evidence content', () => {
    const first = deriveEvidenceKey({ commit: 'abc123', path: 'src/auth.ts', label: 'auth', snippet: '+return canEdit;' });
    const second = deriveEvidenceKey({ commit: 'abc123', path: 'src/auth.ts', label: 'auth', snippet: '+return canEdit;' });

    expect(second).toBe(first);
  });

  it('changes when snippet content changes on the same path', () => {
    const first = deriveEvidenceKey({ commit: 'abc123', path: 'src/auth.ts', label: 'auth', snippet: '+return user.role === "admin";' });
    const second = deriveEvidenceKey({ commit: 'abc123', path: 'src/auth.ts', label: 'auth', snippet: '+return user.permissions.includes("billing");' });

    expect(second).not.toBe(first);
  });

  it('remains stable for evidence without a commit', () => {
    const key = deriveEvidenceKey({ path: 'docs/auth.md', label: 'auth docs', snippet: '+Auth docs' });

    expect(key).toMatch(/^evidence_[a-f0-9]{16}$/);
    expect(deriveEvidenceKey({ path: 'docs/auth.md', label: 'auth docs', snippet: '+Auth docs' })).toBe(key);
  });
});
