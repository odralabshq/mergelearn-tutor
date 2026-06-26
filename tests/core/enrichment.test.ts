import { describe, expect, it } from 'vitest';

import { enrichLearningItems, renderEnrichmentComparison } from '../../src/core/enrichment.js';
import { parsePrivacyConfig } from '../../src/core/privacy.js';
import { createEmptyState } from '../../src/core/store.js';
import type { LearningItem, TutorState } from '../../src/core/types.js';

function item(overrides: Partial<LearningItem> = {}): LearningItem {
  return {
    id: 'card_cli',
    conceptId: 'dev_workflow.cli',
    type: 'explain_back',
    title: 'CLI command behavior in your recent work',
    bodyMarkdown: 'Review CLI behavior.',
    prompt: 'Explain how the command handles flags.',
    expectedFocus: ['flag parsing', 'user-visible output'],
    evidence: [{ path: 'src/cli.ts', label: 'command handler', snippet: '+program.command("enrich")' }],
    difficulty: 'intermediate',
    createdAt: '2026-06-26T00:00:00.000Z',
    ...overrides,
  };
}

function state(): TutorState {
  return { ...createEmptyState('/tmp/repo'), learningItems: [item()] };
}

describe('local-only enrichment experiment', () => {
  it('creates fake enriched wording without using network or replacing truth source', () => {
    const result = enrichLearningItems(state(), undefined, { provider: 'fake', limit: 1 });
    expect(result.networkUsed).toBe(false);
    expect(result.preview.wouldSend).toBe(false);
    expect(result.enrichedItems).toHaveLength(1);
    expect(result.enrichedItems[0]?.provenance.truthSource).toBe('deterministic-card');
    expect(result.enrichedItems[0]?.rewrittenPrompt).toContain('[fake/local-only]');
    expect(renderEnrichmentComparison(result)).toContain('A/B card comparison');
  });

  it('rejects remote provider in the local-only experiment', () => {
    expect(() => enrichLearningItems(state(), undefined, { provider: 'remote' })).toThrow(/Remote LLM enrichment/);
    expect(() => enrichLearningItems(state(), undefined, { provider: 'surprise' })).toThrow(/Unknown enrichment provider/);
  });

  it('uses redacted preview payload as enrichment input', () => {
    const config = parsePrivacyConfig({ redaction: { extraTerms: ['CLI'] } });
    const result = enrichLearningItems(state(), config, { provider: 'local', includeSnippets: true });
    expect(JSON.stringify(result.enrichedItems)).not.toContain('CLI');
    expect(result.provider).toBe('local');
  });
});
