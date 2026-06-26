import type { LearningItem, TutorState } from './types.js';
import { createOutboundPreview, DEFAULT_PRIVACY_CONFIG, type OutboundPreview, type PrivacyConfig, type PrivacyProvider } from './privacy.js';
import { activeLearningItems } from './planner.js';

export type EnrichmentProvider = Extract<PrivacyProvider, 'fake' | 'local'>;

export type EnrichmentOptions = {
  provider?: PrivacyProvider | string;
  includeSnippets?: boolean;
  limit?: number;
};

export type EnrichedLearningItem = {
  sourceItemId: string;
  conceptId: string;
  provider: EnrichmentProvider;
  networkUsed: false;
  generatedAt: string;
  title: string;
  rewrittenPrompt: string;
  workedExample: string;
  followUpQuestions: string[];
  provenance: {
    truthSource: 'deterministic-card';
    allowedChanges: Array<'wording' | 'worked_example' | 'follow_up_questions'>;
    evidencePaths: string[];
  };
};

export type EnrichmentResult = {
  version: 1;
  provider: EnrichmentProvider;
  networkUsed: false;
  preview: OutboundPreview;
  deterministicItems: LearningItem[];
  enrichedItems: EnrichedLearningItem[];
};

export function enrichLearningItems(state: TutorState, config: PrivacyConfig = DEFAULT_PRIVACY_CONFIG, options: EnrichmentOptions = {}): EnrichmentResult {
  const provider = parseEnrichmentProvider(options.provider ?? 'fake');
  const preview = createOutboundPreview(state, config, { provider, includeSnippets: options.includeSnippets, limit: options.limit });
  const deterministicItems = activeLearningItems(state).slice(0, options.limit ?? 5);
  return {
    version: 1,
    provider,
    networkUsed: false,
    preview,
    deterministicItems,
    enrichedItems: preview.payload.items.map((item, index) => enrichPreviewItem(item, deterministicItems[index], provider)),
  };
}

function parseEnrichmentProvider(value: PrivacyProvider | string): EnrichmentProvider {
  if (value === 'fake' || value === 'local') return value;
  if (value === 'remote') throw new Error('Remote LLM enrichment is outside the local-only experiment. Use --provider fake or --provider local.');
  throw new Error(`Unknown enrichment provider: ${value}`);
}

function enrichPreviewItem(item: OutboundPreview['payload']['items'][number], source: LearningItem | undefined, provider: EnrichmentProvider): EnrichedLearningItem {
  const evidencePaths = item.evidence.map((evidence) => evidence.path).slice(0, 3);
  const firstPath = evidencePaths[0] ?? 'the cited evidence';
  return {
    sourceItemId: item.id,
    conceptId: item.conceptId,
    provider,
    networkUsed: false,
    generatedAt: new Date().toISOString(),
    title: `${item.title} — enriched wording`,
    rewrittenPrompt: rewritePrompt(item.prompt, firstPath, provider),
    workedExample: workedExample(item.expectedFocus, firstPath, source?.type ?? 'concept_card'),
    followUpQuestions: followUps(item.expectedFocus, firstPath),
    provenance: {
      truthSource: 'deterministic-card',
      allowedChanges: ['wording', 'worked_example', 'follow_up_questions'],
      evidencePaths,
    },
  };
}

function rewritePrompt(prompt: string, firstPath: string, provider: EnrichmentProvider): string {
  const prefix = provider === 'fake' ? '[fake/local-only] ' : '[local-only] ';
  return `${prefix}${prompt} Start with one concrete detail from ${firstPath}, then explain the concept in your own words.`;
}

function workedExample(focus: string[], firstPath: string, type: LearningItem['type']): string {
  const focusText = focus.slice(0, 3).join(', ') || 'the deterministic card focus';
  if (type === 'spot_risk') return `Example answer shape: identify the boundary in ${firstPath}, name the risky failure mode, then point to the test or guardrail that should catch it. Focus on: ${focusText}.`;
  if (type === 'compare_pattern') return `Example answer shape: describe the behavior near ${firstPath}, compare it with the nearest test expectation, then say what regression would fail. Focus on: ${focusText}.`;
  return `Example answer shape: cite ${firstPath}, define the concept plainly, and name why it matters for the next edit. Focus on: ${focusText}.`;
}

function followUps(focus: string[], firstPath: string): string[] {
  const firstFocus = focus[0] ?? 'the main idea';
  return [
    `What line or symbol in ${firstPath} best anchors ${firstFocus}?`,
    'What mistake would you be more likely to catch after reviewing this card?',
  ];
}

export function renderEnrichmentComparison(result: EnrichmentResult): string {
  const lines = ['MergeLearn Tutor enrichment experiment', '', `Provider: ${result.provider}`, 'Network used: no', `Preview would send: ${result.preview.wouldSend ? 'yes' : 'no'}`];
  if (result.preview.blockedReason) lines.push(`Preview blocked reason: ${result.preview.blockedReason}`);
  lines.push('', 'A/B card comparison:');
  result.enrichedItems.forEach((item, index) => {
    const deterministic = result.deterministicItems[index];
    lines.push('', `## ${index + 1}. ${deterministic?.title ?? item.title}`, '', 'Deterministic prompt:', deterministic?.prompt ?? '(missing deterministic card)', '', 'Enriched wording:', item.rewrittenPrompt, '', 'Worked example:', item.workedExample, '', 'Follow-up questions:', ...item.followUpQuestions.map((question) => `- ${question}`), '', `Provenance: ${item.provenance.truthSource}; evidence: ${item.provenance.evidencePaths.join(', ') || 'none'}`);
  });
  return `${lines.join('\n')}\n`;
}
