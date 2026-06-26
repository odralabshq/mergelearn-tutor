import { describe, expect, it } from 'vitest';

import { assertOutboundAllowed, createOutboundPreview, DEFAULT_PRIVACY_CONFIG, parsePrivacyConfig, redactText, renderOutboundPreview } from '../../src/core/privacy.js';
import { createEmptyState } from '../../src/core/store.js';
import type { LearningItem, TutorState } from '../../src/core/types.js';

function item(overrides: Partial<LearningItem> = {}): LearningItem {
  return {
    id: 'card_auth',
    conceptId: 'security.auth_boundary',
    type: 'explain_back',
    title: 'Explain auth boundary',
    bodyMarkdown: 'Review the auth change.',
    prompt: 'Explain how token validation protects the session.',
    expectedFocus: ['validate token', 'avoid leaking secrets'],
    evidence: [{ commit: 'abcdef1234567890', path: 'src/auth/session.ts', label: 'auth token', snippet: '+const token = "ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";\n+const apiKey = "secret-value";' }],
    difficulty: 'advanced',
    createdAt: '2026-06-26T00:00:00.000Z',
    ...overrides,
  };
}

function state(): TutorState {
  return { ...createEmptyState('/home/adam/private-repo', ['email alice@example.com']), learningItems: [item()] };
}

describe('privacy boundary and outbound preview', () => {
  it('defaults to no-network and snippets omitted', () => {
    const preview = createOutboundPreview(state());
    expect(preview.networkAllowed).toBe(false);
    expect(preview.wouldSend).toBe(false);
    expect(preview.blockedReason).toBe('network disabled by default');
    expect(preview.payload.items[0]?.evidence[0]?.snippet).toBeUndefined();
    expect(renderOutboundPreview(preview)).toContain('Would send: no');
  });

  it('redacts secrets, emails, and configured terms before previewing snippets', () => {
    const config = parsePrivacyConfig({ redaction: { extraTerms: ['session'] } });
    const preview = createOutboundPreview(state(), config, { includeSnippets: true, provider: 'fake' });
    const rendered = JSON.stringify(preview.payload);
    expect(rendered).not.toContain('ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(rendered).not.toContain('alice@example.com');
    expect(rendered).not.toContain('secret-value');
    expect(rendered).not.toContain('session');
    expect(preview.metadata.redactionCount).toBeGreaterThanOrEqual(4);
  });

  it('omits ignored paths from outbound evidence', () => {
    const config = parsePrivacyConfig({ ignorePaths: ['src/auth/*'] });
    const preview = createOutboundPreview(state(), config, { includeSnippets: true });
    expect(preview.payload.items[0]?.evidence).toHaveLength(0);
    expect(preview.metadata.ignoredEvidenceCount).toBe(1);
  });

  it('fails closed until network, consent, and provider are all explicit', () => {
    expect(() => assertOutboundAllowed(DEFAULT_PRIVACY_CONFIG)).toThrow(/disabled/);
    expect(() => assertOutboundAllowed(parsePrivacyConfig({ network: { enabled: true, provider: 'fake' } }))).toThrow(/consent/);
    expect(() => assertOutboundAllowed(parsePrivacyConfig({ network: { enabled: true, consentToSend: true } }))).toThrow(/provider/);
    expect(() => assertOutboundAllowed(parsePrivacyConfig({ network: { enabled: true, consentToSend: true, provider: 'fake' } }))).not.toThrow();
  });

  it('validates provider and list config types', () => {
    expect(() => parsePrivacyConfig({ network: { provider: 'surprise' } })).toThrow(/Unknown privacy provider/);
    expect(() => parsePrivacyConfig({ ignorePaths: 'src/**' })).toThrow(/string-list/);
  });

  it('redacts home and Windows user path segments in evidence paths', () => {
    const privacyState = { ...state(), learningItems: [item({ evidence: [{ path: '/mnt/c/Users/Ada/secret/file.ts', label: 'path' }, { path: '/home/adam/work/file.ts', label: 'path' }] })] };
    const rendered = JSON.stringify(createOutboundPreview(privacyState, DEFAULT_PRIVACY_CONFIG).payload);
    expect(rendered).toContain('/mnt/[DRIVE]/Users/[USER]');
    expect(rendered).toContain('/home/[USER]');
  });

  it('redacts standalone text helper values', () => {
    expect(redactText('password=my-secret and AKIA1234567890ABCDEF')).not.toContain('my-secret');
  });
});
