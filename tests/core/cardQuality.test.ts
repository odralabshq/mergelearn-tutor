import { describe, expect, it } from 'vitest';

import { evaluateCardQuality } from '../../src/core/cardQuality.js';
import type { LearningItem } from '../../src/core/types.js';

function card(overrides: Partial<LearningItem> = {}): LearningItem {
  return {
    id: 'card-1',
    conceptId: 'security.auth_boundary',
    type: 'spot_risk',
    questionPlane: 'risk_and_tests',
    title: 'src/auth.ts: Auth boundary',
    snippet: {
      path: 'src/auth.ts',
      label: 'auth guard',
      language: 'typescript',
      code: 'if (!session) return forbidden();\nreturn allow(user.role);',
    },
    bodyMarkdown: 'body',
    prompt: 'In src/auth.ts, what risky case does this auth guard prevent, and what test should catch it?',
    explanationMarkdown: 'This guard prevents unauthenticated access and should be covered by a route/session test.',
    expectedFocus: ['failure mode', 'test or guardrail', 'src/auth.ts'],
    evidence: [
      { path: 'src/auth.ts', label: 'auth guard', snippet: 'if (!session) return forbidden();' },
      { path: 'tests/auth.test.ts', label: 'auth test', snippet: 'expect(await canAccess()).toBe(false);' },
    ],
    difficulty: 'advanced',
    createdAt: '2026-01-01T00:00:00.000Z',
    status: 'active',
    generation: 1,
    source: 'manual_generate',
    ...overrides,
  };
}

describe('card quality', () => {
  it('marks grounded, specific, answerable cards as ready', () => {
    const quality = evaluateCardQuality(card());
    expect(quality.verdict).toBe('ready');
    expect(quality.scores.evidence).toBeGreaterThanOrEqual(0.8);
    expect(quality.scores.answerability).toBeGreaterThanOrEqual(0.8);
    expect(quality.warnings).toHaveLength(0);
  });

  it('blocks vague cards without evidence before they reach review', () => {
    const quality = evaluateCardQuality(card({ prompt: 'Explain this.', expectedFocus: [], evidence: [], explanationMarkdown: '' }));
    expect(quality.verdict).toBe('blocked');
    expect(quality.warnings).toContain('missing evidence');
    expect(quality.warnings).toContain('prompt too vague');
  });

  it('flags duplicate cards as needing review', () => {
    const first = card();
    const duplicate = card({ id: 'card-2' });
    const quality = evaluateCardQuality(duplicate, [first]);
    expect(quality.verdict).toBe('needs_review');
    expect(quality.scores.duplicateRisk).toBeGreaterThanOrEqual(0.8);
    expect(quality.warnings).toContain('duplicate risk');
  });
});
