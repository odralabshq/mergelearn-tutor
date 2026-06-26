import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { EvidenceRef, LearningItem, TutorState } from './types.js';

export type PrivacyProvider = 'fake' | 'local' | 'remote';

export type PrivacyConfig = {
  version: 1;
  network: {
    enabled: boolean;
    provider?: PrivacyProvider;
    consentToSend: boolean;
  };
  redaction: {
    replacement: string;
    extraTerms: string[];
  };
  ignorePaths: string[];
  includeSnippetsByDefault: boolean;
};

export type OutboundPreviewOptions = {
  provider?: PrivacyProvider;
  includeSnippets?: boolean;
  limit?: number;
};

export type PreviewEvidence = {
  path: string;
  label: string;
  commit?: string;
  snippet?: string;
};

export type OutboundPreviewItem = {
  id: string;
  conceptId: string;
  title: string;
  prompt: string;
  expectedFocus: string[];
  evidence: PreviewEvidence[];
};

export type OutboundPreview = {
  networkAllowed: boolean;
  providerConfigured: boolean;
  provider?: PrivacyProvider;
  wouldSend: boolean;
  blockedReason?: string;
  payload: {
    repoName: string;
    goals: string[];
    items: OutboundPreviewItem[];
  };
  metadata: {
    itemCount: number;
    evidenceCount: number;
    snippetsIncluded: boolean;
    ignoredEvidenceCount: number;
    redactionCount: number;
  };
};

export const DEFAULT_PRIVACY_CONFIG: PrivacyConfig = {
  version: 1,
  network: { enabled: false, consentToSend: false },
  redaction: { replacement: '[REDACTED]', extraTerms: [] },
  ignorePaths: [],
  includeSnippetsByDefault: false,
};

export function privacyConfigPath(repoPath: string): string {
  return path.join(repoPath, '.skilltrace', 'privacy.json');
}

export async function loadPrivacyConfig(repoPath: string): Promise<PrivacyConfig> {
  try {
    return parsePrivacyConfig(JSON.parse(await readFile(privacyConfigPath(repoPath), 'utf8')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return DEFAULT_PRIVACY_CONFIG;
    throw error;
  }
}

export async function savePrivacyConfig(repoPath: string, config: PrivacyConfig): Promise<void> {
  await mkdir(path.dirname(privacyConfigPath(repoPath)), { recursive: true });
  await writeFile(privacyConfigPath(repoPath), `${JSON.stringify(parsePrivacyConfig(config), null, 2)}\n`);
}

export function parsePrivacyConfig(value: unknown): PrivacyConfig {
  if (!isRecord(value)) throw new Error('Privacy config must be a JSON object.');
  const network = isRecord(value.network) ? value.network : {};
  const redaction = isRecord(value.redaction) ? value.redaction : {};
  return {
    version: 1,
    network: {
      enabled: optionalBoolean(network.enabled, false),
      provider: optionalProvider(network.provider),
      consentToSend: optionalBoolean(network.consentToSend, false),
    },
    redaction: {
      replacement: optionalString(redaction.replacement) ?? DEFAULT_PRIVACY_CONFIG.redaction.replacement,
      extraTerms: stringArray(redaction.extraTerms),
    },
    ignorePaths: stringArray(value.ignorePaths),
    includeSnippetsByDefault: optionalBoolean(value.includeSnippetsByDefault, false),
  };
}

export function assertOutboundAllowed(config: PrivacyConfig, provider?: PrivacyProvider): void {
  const configuredProvider = provider ?? config.network.provider;
  if (!config.network.enabled) throw new Error('Outbound enrichment is disabled. Run privacy preview first and explicitly enable network config.');
  if (!config.network.consentToSend) throw new Error('Outbound enrichment requires consentToSend=true in .skilltrace/privacy.json.');
  if (!configuredProvider) throw new Error('Outbound enrichment requires an explicit provider.');
}

export function createOutboundPreview(state: TutorState, config: PrivacyConfig = DEFAULT_PRIVACY_CONFIG, options: OutboundPreviewOptions = {}): OutboundPreview {
  const includeSnippets = options.includeSnippets ?? config.includeSnippetsByDefault;
  const redactionCounter = { count: 0 };
  const ignoredCounter = { count: 0 };
  const items = state.learningItems.slice(0, options.limit ?? 5).map((item) => previewItem(item, config, includeSnippets, redactionCounter, ignoredCounter));
  const provider = options.provider ?? config.network.provider;
  const providerConfigured = Boolean(provider);
  const networkAllowed = config.network.enabled && config.network.consentToSend && providerConfigured;
  return {
    networkAllowed,
    providerConfigured,
    provider,
    wouldSend: networkAllowed,
    blockedReason: networkAllowed ? undefined : blockedReason(config, providerConfigured),
    payload: {
      repoName: path.basename(state.repoPath),
      goals: state.goals.map((goal) => redactText(goal, config, redactionCounter)),
      items,
    },
    metadata: {
      itemCount: items.length,
      evidenceCount: items.reduce((sum, item) => sum + item.evidence.length, 0),
      snippetsIncluded: includeSnippets,
      ignoredEvidenceCount: ignoredCounter.count,
      redactionCount: redactionCounter.count,
    },
  };
}

function previewItem(item: LearningItem, config: PrivacyConfig, includeSnippets: boolean, redactions: { count: number }, ignored: { count: number }): OutboundPreviewItem {
  return {
    id: item.id,
    conceptId: item.conceptId,
    title: redactText(item.title, config, redactions),
    prompt: redactText(item.prompt, config, redactions),
    expectedFocus: item.expectedFocus.map((focus) => redactText(focus, config, redactions)),
    evidence: previewEvidence(item.evidence, config, includeSnippets, redactions, ignored),
  };
}

function previewEvidence(items: EvidenceRef[], config: PrivacyConfig, includeSnippets: boolean, redactions: { count: number }, ignored: { count: number }): PreviewEvidence[] {
  const evidence: PreviewEvidence[] = [];
  for (const item of items) {
    if (config.ignorePaths.some((pattern) => pathMatches(item.path, pattern))) {
      ignored.count += 1;
      continue;
    }
    evidence.push({
      path: redactPath(item.path, config, redactions),
      label: redactText(item.label, config, redactions),
      commit: item.commit?.slice(0, 12),
      snippet: includeSnippets && item.snippet ? redactText(item.snippet, config, redactions) : undefined,
    });
  }
  return evidence;
}

export function redactText(value: string, config: PrivacyConfig = DEFAULT_PRIVACY_CONFIG, counter: { count: number } = { count: 0 }): string {
  let next = value;
  const replacement = config.redaction.replacement;
  const patterns = [
    /gh[pousr]_[A-Za-z0-9_]{20,}/g,
    /AKIA[0-9A-Z]{16}/g,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    /\b(secret|token|api[_-]?key|password)\s*[:=]\s*['\"]?[^'\"\s,;}]+/gi,
  ];
  for (const pattern of patterns) next = replaceAndCount(next, pattern, replacement, counter);
  for (const term of config.redaction.extraTerms) next = replaceAndCount(next, new RegExp(escapeRegExp(term), 'g'), replacement, counter);
  return next;
}

function redactPath(value: string, config: PrivacyConfig, counter: { count: number }): string {
  let next = value.replace(/\\/g, '/');
  next = replaceAndCount(next, /\/home\/[^/]+/g, '/home/[USER]', counter);
  next = replaceAndCount(next, /\/mnt\/[a-z]\/Users\/[^/]+/gi, '/mnt/[DRIVE]/Users/[USER]', counter);
  return redactText(next, config, counter);
}

function blockedReason(config: PrivacyConfig, providerConfigured: boolean): string | undefined {
  if (!config.network.enabled) return 'network disabled by default';
  if (!config.network.consentToSend) return 'missing consentToSend=true';
  if (!providerConfigured) return 'missing provider';
  return undefined;
}

function pathMatches(filePath: string, pattern: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  const normalizedPattern = pattern.replace(/\\/g, '/');
  if (normalizedPattern.includes('*')) return globToRegExp(normalizedPattern).test(normalized);
  return normalized === normalizedPattern || normalized.includes(normalizedPattern);
}

function globToRegExp(pattern: string): RegExp {
  const globstar = '\u0000';
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, globstar).replace(/\*/g, '[^/]*').replaceAll(globstar, '.*');
  return new RegExp(`^${escaped}$`);
}

function replaceAndCount(value: string, pattern: RegExp, replacement: string, counter: { count: number }): string {
  return value.replace(pattern, (match) => {
    if (match !== replacement) counter.count += 1;
    return replacement;
  });
}

function optionalProvider(value: unknown): PrivacyProvider | undefined {
  if (value === undefined) return undefined;
  const providers: PrivacyProvider[] = ['fake', 'local', 'remote'];
  if (typeof value === 'string' && providers.includes(value as PrivacyProvider)) return value as PrivacyProvider;
  throw new Error(`Unknown privacy provider: ${String(value)}`);
}

function optionalBoolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  throw new Error('Privacy boolean fields must be true or false.');
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('Privacy string-list fields must be arrays.');
  return value.map((item) => {
    if (typeof item !== 'string' || item.trim() === '') throw new Error('Privacy string-list items must be non-empty strings.');
    return item.trim();
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function renderOutboundPreview(preview: OutboundPreview): string {
  const lines = [
    'MergeLearn Tutor outbound preview',
    '',
    `Network: ${preview.networkAllowed ? 'enabled by explicit config' : 'blocked'}`,
    `Provider: ${preview.provider ?? '(none)'}`,
    `Would send: ${preview.wouldSend ? 'yes' : 'no'}`,
  ];
  if (preview.blockedReason) lines.push(`Blocked reason: ${preview.blockedReason}`);
  lines.push('', 'Payload preview:', JSON.stringify(preview.payload, null, 2), '', 'Metadata:', JSON.stringify(preview.metadata, null, 2));
  return `${lines.join('\n')}\n`;
}
